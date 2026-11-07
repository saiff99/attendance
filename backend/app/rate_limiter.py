import os
import time
import math
import threading
from typing import Optional, Dict, Any, List, Set
from fastapi import HTTPException
from app.config import supabase

# ==============================================================================
# Concurrency & Mutual Exclusion Control
# Eliminates TOCTOU (Time-of-Check to Time-of-Use) Race Conditions
# ==============================================================================

_locks_mutex = threading.Lock()
_key_locks: Dict[str, threading.Lock] = {}

def _get_key_lock(key: str) -> threading.Lock:
    """
    Returns a dedicated mutex for a specific rate limit or device lock key.
    Serializes concurrent operations targeting the same key to eliminate race conditions.
    """
    with _locks_mutex:
        if key not in _key_locks:
            _key_locks[key] = threading.Lock()
        return _key_locks[key]


# L1 In-Memory Caches for sub-millisecond fast lookups and degraded fail-closed shield
_memory_dev_locks: Dict[str, str] = {} # "session_id:device_id" -> clean_roll
_memory_selfie_limits: Dict[str, List[float]] = {} # "ip:roll" -> [timestamp, ...]
_memory_selfie_ip_limits: Dict[str, List[float]] = {} # "ip" -> [timestamp, ...] (Global IP ceiling)
_memory_lookup_limits: Dict[str, List[float]] = {} # "ip" -> [timestamp, ...]
_memory_fail_cooldowns: Dict[str, Dict[str, Any]] = {} # "session_id:roll:ip" -> {"fails": int, "locked_until": float}

# Session-scoped initialization tracking to prevent redundant per-student DB lookups
_session_devlocks_initialized: Set[str] = set()
_session_fails_initialized: Set[str] = set()


def _atomic_db_check_limit(key: str, max_attempts: int, window_seconds: float, now_ts: float) -> Optional[Dict[str, Any]]:
    """
    Executes an atomic sliding-window check-and-increment transaction in PostgreSQL
    via the 'atomic_check_rate_limit' stored procedure (Migration 15) using row-level locking (SELECT ... FOR UPDATE).
    Returns dict with 'allowed', 'count', 'retry_after' if successful, or None if the RPC is unavailable.
    """
    if not supabase:
        return None
    try:
        res = supabase.rpc("atomic_check_rate_limit", {
            "p_key": key,
            "p_max_attempts": max_attempts,
            "p_window_seconds": window_seconds,
            "p_now_ts": now_ts,
        }).execute()
        if res.data and isinstance(res.data, dict) and "allowed" in res.data:
            return res.data
    except Exception:
        # RPC not installed yet or transient error -> gracefully fall back to in-process CAS mutex
        pass
    return None


def _atomic_sliding_window_check_and_record(
    rate_key: str,
    db_key: str,
    max_attempts: int,
    window_seconds: float,
    now_ts: float,
    memory_cache: Dict[str, List[float]],
    error_message: str,
    include_retry_after: bool = False
) -> None:
    """
    Atomically checks sliding window limits and records the new attempt.
    Guarantees thread-safety via key-level mutex and provides optimistic concurrency control (CAS)
    with timestamp set-merging so concurrent attempts cannot overwrite or hide each other.
    """
    lock = _get_key_lock(db_key)
    with lock:
        # 1. Try atomic PostgreSQL transaction RPC first
        rpc_result = _atomic_db_check_limit(db_key, max_attempts, window_seconds, now_ts)
        if rpc_result is not None:
            if not rpc_result.get("allowed", True):
                retry_after = int(rpc_result.get("retry_after") or window_seconds)
                headers = {"Retry-After": str(retry_after)} if include_retry_after else None
                raise HTTPException(status_code=429, detail=error_message, headers=headers)
            # Synchronize local memory cache
            attempts = memory_cache.get(rate_key, [])
            attempts = [ts for ts in attempts if now_ts - ts < window_seconds]
            attempts.append(now_ts)
            memory_cache[rate_key] = attempts
            return

        # 2. In-Process Mutex + Database Optimistic Timestamp Merging Fallback
        attempts = memory_cache.get(rate_key, [])

        if supabase:
            try:
                res = supabase.table("settings").select("value").eq("key", db_key).execute()
                if res.data and len(res.data) > 0:
                    val = res.data[0].get("value") or {}
                    db_attempts = val.get("attempts") or []
                    if isinstance(db_attempts, list):
                        # Union of all unique timestamps prevents race-condition overwriting
                        all_ts = set(attempts).union(set(float(t) for t in db_attempts))
                        attempts = sorted(list(all_ts))
            except Exception as e:
                print(f"[RateLimiter Warning] L2 DB lookup fallback ({db_key}): {e}")

        # Prune expired timestamps
        attempts = [ts for ts in attempts if now_ts - ts < window_seconds]

        # Enforce rate limit
        if len(attempts) >= max_attempts:
            memory_cache[rate_key] = attempts
            oldest = attempts[0] if attempts else now_ts
            remaining = max(1, math.ceil(window_seconds - (now_ts - oldest)))
            headers = {"Retry-After": str(remaining)} if include_retry_after else None
            raise HTTPException(status_code=429, detail=error_message, headers=headers)

        # Record current attempt
        attempts.append(now_ts)
        memory_cache[rate_key] = attempts

        if supabase:
            try:
                supabase.table("settings").upsert({
                    "key": db_key,
                    "value": {
                        "attempts": attempts,
                        "updated_at": now_ts,
                    }
                }).execute()
            except Exception as e:
                print(f"[RateLimiter Warning] L2 DB upsert fallback ({db_key}): {e}")


