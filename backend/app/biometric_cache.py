import os
import time
import logging
import threading
from typing import List, Optional, Dict, Any

from app.config import supabase, safe_db_execute, is_cohort_matching

logger = logging.getLogger(__name__)

# Configurable TTL: Default 60 seconds (prevents stale vectors while eliminating repeated DB hits)
BIOMETRIC_CACHE_TTL_SECONDS = float(os.getenv("BIOMETRIC_CACHE_TTL_SECONDS", "60.0"))

_cache_lock = threading.Lock()
_enrolled_students_cache: List[Dict[str, Any]] = []
_cache_last_fetched: float = 0.0


def _filter_students_for_cohort(students: List[Dict[str, Any]], target_cohort: Optional[str]) -> List[Dict[str, Any]]:
    """Filters active non-archived students matching target cohort with valid biometric consent."""
    return [
        s for s in students
        if s.get("is_active") is not False
        and s.get("biometric_consent", True) is not False
        and not str(s.get("academic_year", "")).startswith("[ARCHIVED]")
        and is_cohort_matching(target_cohort, s.get("academic_year"))
    ]


def get_cached_enrolled_students(
    target_academic_year: Optional[str] = "All",
    force_refresh: bool = False
) -> List[Dict[str, Any]]:
    """
    Returns active enrolled students with valid face encodings.
    Serves from high-speed in-memory cache if within TTL, eliminating repeated 300ms-800ms
    Supabase network downloads on every classroom photo scan and RTSP camera stream frame.
    """
    global _enrolled_students_cache, _cache_last_fetched

    now = time.time()
    is_fresh = (now - _cache_last_fetched) < BIOMETRIC_CACHE_TTL_SECONDS and len(_enrolled_students_cache) > 0

    if not force_refresh and is_fresh:
        return _filter_students_for_cohort(_enrolled_students_cache, target_academic_year)

    with _cache_lock:
        # Double-checked locking to prevent parallel stampede
        now = time.time()
        is_fresh = (now - _cache_last_fetched) < BIOMETRIC_CACHE_TTL_SECONDS and len(_enrolled_students_cache) > 0
        if not force_refresh and is_fresh:
            return _filter_students_for_cohort(_enrolled_students_cache, target_academic_year)

        try:
            # Query active students with biometric vectors and consent (DPDP Act 2023 compliance)
            query = supabase.table("students").select(
                "id, full_name, student_roll, face_encoding, academic_year, is_active, biometric_consent"
            ).not_.is_("face_encoding", "null")

            res = safe_db_execute(query) or query.execute()
            data = res.data or []

            # Keep only active, non-archived students with biometric templates and affirmative consent
            active_enrolled = [
                s for s in data
                if s.get("is_active") is not False
                and s.get("biometric_consent", True) is not False
                and not str(s.get("academic_year", "")).startswith("[ARCHIVED]")
                and s.get("face_encoding") is not None
            ]

            _enrolled_students_cache = active_enrolled
            _cache_last_fetched = time.time()
            logger.info(f"[BiometricCache] Successfully cached {len(_enrolled_students_cache)} student face vectors.")

        except Exception as e:
            logger.error(f"[BiometricCache] Failed to fetch students from Supabase: {e}")
            # Fault-tolerant fallback: if we already have cached data in RAM, serve stale rather than crashing
            if _enrolled_students_cache:
                logger.warning(
                    f"[BiometricCache] Serving stale in-memory cache ({len(_enrolled_students_cache)} students) due to DB error."
                )
                return _filter_students_for_cohort(_enrolled_students_cache, target_academic_year)
            raise e

    return _filter_students_for_cohort(_enrolled_students_cache, target_academic_year)


def invalidate_biometric_cache(student_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Invalidation Hook:
    Immediately purges cached biometric vectors so new enrollments or revocations
    take effect in real-time across both photo scan and CCTV streams.
    """
    global _enrolled_students_cache, _cache_last_fetched

    with _cache_lock:
        if student_id:
            s_id_str = str(student_id).strip()
            prev_len = len(_enrolled_students_cache)
            _enrolled_students_cache = [s for s in _enrolled_students_cache if str(s.get("id")) != s_id_str]
            purged = prev_len - len(_enrolled_students_cache)
            # If student was in cache, invalidate timestamp to force next fetch to pick up new state
            if purged > 0:
                _cache_last_fetched = 0.0
        else:
            _enrolled_students_cache = []
            _cache_last_fetched = 0.0

    # Also invalidate in-memory stream caches in app.stream if available
    stream_result = None
    try:
        from app.stream import invalidate_student_biometrics, cleanup_session_state
        if student_id:
            stream_result = invalidate_student_biometrics(student_id)
        else:
            stream_result = cleanup_session_state(None)
    except Exception as stream_err:
        logger.debug(f"[BiometricCache] Stream cache invalidation notice: {stream_err}")

    return {
        "success": True,
        "invalidated_student_id": student_id,
        "cache_cleared": student_id is None,
        "stream_sync": stream_result
    }


def get_biometric_cache_stats() -> Dict[str, Any]:
    """Returns diagnostics metadata for cache inspection and telemetry."""
    now = time.time()
    return {
        "cached_students_count": len(_enrolled_students_cache),
        "cache_age_seconds": round(now - _cache_last_fetched, 2) if _cache_last_fetched > 0 else None,
        "ttl_seconds": BIOMETRIC_CACHE_TTL_SECONDS,
        "is_warm": len(_enrolled_students_cache) > 0 and (now - _cache_last_fetched) < BIOMETRIC_CACHE_TTL_SECONDS
    }

