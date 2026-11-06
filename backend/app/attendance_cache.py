import os
import time
import logging
import threading
from typing import Optional, Dict, Any

from app.config import supabase, safe_db_execute

logger = logging.getLogger(__name__)

# Configurable TTL: Default 1 hour (3600s)
# Covers typical classroom lecture duration, automatically freeing memory after class ends
SESSION_ATTENDANCE_CACHE_TTL_SECONDS = float(
    os.getenv("SESSION_ATTENDANCE_CACHE_TTL_SECONDS", "3600.0")
)

_attendance_cache_lock = threading.Lock()

# Mapping of session_id -> { student_id: { "recorded_at": str, "confidence": float, "capture_mode": str, "cached_at": float } }
_session_attendance_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}
_session_attendance_init_ts: Dict[str, float] = {}


def _init_session_attendance_from_db(clean_sess: str) -> None:
    """
    Internal helper: Queries Supabase ONCE to fetch all existing attendance records
    for a given session_id, populating the in-memory cache.
    """
    now = time.time()
    attendee_map: Dict[str, Dict[str, Any]] = {}

    try:
        if supabase:
            query = (
                supabase.table("attendance")
                .select("student_id, recorded_at, confidence_score, capture_mode")
                .eq("session_id", clean_sess)
            )
            res = safe_db_execute(query) if hasattr(query, "execute") else None
            if res and res.data:
                for row in res.data:
                    s_id = str(row.get("student_id") or "").strip()
                    if s_id:
                        attendee_map[s_id] = {
                            "recorded_at": row.get("recorded_at") or "Earlier Today",
                            "confidence": float(row.get("confidence_score") or 0.0),
                            "capture_mode": row.get("capture_mode") or "Live Scan",
                            "cached_at": now,
                        }
    except Exception as err:
        logger.warning(
            f"[AttendanceCache] Failed to initialize session attendance for {clean_sess} from DB: {err}"
        )

    with _attendance_cache_lock:
        _session_attendance_cache[clean_sess] = attendee_map
        _session_attendance_init_ts[clean_sess] = now

    # Sync stream recognized students if camera stream is active for this session
    try:
        from app.stream import session_recognized_students
        if clean_sess in session_recognized_students:
            session_recognized_students[clean_sess].update(attendee_map.keys())
    except Exception:
        pass


def get_cached_session_attendance(
    session_id: Optional[str],
    student_id: Optional[str],
    allow_db_init: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Checks if a student has already been marked present in the given session in-memory (0ms).
    
    If the session is accessed for the first time, lazily queries Supabase ONCE to load all
    existing attendees, completely eliminating individual student SELECT queries.
    """
    if not session_id or not student_id:
        return None

    clean_sess = session_id.strip()
    clean_stu = student_id.strip()
    if not clean_sess or not clean_stu:
        return None

    now = time.time()

    # Fast-path: Check existing in-memory session cache
    with _attendance_cache_lock:
        if clean_sess in _session_attendance_cache:
            init_ts = _session_attendance_init_ts.get(clean_sess, 0.0)
            if (now - init_ts) < SESSION_ATTENDANCE_CACHE_TTL_SECONDS:
                rec = _session_attendance_cache[clean_sess].get(clean_stu)
                if rec is not None:
                    return rec.copy()
                return None

    if not allow_db_init:
        return None

    # Session not cached or TTL expired: Initialize session attendance in a single query
    _init_session_attendance_from_db(clean_sess)

    with _attendance_cache_lock:
        if clean_sess in _session_attendance_cache:
            rec = _session_attendance_cache[clean_sess].get(clean_stu)
            if rec is not None:
                return rec.copy()
        return None


def record_cached_session_attendance(
    session_id: Optional[str],
    student_id: Optional[str],
    record: Dict[str, Any]
) -> None:
    """
    Records an attendance entry into the session's in-memory cache upon successful DB insert/upsert.
    Also keeps app.stream.session_recognized_students synchronized.
    """
    if not session_id or not student_id:
        return

    clean_sess = session_id.strip()
    clean_stu = student_id.strip()
    if not clean_sess or not clean_stu:
        return

    now = time.time()
    att_entry = {
        "recorded_at": record.get("recorded_at") or time.strftime("%Y-%m-%d %H:%M:%S"),
        "confidence": float(record.get("confidence") or record.get("confidence_score") or 0.0),
        "capture_mode": record.get("capture_mode") or "Live Scan",
        "cached_at": now,
    }

    with _attendance_cache_lock:
        if clean_sess not in _session_attendance_cache:
            _session_attendance_cache[clean_sess] = {}
            _session_attendance_init_ts[clean_sess] = now
        _session_attendance_cache[clean_sess][clean_stu] = att_entry

    # Synchronize with stream recognized set
    try:
        from app.stream import session_recognized_students
        if clean_sess in session_recognized_students:
            session_recognized_students[clean_sess].add(clean_stu)
    except Exception:
        pass


def invalidate_session_attendance_cache(session_id: Optional[str] = None) -> None:
    """
    Invalidates in-memory attendance cache.
    If session_id is provided, removes that session; otherwise clears all.
    """
    with _attendance_cache_lock:
        if session_id:
            clean_sess = session_id.strip()
            _session_attendance_cache.pop(clean_sess, None)
            _session_attendance_init_ts.pop(clean_sess, None)
        else:
            _session_attendance_cache.clear()
            _session_attendance_init_ts.clear()


def get_attendance_cache_stats() -> Dict[str, Any]:
    """Returns diagnostics and metrics for the in-memory attendance cache."""
    with _attendance_cache_lock:
        total_records = sum(len(records) for records in _session_attendance_cache.values())
        return {
            "cached_sessions": len(_session_attendance_cache),
            "total_cached_records": total_records,
        }