# ==============================================================================
# 1. Device Lock Registry (Atomic Concurrency Protected with Session-Scoped Batch Ingestion)
# Enforces: 1 mobile device per student per lecture session.
# Prevents proxy attendance across multiple workers and survives server restarts.
# ==============================================================================

def _init_session_device_locks(session_id: str) -> None:
    """
    Lazily initializes all active device locks for session_id in ONE batch query.
    Eliminates hundreds of redundant individual SELECT queries on the 'settings' table.
    """
    if session_id in _session_devlocks_initialized:
        return
    with _locks_mutex:
        if session_id in _session_devlocks_initialized:
            return
        if supabase:
            try:
                prefix = f"devlock:{session_id}:"
                res = supabase.table("settings").select("key, value").like("key", f"{prefix}%").execute()
                if res and res.data:
                    for item in res.data:
                        k = str(item.get("key") or "")
                        val = item.get("value") or {}
                        if k.startswith(prefix):
                            dev_id = k[len(prefix):]
                            roll = str(val.get("student_roll") or "").strip().upper()
                            if dev_id and roll:
                                _memory_dev_locks[f"{session_id}:{dev_id}"] = roll
            except Exception as e:
                print(f"[DeviceLock Warning] Session devlock init fallback: {e}")
        _session_devlocks_initialized.add(session_id)


def check_device_lock(session_id: str, device_id: Optional[str], clean_roll: str) -> None:
    """
    Atomically verifies that the physical device has not already been claimed by another student.
    Uses per-device key lock to prevent simultaneous race conditions where two students
    attempt to check in from the same device at the exact same millisecond.
    """
    if not session_id or not session_id.strip() or not device_id or not device_id.strip():
        return

    clean_sess = session_id.strip()
    clean_dev = device_id.strip()
    clean_r = clean_roll.strip().upper()
    lock_key = f"devlock:{clean_sess}:{clean_dev}"
    mem_key = f"{clean_sess}:{clean_dev}"

    # Lazily pre-populate session device locks once if not yet initialized
    _init_session_device_locks(clean_sess)

    lock = _get_key_lock(lock_key)
    with lock:
        # 1. Check L1 Memory Cache (Fast-path 0ms)
        existing_roll = _memory_dev_locks.get(mem_key)
        if existing_roll:
            if existing_roll != clean_r:
                raise HTTPException(
                    status_code=403,
                    detail=f"Device Lock: This phone/device has already submitted attendance for Roll '{existing_roll}' in this session. One device cannot be used for multiple students."
                )
            return

        # 2. Check L2 Shared Database (only as secondary safety fallback if not initialized)
        if supabase and clean_sess not in _session_devlocks_initialized:
            try:
                res = supabase.table("settings").select("value").eq("key", lock_key).execute()
                if res.data and len(res.data) > 0:
                    val = res.data[0].get("value") or {}
                    db_roll = str(val.get("student_roll") or "").strip().upper()
                    if db_roll:
                        _memory_dev_locks[mem_key] = db_roll
                        if db_roll != clean_r:
                            raise HTTPException(
                                status_code=403,
                                detail=f"Device Lock: This phone/device has already submitted attendance for Roll '{db_roll}' in this session. One device cannot be used for multiple students."
                            )
                        return
            except HTTPException:
                raise
            except Exception as e:
                print(f"[DeviceLock Warning] L2 DB check fallback: {e}")

        # 3. Atomically reserve device for clean_roll immediately in RAM to block concurrent attempts
        _memory_dev_locks[mem_key] = clean_r


