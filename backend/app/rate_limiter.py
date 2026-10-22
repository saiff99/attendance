import time
import threading
from typing import Optional, Dict, Any, List
from fastapi import HTTPException
from app.config import supabase

# Thread lock for in-process memory operations
_mem_lock = threading.Lock()

# L1 In-Memory Caches for sub-millisecond fast lookups and degraded fail-closed shield
_memory_dev_locks: Dict[str, str] = {} # "session_id:device_id" -> clean_roll
_memory_selfie_limits: Dict[str, List[float]] = {} # "ip:roll" -> [timestamp, ...]
_memory_selfie_ip_limits: Dict[str, List[float]] = {} # "ip" -> [timestamp, ...] (Global IP ceiling)
_memory_lookup_limits: Dict[str, List[float]] = {} # "ip" -> [timestamp, ...]
_memory_fail_cooldowns: Dict[str, Dict[str, Any]] = {} # "session_id:roll:ip" -> {"fails": int, "locked_until": float}


# ==============================================================================
# 1. Device Lock Registry (Shared & Persistent)
# Enforces: 1 mobile device per student per lecture session.
# Prevents proxy attendance across multiple workers and survives server restarts.
# ==============================================================================

def check_device_lock(session_id: str, device_id: Optional[str], clean_roll: str) -> None:
    """
    Verifies that the physical device has not already been used by another student in this session.
    Checks L1 memory cache first, then queries L2 shared database (settings table).
    """
    if not device_id or not device_id.strip():
        return

    clean_dev = device_id.strip()
    clean_r = clean_roll.strip().upper()
    lock_key = f"devlock:{session_id}:{clean_dev}"
    mem_key = f"{session_id}:{clean_dev}"

    # 1. Check L1 Memory Cache
    with _mem_lock:
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
                    with _mem_lock:
                        _memory_dev_locks[mem_key] = db_roll

                    if db_roll != clean_r:
                        raise HTTPException(
                            status_code=403,
                            detail=f"Device Lock: This phone/device has already submitted attendance for Roll '{db_roll}' in this session. One device cannot be used for multiple students."
                        )
        except HTTPException:
            raise
        except Exception as e:
            # Graceful Fallback: Log warning and continue using memory cache
            print(f"[DeviceLock Warning] L2 DB check fallback: {e}")


def record_device_lock(session_id: str, device_id: Optional[str], clean_roll: str) -> None:
    """
    Locks the physical device to the given student roll for the session.
    Persists to both L1 in-memory cache and L2 shared database.
    """
    if not device_id or not device_id.strip():
        return

    clean_dev = device_id.strip()
    clean_r = clean_roll.strip().upper()
    lock_key = f"devlock:{session_id}:{clean_dev}"
    mem_key = f"{session_id}:{clean_dev}"
    now_ts = time.time()

    # 1. Update L1 Memory Cache
    with _mem_lock:
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
# 2. Failed Face Verification Attempt Tracker (Shared & Persistent)
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

    lock_info: Dict[str, Any] = {"fails": 0, "locked_until": 0.0}

    # 1. Check L1 Memory Cache
    with _mem_lock:
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
                # Take the higher (most restrictive) lock
                if db_locked_until > lock_info.get("locked_until", 0.0) or db_fails > lock_info.get("fails", 0):
                    lock_info = {"fails": db_fails, "locked_until": db_locked_until}
                    with _mem_lock:
                        _memory_fail_cooldowns[mem_key] = lock_info
        except Exception as e:
            print(f"[FailCooldown Warning] L2 DB lookup fallback: {e}")

    # 3. Enforce Cooldown if active
    if now_ts < lock_info.get("locked_until", 0.0):
        wait_seconds = int(lock_info["locked_until"] - now_ts)
        raise HTTPException(
            status_code=429,
            detail=f"Cooldown active: 3 failed face attempts recorded for Roll '{clean_roll}' on this device. Please wait {wait_seconds}s."
        )

    return lock_info


