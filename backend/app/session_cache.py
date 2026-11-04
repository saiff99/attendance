import os
import time
import logging
import threading
from typing import Optional, Dict, Any, Tuple

from app.config import supabase, safe_db_execute

logger = logging.getLogger(__name__)

# Configurable TTL: Default 30.0 seconds
# Protects Supabase against 150-student concurrent check-in bursts while bounding staleness
SESSION_METADATA_CACHE_TTL_SECONDS = float(os.getenv("SESSION_METADATA_CACHE_TTL_SECONDS", "30.0"))

_session_cache_lock = threading.Lock()
# Mapping of session_id -> (session_dict, cached_timestamp)
_session_metadata_cache: Dict[str, Tuple[Dict[str, Any], float]] = {}


def get_cached_session_metadata(
    session_id: str,
    force_refresh: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Retrieves session metadata (id, class_name, start_time, created_at, target_academic_year,
    is_archived, instructor_name) with thread-safe in-memory caching (30s TTL).
    
    Eliminates hundreds of redundant SQL round-trips during concurrent student check-ins
    across /api/session-info, /api/verify-selfie, and /api/process-attendance.
    Provides fault-tolerant fallback to last-known cached data if the database experiences
    a transient network glitch.
    """
    global _session_metadata_cache

    if not session_id or not isinstance(session_id, str):
        return None

    clean_id = session_id.strip()
    if not clean_id:
        return None
    now = time.time()

    # Fast path: check read cache without lock
    cached_entry = _session_metadata_cache.get(clean_id)
    if not force_refresh and cached_entry is not None:
        sess_data, ts = cached_entry
        if (now - ts) < SESSION_METADATA_CACHE_TTL_SECONDS:
            return sess_data.copy()

    with _session_cache_lock:
        now = time.time()
        # Double-checked locking
        cached_entry = _session_metadata_cache.get(clean_id)
        if not force_refresh and cached_entry is not None:
            sess_data, ts = cached_entry
            if (now - ts) < SESSION_METADATA_CACHE_TTL_SECONDS:
                return sess_data.copy()

        sess_obj = None
        try:
            if supabase:
                query = supabase.table("sessions").select(
                    "id, class_name, start_time, created_at, target_academic_year, is_archived, instructor_name"
                ).eq("id", clean_id)
                res = safe_db_execute(query) or query.execute()
                if res and res.data:
                    sess_obj = res.data[0]
        except Exception as err:
            logger.warning(f"[SessionCache] Database query error for session {clean_id}: {err}")

        if sess_obj is not None:
            _session_metadata_cache[clean_id] = (sess_obj, now)
            return sess_obj.copy()

        # Fault-tolerance: if DB failed or returned error, serve stale cached copy if available
        if cached_entry is not None:
            logger.info(f"[SessionCache] Serving stale in-memory metadata for session {clean_id} due to DB error.")
            return cached_entry[0].copy()

        return None


def invalidate_backend_session_cache(session_id: Optional[str] = None) -> None:
    """
    Invalidates in-memory session metadata cache.
    If session_id is provided, removes that session specifically;
    otherwise clears the entire session metadata cache.
    """
    global _session_metadata_cache
    with _session_cache_lock:
        if session_id:
            clean_id = session_id.strip()
            _session_metadata_cache.pop(clean_id, None)
        else:
            _session_metadata_cache.clear()