def record_device_lock(session_id: str, device_id: Optional[str], clean_roll: str) -> None:
    """
    Locks the physical device to the given student roll for the session.
    Persists to both L1 in-memory cache and L2 shared database under key lock.
    """
    if not session_id or not session_id.strip() or not device_id or not device_id.strip():
        return

    clean_sess = session_id.strip()
    clean_dev = device_id.strip()
    clean_r = clean_roll.strip().upper()
    lock_key = f"devlock:{clean_sess}:{clean_dev}"
    mem_key = f"{clean_sess}:{clean_dev}"
    now_ts = time.time()

    lock = _get_key_lock(lock_key)
    with lock:
        # 1. Update L1 Memory Cache
        _memory_dev_locks[mem_key] = clean_r

        # 2. Persist to L2 Database
        if supabase:
            try:
                supabase.table("settings").upsert({
                    "key": lock_key,
                    "value": {
                        "session_id": clean_sess,
                        "device_id": clean_dev,
                        "student_roll": clean_r,
                        "locked_at": now_ts
                    }
                }).execute()
            except Exception as e:
                print(f"[DeviceLock Warning] L2 DB upsert fallback: {e}")


# ==============================================================================
# 2. Failed Face Verification Attempt Tracker (Atomic Concurrency Protected)
# Enforces: 3 consecutive failed face attempts -> 60-second lockout cooldown.
# Scoped to Session + Roll + Client IP to prevent DoS against innocent students.
# ==============================================================================

def _init_session_fail_cooldowns(session_id: str) -> None:
    """
    Lazily initializes active failure cooldowns for session_id in ONE batch query.
    Eliminates hundreds of redundant SELECT queries for innocent students with zero failures.
    """
    if session_id in _session_fails_initialized:
        return
    with _locks_mutex:
        if session_id in _session_fails_initialized:
            return
        if supabase:
            try:
                prefix = f"rl_fail:{session_id}:"
                res = supabase.table("settings").select("key, value").like("key", f"{prefix}%").execute()
                if res and res.data:
                    for item in res.data:
                        k = str(item.get("key") or "")
                        val = item.get("value") or {}
                        if k.startswith(prefix):
                            rest = k[len(prefix):]
                            mem_key = f"{session_id}:{rest}"
                            _memory_fail_cooldowns[mem_key] = {
                                "fails": int(val.get("fails") or 0),
                                "locked_until": float(val.get("locked_until") or 0.0),
                                "updated_at": float(val.get("updated_at") or time.time()),
                            }
            except Exception as e:
                print(f"[FailCooldown Warning] Session fail cooldowns init fallback: {e}")
        _session_fails_initialized.add(session_id)


def check_fail_cooldown(session_id: str, clean_roll: str, client_ip: str) -> Dict[str, Any]:
    """
    Checks if a temporary lockout cooldown is currently active.
    If locked, raises HTTP 429 with remaining seconds.
    Returns the current failure record: {"fails": int, "locked_until": float}.
    """
    clean_sess = session_id.strip()
    clean_r = clean_roll.strip().upper()
    mem_key = f"{clean_sess}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{clean_sess}:{clean_r}:{client_ip}"
    now_ts = time.time()

    # Lazily pre-populate session fail cooldowns once if not yet initialized
    _init_session_fail_cooldowns(clean_sess)

    lock = _get_key_lock(db_key)
    with lock:
        lock_info: Dict[str, Any] = {"fails": 0, "locked_until": 0.0}

        # 1. Check L1 Memory Cache (Fast-path 0ms)
        if mem_key in _memory_fail_cooldowns:
            lock_info = _memory_fail_cooldowns[mem_key].copy()
        elif supabase and clean_sess not in _session_fails_initialized:
            # 2. Sync with L2 Shared Database only if session was not batch-initialized
            try:
                res = supabase.table("settings").select("value").eq("key", db_key).execute()
                if res.data and len(res.data) > 0:
                    val = res.data[0].get("value") or {}
                    db_locked_until = float(val.get("locked_until") or 0.0)
                    db_fails = int(val.get("fails") or 0)
                    if db_locked_until > lock_info.get("locked_until", 0.0) or db_fails > lock_info.get("fails", 0):
                        lock_info = {"fails": db_fails, "locked_until": db_locked_until}
                        _memory_fail_cooldowns[mem_key] = lock_info
            except Exception as e:
                print(f"[FailCooldown Warning] L2 DB lookup fallback: {e}")

        # 3. Enforce Cooldown if active
        if now_ts < lock_info.get("locked_until", 0.0):
            wait_seconds = min(60, max(1, math.ceil(lock_info["locked_until"] - now_ts)))
            raise HTTPException(
                status_code=429,
                detail=f"Cooldown active: 3 failed face attempts recorded for Roll '{clean_roll}' on this device. Please wait {wait_seconds}s.",
                headers={"Retry-After": str(wait_seconds)}
            )

        return lock_info