def record_face_failure(session_id: str, clean_roll: str, client_ip: str, current_fails: int) -> None:
    """
    Records a failed face match. If fails reach 3, activates 120s lockout cooldown.
    Persists atomically to L1 cache and L2 database.
    """
    clean_r = clean_roll.strip().upper()
    mem_key = f"{session_id}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{session_id}:{clean_r}:{client_ip}"
    now_ts = time.time()

    new_fails = current_fails + 1
    locked_until = 0.0
    if new_fails >= 3:
        locked_until = now_ts + 120.0 # 2-minute cooldown

    record = {"fails": new_fails, "locked_until": locked_until, "updated_at": now_ts}

    # 1. Update L1 Memory Cache
    with _mem_lock:
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
            detail=f"Face mismatch! 3 consecutive failed attempts recorded for Roll '{clean_roll}'. Temporary cooldown active for 2 minutes."
        )


def clear_face_failure(session_id: str, clean_roll: str, client_ip: str) -> None:
    """
    Resets failure counters on successful face match.
    Purges from both L1 memory cache and L2 database.
    """
    clean_r = clean_roll.strip().upper()
    mem_key = f"{session_id}:{clean_r}:{client_ip}"
    db_key = f"rl_fail:{session_id}:{clean_r}:{client_ip}"

    # 1. Clear from L1 Memory Cache
    with _mem_lock:
        _memory_fail_cooldowns.pop(mem_key, None)

    # 2. Clear from L2 Database
    if supabase:
        try:
            supabase.table("settings").delete().eq("key", db_key).execute()
        except Exception as e:
            print(f"[FailCooldown Warning] L2 DB clear fallback: {e}")


# ==============================================================================
# 3. Anti-Bruteforce Selfie Rate Limiter (Shared & Persistent)
# Enforces: Max 5 attempts per (client_ip + student_roll) within 60 seconds.
# ==============================================================================

def check_selfie_rate_limit(client_ip: str, clean_roll: str) -> None:
    """
    Limits selfie attendance verification calls to 5 attempts per 60s per (IP, Roll).
    Synchronizes state across workers via L2 settings table.
    """
    clean_r = clean_roll.strip().upper()
    rate_key = f"{client_ip}:{clean_r}"
    db_key = f"rl_selfie:{rate_key}"
    now_ts = time.time()
    window_seconds = 60.0
    max_attempts = 5

    # 1. Read attempts from L1 cache
    with _mem_lock:
        attempts = _memory_selfie_limits.get(rate_key, [])

    # 2. Sync with L2 Database
    if supabase:
        try:
            res = supabase.table("settings").select("value").eq("key", db_key).execute()
            if res.data and len(res.data) > 0:
                val = res.data[0].get("value") or {}
                db_attempts = val.get("attempts") or []
                if isinstance(db_attempts, list):
                    # Combine unique timestamps
                    all_ts = set(attempts).union(set(float(t) for t in db_attempts))
                    attempts = sorted(list(all_ts))
        except Exception as e:
            print(f"[SelfieRateLimit Warning] L2 DB lookup fallback: {e}")

    # 3. Prune old timestamps
    attempts = [ts for ts in attempts if now_ts - ts < window_seconds]

    if len(attempts) >= max_attempts:
        with _mem_lock:
            _memory_selfie_limits[rate_key] = attempts
        raise HTTPException(
            status_code=429,
            detail="Too many verification attempts. Please wait 60 seconds before trying again."
        )

    # 4. Add current attempt and save
    attempts.append(now_ts)
    with _mem_lock:
        _memory_selfie_limits[rate_key] = attempts

    if supabase:
        try:
            supabase.table("settings").upsert({
                "key": db_key,
                "value": {
                    "attempts": attempts,
                    "updated_at": now_ts
                }
            }).execute()
        except Exception as e:
            print(f"[SelfieRateLimit Warning] L2 DB upsert fallback: {e}")


# ==============================================================================
# 4. Anti-Scraping Student Roll Lookup Rate Limiter (Shared & Persistent)
# Enforces: Max 10 lookups per IP within 60 seconds.
# ==============================================================================

