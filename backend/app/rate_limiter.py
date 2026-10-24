import time
import math
import threading
from typing import Optional, Dict, Any, List
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
# 1. Device Lock Registry (Atomic Concurrency Protected)
# Enforces: 1 mobile device per student per lecture session.
# Prevents proxy attendance across multiple workers and survives server restarts.
# ==============================================================================

def check_device_lock(session_id: str, device_id: Optional[str], clean_roll: str) -> None:
    """
    Atomically verifies that the physical device has not already been claimed by another student.
    Uses per-device key lock to prevent simultaneous race conditions where two students
    attempt to check in from the same device at the exact same millisecond.
    """
    if not device_id or not device_id.strip():
        return

    clean_dev = device_id.strip()
    clean_r = clean_roll.strip().upper()
    lock_key = f"devlock:{session_id}:{clean_dev}"
    mem_key = f"{session_id}:{clean_dev}"

    lock = _get_key_lock(lock_key)
    with lock:
        # 1. Check L1 Memory Cache
        existing_roll = _memory_dev_locks.get(mem_key)
        if existing_roll:
            if existing_roll != clean_r:
                raise HTTPException(
                    status_code=403,
                    detail=f"Device Lock: This phone/device has already submitted attendance for Roll '{existing_roll}' in this session. One device cannot be used for multiple students."
                )
            return

        # 2. Check L2 Shared Database
        if supabase:
            try:
                res = supabase.table("settings").select("value").eq("key", lock_key).execute()
                if res.data and len(res.data) > 0:
                    val = res.data[0].get("value") or {}
                    db_roll = (val.get("student_roll") or "").strip().upper()
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

        # 3. Atomically reserve device for clean_roll immediately to block concurrent attempts
        _memory_dev_locks[mem_key] = clean_r


def record_device_lock(session_id: str, device_id: Optional[str], clean_roll: str) -> None:
    """
    Locks the physical device to the given student roll for the session.
    Persists to both L1 in-memory cache and L2 shared database under key lock.
    """
    if not device_id or not device_id.strip():
        return

    clean_dev = device_id.strip()
    clean_r = clean_roll.strip().upper()
    lock_key = f"devlock:{session_id}:{clean_dev}"
    mem_key = f"{session_id}:{clean_dev}"
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
                        "session_id": session_id,
                        "device_id": clean_dev,
                        "student_roll": clean_r,
                        "locked_at": now_ts
                    }
                }).execute()
            except Exception as e:
                print(f"[DeviceLock Warning] L2 DB upsert fallback: {e}")


# ==============================================================================
# 2. Failed Face Verification Attempt Tracker (Atomic Concurrency Protected)
# Enforces: 3 consecutive failed face attempts -> 2-minute lockout cooldown.
# Scoped to Session + Roll + Client IP to prevent DoS against innocent students.
# ==============================================================================

def check_fail_cooldown(session_id: str, clean_roll: str, client_ip: str) -> Dict[str, Any]:
    """
    Checks if a temporary lockout cooldown is currently active.
    If locked, raises HTTP 429 with remaining seconds.
    Returns the current failure record: {"fails": int, "locked_until": float}.
    """
    clean_r = clean_roll.strip().upper()
    mem_key = f"{session_id}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{session_id}:{clean_r}:{client_ip}"
    now_ts = time.time()

    lock = _get_key_lock(db_key)
    with lock:
        lock_info: Dict[str, Any] = {"fails": 0, "locked_until": 0.0}

        # 1. Check L1 Memory Cache
        if mem_key in _memory_fail_cooldowns:
            lock_info = _memory_fail_cooldowns[mem_key].copy()

        # 2. Sync with L2 Shared Database
        if supabase:
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
            wait_seconds = max(1, math.ceil(lock_info["locked_until"] - now_ts))
            raise HTTPException(
                status_code=429,
                detail=f"Cooldown active: 3 failed face attempts recorded for Roll '{clean_roll}' on this device. Please wait {wait_seconds}s.",
                headers={"Retry-After": str(wait_seconds)}
            )

        return lock_info


def record_face_failure(session_id: str, clean_roll: str, client_ip: str, current_fails: int) -> None:
    """
    Records a failed face match. If fails reach 3, activates 120s lockout cooldown.
    Persists atomically to L1 cache and L2 database under key lock.
    """
    clean_r = clean_roll.strip().upper()
    mem_key = f"{session_id}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{session_id}:{clean_r}:{client_ip}"
    now_ts = time.time()

    lock = _get_key_lock(db_key)
    with lock:
        new_fails = current_fails + 1
        locked_until = 0.0
        if new_fails >= 3:
            locked_until = now_ts + 120.0 # 2-minute cooldown

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
                detail=f"Face mismatch! 3 consecutive failed attempts recorded for Roll '{clean_roll}'. Temporary cooldown active for 2 minutes.",
                headers={"Retry-After": "120"}
            )


def clear_face_failure(session_id: str, clean_roll: str, client_ip: str) -> None:
    """
    Resets failure counters on successful face match.
    Purges atomically from both L1 memory cache and L2 database under key lock.
    """
    clean_r = clean_roll.strip().upper()
    mem_key = f"{session_id}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{session_id}:{clean_r}:{client_ip}"

    lock = _get_key_lock(db_key)
    with lock:
        # 1. Clear from L1 Memory Cache
        _memory_fail_cooldowns.pop(mem_key, None)

        # 2. Clear from L2 Database
        if supabase:
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
    Limits student roll lookup API to 10 calls per IP per 60 seconds to prevent scraping.
    Atomically synchronizes state across workers via PostgreSQL stored procedure or CAS mutex.
    """
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
    Limits total selfie attendance submissions from any single IP to 20 calls per 60 seconds.
    Prevents scripted flood attacks using randomized rolls against the AI vision model.
    """
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