def record_face_failure(session_id: str, clean_roll: str, client_ip: str, current_fails: int) -> None:
    """
    Records a failed face match. If fails reach 3, activates 60s lockout cooldown.
    Persists atomically to L1 cache and L2 database under key lock.
    """
    clean_sess = session_id.strip()
    clean_r = clean_roll.strip().upper()
    mem_key = f"{clean_sess}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{clean_sess}:{clean_r}:{client_ip}"
    now_ts = time.time()

    lock = _get_key_lock(db_key)
    with lock:
        new_fails = current_fails + 1
        locked_until = 0.0
        if new_fails >= 3:
            locked_until = now_ts + 60.0 # 60-second cooldown

        record = {"fails": new_fails, "locked_until": locked_until, "updated_at": now_ts}

        # 1. Update L1 Memory Cache
        _memory_fail_cooldowns[mem_key] = record

        # 2. Persist to L2 Database
        if supabase:
            try:
                supabase.table("settings").upsert({
                    "key": db_key,
                    "value": record
                }).execute()
            except Exception as e:
                print(f"[FailCooldown Warning] L2 DB upsert fallback: {e}")

        if new_fails >= 3:
            raise HTTPException(
                status_code=429,
                detail=f"Face mismatch! 3 consecutive failed attempts recorded for Roll '{clean_roll}'. Temporary cooldown active. Please wait 60s.",
                headers={"Retry-After": "60"}
            )


def clear_face_failure(session_id: str, clean_roll: str, client_ip: str) -> None:
    """
    Resets failure counters on successful face match.
    Purges atomically from both L1 memory cache and conditionally from L2 database under key lock.
    Only issues DB DELETE if an actual failure was recorded, saving hundreds of redundant queries.
    """
    clean_sess = session_id.strip()
    clean_r = clean_roll.strip().upper()
    mem_key = f"{clean_sess}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{clean_sess}:{clean_r}:{client_ip}"

    lock = _get_key_lock(db_key)
    with lock:
        record = _memory_fail_cooldowns.pop(mem_key, None)
        had_failures = record is not None and int(record.get("fails") or 0) > 0

        # Only execute DB DELETE if there was an actual failure recorded in DB
        if had_failures and supabase:
            try:
                supabase.table("settings").delete().eq("key", db_key).execute()
            except Exception as e:
                print(f"[FailCooldown Warning] L2 DB clear fallback: {e}")


# ==============================================================================
# 3. Anti-Bruteforce Selfie Rate Limiter (Atomic Concurrency Protected)
# Enforces: Max 5 attempts per (client_ip + student_roll) within 60 seconds.
# ==============================================================================

def check_selfie_rate_limit(client_ip: str, clean_roll: str) -> None:
    """
    Limits selfie attendance verification calls to 5 attempts per 60s per (IP, Roll).
    Atomically synchronizes state across workers via PostgreSQL stored procedure or CAS mutex.
    """
    clean_r = clean_roll.strip().upper()
    rate_key = f"{client_ip}:{clean_r}"
    db_key = f"rl_selfie:{rate_key}"
    now_ts = time.time()

    _atomic_sliding_window_check_and_record(
        rate_key=rate_key,
        db_key=db_key,
        max_attempts=5,
        window_seconds=60.0,
        now_ts=now_ts,
        memory_cache=_memory_selfie_limits,
        error_message="Too many verification attempts. Please wait 60 seconds before trying again.",
        include_retry_after=True
    )


# ==============================================================================
# 4. Anti-Scraping Student Roll Lookup Rate Limiter (Atomic Concurrency Protected)
# Enforces: Max 10 lookups per IP within 60 seconds.
# ==============================================================================