def check_lookup_rate_limit(client_ip: str) -> None:
    """
    Limits student roll lookup API to 10 calls per IP per 60 seconds to prevent scraping.
    Synchronizes state across workers via L2 settings table.
    """
    db_key = f"rl_lookup:{client_ip}"
    now_ts = time.time()
    window_seconds = 60.0
    max_attempts = 10

    # 1. Read attempts from L1 cache
    with _mem_lock:
        attempts = _memory_lookup_limits.get(client_ip, [])

    # 2. Sync with L2 Database
    if supabase:
        try:
            res = supabase.table("settings").select("value").eq("key", db_key).execute()
            if res.data and len(res.data) > 0:
                val = res.data[0].get("value") or {}
                db_attempts = val.get("attempts") or []
                if isinstance(db_attempts, list):
                    all_ts = set(attempts).union(set(float(t) for t in db_attempts))
                    attempts = sorted(list(all_ts))
        except Exception as e:
            print(f"[LookupRateLimit Warning] L2 DB lookup fallback: {e}")

    # 3. Prune old timestamps
    attempts = [ts for ts in attempts if now_ts - ts < window_seconds]

    if len(attempts) >= max_attempts:
        with _mem_lock:
            _memory_lookup_limits[client_ip] = attempts
        raise HTTPException(
            status_code=429,
            detail="Too many student lookup requests. Please wait 60 seconds."
        )

    # 4. Add current attempt and save
    attempts.append(now_ts)
    with _mem_lock:
        _memory_lookup_limits[client_ip] = attempts

    if supabase:
        try:
            supabase.table("settings").upsert({
                "key": db_key,
                "value": {
                    "attempts": attempts,
                    "updated_at": now_ts
                }
            }).execute()
        except Exception as e:
            print(f"[LookupRateLimit Warning] L2 DB upsert fallback: {e}")


# ==============================================================================
# 5. Public Selfie IP Flood Protection (Shared & Persistent)
# Enforces: Max 20 selfie attempts per IP within 60 seconds (across all student rolls).
# Protects heavy InsightFace AI neural inference from CPU/GPU exhaustion DoS attacks.
# ==============================================================================

def check_public_selfie_ip_limit(client_ip: str) -> None:
    """
    Limits total selfie attendance submissions from any single IP to 20 calls per 60 seconds.
    Prevents scripted flood attacks using randomized rolls against the AI vision model.
    """
    db_key = f"rl_selfie_ip:{client_ip}"
    now_ts = time.time()
    window_seconds = 60.0
    max_attempts = 20

    # 1. Read attempts from L1 cache
    with _mem_lock:
        attempts = _memory_selfie_ip_limits.get(client_ip, [])

    # 2. Sync with L2 Database
    if supabase:
        try:
            res = supabase.table("settings").select("value").eq("key", db_key).execute()
            if res.data and len(res.data) > 0:
                val = res.data[0].get("value") or {}
                db_attempts = val.get("attempts") or []
                if isinstance(db_attempts, list):
                    all_ts = set(attempts).union(set(float(t) for t in db_attempts))
                    attempts = sorted(list(all_ts))
        except Exception as e:
            print(f"[SelfieIPLimit Warning] L2 DB lookup fallback: {e}")

    # 3. Prune old timestamps
    attempts = [ts for ts in attempts if now_ts - ts < window_seconds]

    if len(attempts) >= max_attempts:
        with _mem_lock:
            _memory_selfie_ip_limits[client_ip] = attempts
        raise HTTPException(
            status_code=429,
            detail="Too many selfie verification requests from this IP address. Please wait 60 seconds."
        )

    # 4. Add current attempt and save
    attempts.append(now_ts)
    with _mem_lock:
        _memory_selfie_ip_limits[client_ip] = attempts

    if supabase:
        try:
            supabase.table("settings").upsert({
                "key": db_key,
                "value": {
                    "attempts": attempts,
                    "updated_at": now_ts
                }
            }).execute()
        except Exception as e:
            print(f"[SelfieIPLimit Warning] L2 DB upsert fallback: {e}")