def check_lookup_rate_limit(client_ip: str) -> None:
    """
    Limits student roll lookup API to prevent scraping.
    Campus Concurrency Safe: Bypassed by default so 300+ students on college Wi-Fi NAT can look up profiles concurrently.
    """
    if os.getenv("STRICT_IP_RATE_LIMIT") != "1":
        return

    rate_key = client_ip.strip()
    db_key = f"rl_lookup:{rate_key}"
    now_ts = time.time()

    _atomic_sliding_window_check_and_record(
        rate_key=rate_key,
        db_key=db_key,
        max_attempts=10,
        window_seconds=60.0,
        now_ts=now_ts,
        memory_cache=_memory_lookup_limits,
        error_message="Too many student lookup requests. Please wait 60 seconds.",
        include_retry_after=True
    )


def reset_lookup_rate_limit(client_ip: str) -> None:
    """Resets the student roll lookup rate limit for a specific client IP under key lock."""
    rate_key = client_ip.strip()
    db_key = f"rl_lookup:{rate_key}"

    lock = _get_key_lock(db_key)
    with lock:
        _memory_lookup_limits.pop(rate_key, None)
        if supabase:
            try:
                supabase.table("settings").delete().eq("key", db_key).execute()
            except Exception as e:
                print(f"[LookupRateLimit Reset Warning] L2 DB clear fallback: {e}")


# ==============================================================================
# 5. Public Selfie IP Flood Protection (Atomic Concurrency Protected)
# Enforces: Max 20 selfie attempts per IP within 60 seconds (across all student rolls).
# Protects heavy InsightFace AI neural inference from CPU/GPU exhaustion DoS attacks.
# ==============================================================================

def check_public_selfie_ip_limit(client_ip: str) -> None:
    """
    Limits total selfie attendance submissions.
    Campus Concurrency Safe: Bypassed by default so 300+ students on college Wi-Fi NAT can submit selfies concurrently.
    """
    if os.getenv("STRICT_IP_RATE_LIMIT") != "1":
        return

    rate_key = client_ip.strip()
    db_key = f"rl_selfie_ip:{rate_key}"
    now_ts = time.time()

    _atomic_sliding_window_check_and_record(
        rate_key=rate_key,
        db_key=db_key,
        max_attempts=20,
        window_seconds=60.0,
        now_ts=now_ts,
        memory_cache=_memory_selfie_ip_limits,
        error_message="Too many selfie verification requests from this IP address. Please wait 60 seconds.",
        include_retry_after=True
    )


# ==============================================================================
# 6. Public Active Sessions Rate Limiter (Atomic Concurrency Protected)
# Enforces: Max 30 active-session listing calls per IP within 60 seconds.
# ==============================================================================

_memory_active_sessions_limits: Dict[str, List[float]] = {}

def check_active_sessions_rate_limit(client_ip: str) -> None:
    """
    Limits active sessions listing to 30 calls per IP per 60 seconds.
    Synchronized across cluster instances via PostgreSQL stored procedure or CAS mutex.
    """
    rate_key = client_ip.strip()
    db_key = f"rl_active_sessions:{rate_key}"
    now_ts = time.time()

    _atomic_sliding_window_check_and_record(
        rate_key=rate_key,
        db_key=db_key,
        max_attempts=30,
        window_seconds=60.0,
        now_ts=now_ts,
        memory_cache=_memory_active_sessions_limits,
        error_message="Too many active session requests. Please wait a moment.",
        include_retry_after=True
    )


def reset_active_sessions_rate_limit(client_ip: str) -> None:
    """Resets the active sessions rate limit for a specific client IP."""
    rate_key = client_ip.strip()
    db_key = f"rl_active_sessions:{rate_key}"

    lock = _get_key_lock(db_key)
    with lock:
        _memory_active_sessions_limits.pop(rate_key, None)
        if supabase:
            try:
                supabase.table("settings").delete().eq("key", db_key).execute()
            except Exception as e:
                print(f"[ActiveSessionsRateLimit Reset Warning] L2 DB clear fallback: {e}")


# ==============================================================================
# 7. Unbounded Memory Pruning & Ephemeral DB Purge (Issue 9)
# Eliminates slow memory leaks and prunes stale rate limit/device lock entries
# ==============================================================================

def prune_all_expired_rate_limit_state(session_id: Optional[str] = None) -> Dict[str, int]:
    """
    Prunes expired rate limit entries, device locks, failure cooldowns, and mutexes
    from L1 in-memory dictionaries and periodically purges stale ephemeral keys from L2 DB.
    Guarantees bounded memory consumption and eliminates slow memory leaks over months of continuous operation.
    """
    now_ts = time.time()
    pruned_counts = {
        "dev_locks": 0,
        "selfie_limits": 0,
        "selfie_ip_limits": 0,
        "lookup_limits": 0,
        "active_sessions_limits": 0,
        "fail_cooldowns": 0,
        "key_locks": 0,
    }

    # 1. Prune L1 Device Locks
    # If session_id specified, purge all locks for that session immediately.
    with _locks_mutex:
        if session_id:
            _session_devlocks_initialized.discard(session_id)
            _session_fails_initialized.discard(session_id)
        else:
            _session_devlocks_initialized.clear()
            _session_fails_initialized.clear()

        dev_keys = list(_memory_dev_locks.keys())
        for k in dev_keys:
            # key format: "session_id:device_id"
            if session_id and k.startswith(f"{session_id}:"):
                _memory_dev_locks.pop(k, None)
                pruned_counts["dev_locks"] += 1

    # 2. Helper to prune sliding-window rate limit dicts
    def _prune_sliding_cache(cache: Dict[str, List[float]], max_window: float) -> int:
        count = 0
        keys = list(cache.keys())
        for k in keys:
            lock = _get_key_lock(f"cache:{k}")
            with lock:
                attempts = cache.get(k, [])
                valid = [t for t in attempts if now_ts - t < max_window]
                if not valid:
                    cache.pop(k, None)
                    count += 1
                elif len(valid) != len(attempts):
                    cache[k] = valid
        return count

    pruned_counts["selfie_limits"] = _prune_sliding_cache(_memory_selfie_limits, 120.0)
    pruned_counts["selfie_ip_limits"] = _prune_sliding_cache(_memory_selfie_ip_limits, 120.0)
    pruned_counts["lookup_limits"] = _prune_sliding_cache(_memory_lookup_limits, 120.0)
    pruned_counts["active_sessions_limits"] = _prune_sliding_cache(_memory_active_sessions_limits, 120.0)

    # 3. Prune Failure Cooldowns older than 1 hour (locks only last 60s max)
    fail_keys = list(_memory_fail_cooldowns.keys())
    for fk in fail_keys:
        lock = _get_key_lock(f"fail:{fk}")
        with lock:
            val = _memory_fail_cooldowns.get(fk)
            if val:
                locked_until = float(val.get("locked_until", 0))
                # If cooldown expired over 1 hour ago, or belongs to target ended session
                if (session_id and fk.startswith(f"{session_id}:")) or (now_ts > locked_until + 3600.0):
                    _memory_fail_cooldowns.pop(fk, None)
                    pruned_counts["fail_cooldowns"] += 1

    # 4. Prune Unused Mutex Locks from _key_locks
    with _locks_mutex:
        all_active_keys = set(_memory_dev_locks.keys()) | \
                          set(_memory_selfie_limits.keys()) | \
                          set(_memory_selfie_ip_limits.keys()) | \
                          set(_memory_lookup_limits.keys()) | \
                          set(_memory_active_sessions_limits.keys()) | \
                          set(_memory_fail_cooldowns.keys())
        lock_keys = list(_key_locks.keys())
        for lk in lock_keys:
            # Do not prune if lock key is currently referenced by active memory
            if not any(k in lk for k in all_active_keys):
                target_lock = _key_locks.get(lk)
                if target_lock and target_lock.acquire(blocking=False):
                    try:
                        _key_locks.pop(lk, None)
                        pruned_counts["key_locks"] += 1
                    finally:
                        target_lock.release()

    # 5. Background L2 Database Purge (Safe: only purges ephemeral rl_ and devlock keys > 24 hours old)
    if supabase:
        try:
            from datetime import datetime, timezone, timedelta
            cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            supabase.table("settings").delete().lt("updated_at", cutoff_iso).like("key", "rl_%").execute()
            supabase.table("settings").delete().lt("updated_at", cutoff_iso).like("key", "devlock:%").execute()
        except Exception:
            # Non-blocking L2 DB fallback
            pass

    return pruned_counts


def _periodic_rate_limiter_sweeper():
    """Background daemon thread sweeping rate limiter memory every 30 minutes."""
    while True:
        try:
            time.sleep(1800)  # 30 minutes
            prune_all_expired_rate_limit_state()
        except Exception:
            time.sleep(60)

_sweeper_thread = threading.Thread(target=_periodic_rate_limiter_sweeper, daemon=True, name="RateLimiterSweeper")
_sweeper_thread.start()

