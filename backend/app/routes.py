import os
import io
import time
import math
import re
import urllib.parse
import random
import asyncio
import hmac
import hashlib
import logging
import ipaddress
from datetime import datetime, timezone
import dateutil.parser  # type: ignore
import numpy as np
from PIL import Image, ImageOps
from numpy.linalg import norm
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel

from app.config import (
    supabase,
    safe_db_execute,
    get_camera_urls,
    get_camera_details,
    is_cohort_matching,
    get_server_geofence_config,
    invalidate_server_geofence_cache,
    calculate_haversine_distance,
    has_valid_face_encoding,
)
from app.session_cache import (
    get_cached_session_metadata,
    invalidate_backend_session_cache,
)
from app.attendance_cache import (
    get_cached_session_attendance,
    record_cached_session_attendance,
)
from app.biometric_cache import get_cached_student_by_roll
from app.ai import (
    app_fa,
    AI_ENABLED,
    calculate_confidence_score,
    match_faces_vectorized,
    get_ai_semaphore,
)
from app.antispoof import verify_face_liveness
from app.stream import generate_video_feed
import cv2  # type: ignore

import uuid
from app.rate_limiter import (
    check_device_lock,
    record_device_lock,
    check_fail_cooldown,
    record_face_failure,
    clear_face_failure,
    check_selfie_rate_limit,
    check_public_selfie_ip_limit,
    check_lookup_rate_limit,
    check_active_sessions_rate_limit,
)

logger = logging.getLogger(__name__)

from app.routers.helpers import (
    is_valid_ip,
    get_real_client_ip,
    safe_read_image_file,
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_SELFIE_IMAGE_SIZE,
    MAX_CLASSROOM_IMAGE_SIZE,
)

def parse_iso_datetime(time_str: str) -> datetime:
    """Robust ISO 8601 parser compatible with Supabase timestamps and Python 3.9."""
    if not time_str:
        return datetime.now(timezone.utc)
    try:
        dt = dateutil.parser.isoparse(time_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        clean = time_str.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(clean)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return datetime.now(timezone.utc)

router = APIRouter()

# Include Modular Domain Sub-Routers
from app.routers.health import router as health_router
from app.routers.streaming import router as streaming_router
from app.routers.biometrics import router as biometrics_router, verify_biometric_actor_auth
from app.routers.session_lifecycle import (
    router as session_lifecycle_router,
    ScanRequest,
    EndSessionRequest,
)

router.include_router(health_router)
router.include_router(streaming_router)
router.include_router(biometrics_router)
router.include_router(session_lifecycle_router)


@router.post("/api/process-attendance")
async def process_attendance(request: Request, file: UploadFile = File(...), session_id: str = Form(...)):
    """
    Receives an image (e.g., a classroom photo), detects all faces, matches them against
    enrolled students, and logs attendance.
    Strictly protected: Requires valid internal API key or authorized faculty/admin proxy.
    """
    from app.security import is_authorized_request
    if not is_authorized_request(request):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Protected management endpoint. Valid X-Internal-API-Key or authorized proxy required."
        )

    contents = await safe_read_image_file(file, MAX_CLASSROOM_IMAGE_SIZE)
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    # 1. Fetch Session to get target_academic_year and verify active status (from high-speed in-memory cache)
    sess_item = get_cached_session_metadata(session_id)
    target_year = "All"
    if sess_item:
        if sess_item.get("is_archived") or str(sess_item.get("class_name", "")).startswith("[ARCHIVED]"):
            raise HTTPException(status_code=403, detail="Cannot process attendance for an archived session.")
        if sess_item.get("target_academic_year"):
            target_year = sess_item["target_academic_year"]

    # 2. Fetch active enrolled students & pre-normalized matrix from in-memory cache (0ms latency, 60s TTL)
    from app.biometric_cache import get_cached_enrolled_data
    all_enrolled, all_matrix = get_cached_enrolled_data(target_academic_year=target_year)
    
    # Defense-in-depth: Exclude any inactive or archived students
    enrolled_students = [
        s for s in all_enrolled 
        if s.get("is_active") is not False 
        and not str(s.get("academic_year", "")).startswith("[ARCHIVED]")
    ]
    enrolled_matrix = all_matrix
    
    if not enrolled_students:
        raise HTTPException(status_code=400, detail="No students have enrolled face data yet.")

    recognized_students = []

    if not (AI_ENABLED and app_fa):
        raise HTTPException(
            status_code=503,
            detail="Biometric AI face recognition engine is not initialized. Batch photo attendance processing cannot proceed without AI."
        )

    def _match_photo_faces():
        from app.ai import decode_image_bytes
        image_bgr = decode_image_bytes(contents)
        
        # Detect faces with InsightFace AI
        faces = app_fa.get(image_bgr) or []
        
        # High-performance Vectorized 2D Matrix Cosine Matching (NumPy BLAS/AVX2 accelerated)
        return match_faces_vectorized(
            faces,
            enrolled_students,
            similarity_threshold=0.42,
            enrolled_matrix=enrolled_matrix
        )

    try:
        # Concurrency Limiter: Guard neural inference under asyncio semaphore to prevent CPU/memory exhaustion
        async with get_ai_semaphore():
            recognized_students = await asyncio.to_thread(_match_photo_faces)
    except Exception as e:
        print("Error matching faces:", str(e))
        raise HTTPException(status_code=500, detail="Failed to run AI face matching.")

    # 3. Record Attendance via High-Performance Atomic Batch Upsert (1 network call vs N sequential calls)
    results = []
    if recognized_students:
        batch_payload = [
            {
                "session_id": session_id,
                "student_id": student["id"],
                "status": "Present",
                "capture_mode": "Manual Upload",
                "confidence_score": student["confidence"]
            }
            for student in recognized_students
        ]

        try:
            # Atomic single-roundtrip batch upsert (PostgREST ACID transaction)
            supabase.table("attendance").upsert(
                batch_payload,
                on_conflict="session_id,student_id"
            ).execute()

            results = [
                {"name": student["full_name"], "confidence": student["confidence"]}
                for student in recognized_students
            ]
        except Exception as batch_err:
            print(f"[WARN] Batch attendance upsert failed: {batch_err}. Attempting individual fallback...")
            # Fault-tolerant individual fallback
            for student in recognized_students:
                try:
                    supabase.table("attendance").upsert({
                        "session_id": session_id,
                        "student_id": student["id"],
                        "status": "Present",
                        "capture_mode": "Manual Upload",
                        "confidence_score": student["confidence"]
                    }, on_conflict="session_id,student_id").execute()
                    results.append({"name": student["full_name"], "confidence": student["confidence"]})
                except Exception as ind_err:
                    print(f"Attendance recorded/duplicate for {student['full_name']}:", str(ind_err))
                    pass

    return {
        "success": True,
        "message": f"Processed image. Recognized {len(recognized_students)} students.",
        "recognized": results,
        "ai_used": AI_ENABLED
    }

@router.post("/api/geofence/invalidate")
async def api_invalidate_geofence():
    """Invalidates the in-memory server geofence cache."""
    invalidate_server_geofence_cache()
    return {"success": True, "message": "Server geofence cache invalidated successfully."}

@router.post("/api/session/invalidate-cache")
async def api_invalidate_session_cache(request: Request):
    """Invalidates the in-memory backend session metadata cache."""
    session_id = None
    try:
        body = await request.json()
        session_id = body.get("session_id")
    except Exception:
        pass
    invalidate_backend_session_cache(session_id)
    return {"success": True, "message": f"Session cache invalidated for: {session_id or 'all'}"}



# ==========================================
# Student Mobile Selfie Attendance API
# ==========================================

def get_checkin_secret() -> str:
    """Retrieves the cryptographic secret for check-in capability tokens.
    Strictly requires CHECKIN_SIGNING_SECRET, INTERNAL_API_KEY, or AUTH_SECRET with >= 32 characters.
    Raises RuntimeError if absent or weak. No insecure default fallbacks allowed.
    """
    secret = (
        os.getenv("CHECKIN_SIGNING_SECRET")
        or os.getenv("INTERNAL_API_KEY")
        or os.getenv("AUTH_SECRET")
        or ""
    ).strip()
    if len(secret) < 32:
        raise RuntimeError(
            "Missing or insecure check-in token secret. Set CHECKIN_SIGNING_SECRET, INTERNAL_API_KEY, or AUTH_SECRET with at least 32 characters in your environment."
        )
    return secret


def generate_checkin_token(session_id: str, valid_seconds: int = 300, student_roll: Optional[str] = None) -> str:
    try:
        uuid.UUID(session_id.strip())
    except Exception:
        return ""
    expires_at = int(time.time()) + min(max(valid_seconds, 30), 330)
    clean_roll = student_roll.strip().lower() if student_roll and student_roll.strip() else None
    if clean_roll:
        payload = f"{session_id}:{clean_roll}:{expires_at}"
    else:
        payload = f"{session_id}:{expires_at}"
    try:
        secret = get_checkin_secret()
    except Exception as e:
        logger.error(f"[Checkin Token] Cannot sign token: {e}")
        return ""
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def verify_checkin_token(
    token: Optional[str],
    expected_session_id: str,
    expected_student_roll: Optional[str] = None
) -> bool:
    if not token or not isinstance(token, str) or not token.strip():
        return False
    parts = token.strip().split(":")
    clean_expected_roll = expected_student_roll.lower().strip() if expected_student_roll and expected_student_roll.strip() else ""

    if clean_expected_roll:
        # Strict Roll-Bound Capability: 3-part classroom tokens are strictly rejected when student-specific capability is required
        if len(parts) != 4:
            return False
        sess_id, roll, expires_str, sig = parts
        if sess_id.lower() != expected_session_id.lower().strip():
            return False
        if roll.lower() != clean_expected_roll:
            return False
        payload = f"{sess_id}:{roll}:{expires_str}"
    else:
        # Session-Level Capability: permits 3-part classroom token or 4-part token
        if len(parts) == 3:
            sess_id, expires_str, sig = parts
            if sess_id.lower() != expected_session_id.lower().strip():
                return False
            payload = f"{sess_id}:{expires_str}"
        elif len(parts) == 4:
            sess_id, roll, expires_str, sig = parts
            if sess_id.lower() != expected_session_id.lower().strip():
                return False
            payload = f"{sess_id}:{roll}:{expires_str}"
        else:
            return False

    try:
        expires_at = int(expires_str)
    except ValueError:
        return False
    if int(time.time()) > expires_at:
        return False
    try:
        secret = get_checkin_secret()
    except Exception as e:
        logger.error(f"[Checkin Token] Cannot verify token: {e}")
        return False
    expected_sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected_sig)


def clean_public_instructor_name(name: Optional[str]) -> str:
    """Strips internal [GPS:...] coordinates and [BY:...] faculty attribution tags for public responses."""
    if not name or not isinstance(name, str):
        return "Faculty Member"
    cleaned = re.sub(r'\[GPS:[^\]]+\]', '', name)
    cleaned = re.sub(r'\[BY:[^\]]+\]', '', cleaned)
    cleaned = cleaned.strip()
    return cleaned if cleaned else "Faculty Member"


@router.get("/api/active-sessions")
async def get_active_sessions(request: Request):
    """
    Fetches today's active class sessions with remaining 5-minute window for student self-attendance.
    Only sessions created today are returned; older dates are automatically excluded.
    Batch fetches attendance counts in 1 single query (<30ms) instead of looping N times.
    Generates short-lived signed check-in capability tokens and sanitizes public metadata.
    """
    # 1. Check internal authorization (Next.js server proxy or authenticated staff)
    api_key_header = request.headers.get("x-internal-api-key") or request.headers.get("X-Internal-API-Key")
    internal_key = os.getenv("INTERNAL_API_KEY", "").strip()
    is_internal_auth = bool(internal_key and api_key_header and hmac.compare_digest(api_key_header.strip(), internal_key))

    # 2. Trusted Client IP & Shared Atomic Persistent Rate Limiter (Max 30 requests/min per IP)
    client_ip = get_real_client_ip(request)
    if not is_internal_auth:
        check_active_sessions_rate_limit(client_ip)

    try:
        now_utc = datetime.now(timezone.utc)
        today_local = datetime.now().strftime("%Y-%m-%d")
        start_of_today_iso = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        res = supabase.table("sessions").select(
            "id, class_name, date, start_time, end_time, instructor_name, target_academic_year, is_archived, archived_at, created_at"
        ).order("created_at", desc=True).limit(50).execute()
        
        all_sessions = res.data or []
        # Filter strictly for today's sessions and exclude system configs and archived sessions
        sessions = [
            s for s in all_sessions 
            if not s.get("class_name", "").startswith("__")
            and not s.get("is_archived")
            and not s.get("class_name", "").startswith("[ARCHIVED]")
            and s.get("target_academic_year") != "Archived"
            and (
                s.get("date") == today_local 
                or (s.get("created_at") and s["created_at"].startswith(today_local)) 
                or (s.get("created_at") and s["created_at"] >= start_of_today_iso)
            )
        ]
        
        # Batch fetch attendance counts in a single query (1 network call vs 50)
        session_ids = [s["id"] for s in sessions if s.get("id")]
        attendance_counts = {}
        if session_ids and is_internal_auth:
            try:
                att_res = supabase.table("attendance").select("session_id").in_("session_id", session_ids).execute()
                for row in (att_res.data or []):
                    s_id = row.get("session_id")
                    if s_id:
                        attendance_counts[s_id] = attendance_counts.get(s_id, 0) + 1
            except Exception as att_err:
                print("Error batch fetching attendance counts:", att_err)

        enhanced_sessions = []
        for s in sessions:
            count = attendance_counts.get(s["id"], 0) if is_internal_auth else None
            
            time_str = s.get("start_time") or s.get("created_at")
            remaining_seconds = 0
            is_expired = True
            
            if time_str:
                try:
                    start_dt = parse_iso_datetime(time_str)
                    elapsed_seconds = (now_utc - start_dt).total_seconds()
                    # 5-minute window = 300 seconds
                    rem = int(300 - elapsed_seconds)
                    remaining_seconds = max(0, rem)
                    is_expired = remaining_seconds <= 0
                except Exception as err:
                    print(f"Error calculating remaining time for session {s.get('id')}: {err}")
                    remaining_seconds = 0
                    is_expired = True

            checkin_token = (
                generate_checkin_token(s["id"], remaining_seconds)
                if is_internal_auth and not is_expired and remaining_seconds > 0
                else None
            )

            # Extract session-level geofence configuration if embedded in instructor_name
            sess_instructor = s.get("instructor_name") or ""
            sess_geofence = None
            gps_match = re.search(r"\[GPS:([-\d.]+),([-\d.]+),(\d+),([01])(?:,([^\]]*))?\]", sess_instructor)
            if gps_match:
                try:
                    sess_campus_name = "College Campus & Lecture Halls"
                    if gps_match.group(5):
                        try:
                            sess_campus_name = urllib.parse.unquote(gps_match.group(5))
                        except Exception:
                            sess_campus_name = gps_match.group(5)
                    sess_geofence = {
                        "latitude": float(gps_match.group(1)),
                        "longitude": float(gps_match.group(2)),
                        "radiusMeters": float(gps_match.group(3)),
                        "enabled": gps_match.group(4) == "1",
                        "campusName": sess_campus_name,
                    }
                except Exception:
                    sess_geofence = None

            enhanced_sessions.append({
                **s,
                "instructor_name": s.get("instructor_name") if is_internal_auth else clean_public_instructor_name(s.get("instructor_name")),
                "geofence": sess_geofence,
                "attendance_count": count,
                "checkin_token": checkin_token,
                "remaining_seconds": remaining_seconds,
                "is_expired": is_expired,
                "window_duration_seconds": 300
            })
            
        return {"success": True, "sessions": enhanced_sessions}
    except HTTPException:
        raise
    except Exception as e:
        print("Error fetching active sessions:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch active sessions")


def mask_student_name(full_name: str) -> str:
    """Masks student full name for public endpoints to prevent roster scraping."""
    if not full_name or not isinstance(full_name, str):
        return ""
    parts = full_name.strip().split()
    masked_parts = []
    for part in parts:
        if len(part) <= 2:
            masked_parts.append(part)
        elif len(part) == 3:
            masked_parts.append(f"{part[0]}*{part[2]}")
        else:
            visible_start = min(2, len(part) // 3)
            start = part[:visible_start]
            end = part[-1]
            masked_count = max(1, len(part) - visible_start - 1)
            masked_parts.append(f"{start}{'*' * masked_count}{end}")
    return " ".join(masked_parts)


@router.get("/api/student-lookup/{student_roll}")
async def student_lookup(
    request: Request,
    student_roll: str,
    session_id: Optional[str] = None,
    token: Optional[str] = None
):
    """
    Looks up student details by roll number for an active session.
    Protected against scraping / roster enumeration via IP rate limits, active session requirements,
    and mandatory short-lived signed check-in capability tokens.
    """
    client_ip = get_real_client_ip(request)

    # 1. Anti-Scraping Rate Limiter (Shared & Persistent: Max 10 roll lookups per IP per 60s)
    check_lookup_rate_limit(client_ip)

    # 2. Require an active session_id to prevent general roster scraping
    if not session_id or not session_id.strip():
        raise HTTPException(
            status_code=403,
            detail="Active session ID required. Student lookup is only allowed during an active class session."
        )

    clean_sess_id = session_id.strip()
    try:
        uuid.UUID(clean_sess_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid session_id format: Must be a valid UUID."
        )

    # 3. Check Authorization: Internal Proxy OR Valid Signed Check-In Capability Token
    api_key_header = (
        request.headers.get("x-internal-api-key")
        or request.headers.get("X-Internal-API-Key")
        or request.headers.get("x-api-key")
        or request.headers.get("X-Api-Key")
    )
    internal_key = os.getenv("INTERNAL_API_KEY", "").strip()
    is_internal_auth = bool(internal_key and api_key_header and hmac.compare_digest(api_key_header.strip(), internal_key))

    clean_roll = student_roll.strip()
    checkin_token = token or request.headers.get("x-checkin-token") or request.query_params.get("token")
    has_valid_checkin_token = verify_checkin_token(checkin_token, clean_sess_id, clean_roll)

    if not is_internal_auth and not has_valid_checkin_token:
        raise HTTPException(
            status_code=403,
            detail="Valid signed check-in token or authenticated session required. Unauthenticated student lookup is prohibited."
        )

    sess_obj = get_cached_session_metadata(clean_sess_id)
    if not sess_obj:
        raise HTTPException(status_code=404, detail="Lecture session not found.")
    if sess_obj.get("is_archived") or str(sess_obj.get("class_name", "")).startswith("[ARCHIVED]"):
        raise HTTPException(
            status_code=403,
            detail="This lecture session has been archived. Attendance lookup is not permitted."
        )

    time_str = sess_obj.get("start_time") or sess_obj.get("created_at")
    remaining_validity = 300
    if time_str:
        try:
            start_dt = parse_iso_datetime(time_str)
            elapsed = (datetime.now(timezone.utc) - start_dt).total_seconds()
            if elapsed > 330:
                raise HTTPException(
                    status_code=403,
                    detail=f"Attendance window closed! The 5-minute check-in time for '{sess_obj.get('class_name')}' has expired."
                )
            remaining_validity = max(30, min(330, int(300 - elapsed)))
        except HTTPException:
            raise
        except Exception:
            pass

    try:
        # Query student profile from High-Speed In-Memory Biometric Cache (0ms) with targeted DB fallback
        student = get_cached_student_by_roll(clean_roll)
        if not student:
            raise HTTPException(status_code=404, detail=f"No student found with Roll Number '{clean_roll}'. Please check and try again.")
            
        if student.get("is_active") is False or str(student.get("academic_year", "")).startswith("[ARCHIVED]"):
            raise HTTPException(
                status_code=403,
                detail="This student record has been archived and is not eligible for attendance check-in."
            )
        has_face = bool(student.get("biometric_consent", True)) and has_valid_face_encoding(student.get("face_encoding"))
        
        # Check target cohort
        target_academic_year = sess_obj.get("target_academic_year")
        student_year = student.get("academic_year") or ""
        cohort_mismatch = not is_cohort_matching(target_academic_year, student_year)

        # Check if already marked present in this session
        is_already_present = False
        attendance_info = None

        att_res = safe_db_execute(supabase.table("attendance").select(
            "status, recorded_at"
        ).eq("session_id", clean_sess_id).eq("student_id", student["id"]))
        
        if att_res.data:
            is_already_present = True
            att_record = att_res.data[0]
            attendance_info = {
                "status": att_record.get("status", "Present"),
                "recorded_at": att_record.get("recorded_at", "Earlier Today")
            }

        can_checkin = not cohort_mismatch and not is_already_present and has_face
        roll_token = generate_checkin_token(clean_sess_id, remaining_validity, clean_roll)

        if not is_internal_auth:
            # Mask student full name for privacy, but preserve true academic_year and cohort matching booleans
            return {
                "success": True,
                "checkin_token": roll_token,
                "student": {
                    "student_roll": student["student_roll"],
                    "full_name": mask_student_name(student["full_name"]),
                    "academic_year": student.get("academic_year") or "1st Year",
                    "has_face_enrolled": has_face,
                    "is_already_present": is_already_present,
                    "can_checkin": can_checkin,
                    "attendance_info": attendance_info,
                    "cohort_mismatch": cohort_mismatch,
                    "target_academic_year": target_academic_year
                }
            }

        return {
            "success": True,
            "checkin_token": roll_token,
            "student": {
                "student_roll": student["student_roll"],
                "full_name": student["full_name"],
                "academic_year": student.get("academic_year"),
                "has_face_enrolled": has_face,
                "is_already_present": is_already_present,
                "can_checkin": can_checkin,
                "attendance_info": attendance_info,
                "cohort_mismatch": cohort_mismatch,
                "target_academic_year": target_academic_year
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print("Error in student lookup:", e)
        raise HTTPException(status_code=500, detail="Failed to lookup student details")


@router.post("/api/selfie-attendance")
async def selfie_attendance(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    student_roll: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    distance_meters: Optional[float] = Form(None),
    device_id: Optional[str] = Form(None),
    checkin_token: Optional[str] = Form(None)
):
    """
    Processes a student's mobile selfie, verifies face against student's enrolled embedding using InsightFace AI,
    and logs attendance if matched (valid within 5-minute window, cohort check, anti-spoofing, device lock, and server GPS geofence).
    """
    # 0. Strict Input Validation (Prevent malformed, injection, or DoS payloads)
    if not session_id or not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required.")
    clean_sess_id = session_id.strip()
    try:
        uuid.UUID(clean_sess_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id format: Must be a valid UUID.")

    if not student_roll or not student_roll.strip():
        raise HTTPException(status_code=400, detail="student_roll is required.")
    clean_roll = student_roll.strip()
    if len(clean_roll) > 50:
        raise HTTPException(status_code=400, detail="student_roll is too long (Max 50 characters).")

    # Cryptographic check-in capability verification (strictly bounds session + student roll)
    token_val = checkin_token or request.headers.get("x-checkin-token")
    if token_val:
        if not verify_checkin_token(token_val, clean_sess_id, clean_roll):
            raise HTTPException(
                status_code=403,
                detail="Invalid, expired, or roll-mismatched check-in token for this student."
            )

    clean_dev_id = None
    if device_id and device_id.strip():
        clean_dev_id = device_id.strip()
        if len(clean_dev_id) > 128:
            raise HTTPException(status_code=400, detail="device_id is too long (Max 128 characters).")

    client_ip = get_real_client_ip(request)

    # 1. Public Endpoint Global IP Flood Protection (Max 20 attempts/min per IP to protect AI inference)
    check_public_selfie_ip_limit(client_ip)

    # 2. Lockout Cooldown Check (Shared & Persistent: Scoped to Session + Roll + Client IP)
    lock_info = check_fail_cooldown(clean_sess_id, clean_roll, client_ip)

    # 3. Anti-Bruteforce Rate Limiter (Shared & Persistent: Max 5 attempts per IP + Student Roll in 60s)
    check_selfie_rate_limit(client_ip, clean_roll)

    # 4. Device Lock Check (Shared & Persistent: 1 mobile device per student per session)
    check_device_lock(clean_sess_id, clean_dev_id, clean_roll)

    # 5. Check Session Expiration & Load Metadata (from high-speed in-memory cache)
    sess_obj = get_cached_session_metadata(clean_sess_id)
    if not sess_obj:
        raise HTTPException(status_code=404, detail="Lecture session not found.")
    time_str = sess_obj.get("start_time") or sess_obj.get("created_at")
    if time_str:
        try:
            start_dt = parse_iso_datetime(time_str)
            now_dt = datetime.now(timezone.utc)
            elapsed = (now_dt - start_dt).total_seconds()
            
            # 5 minutes = 300 seconds (allowing 30s buffer for slow mobile networks = 330s)
            if elapsed > 330:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Attendance window closed! The 5-minute selfie check-in time for '{sess_obj.get('class_name')}' has expired."
                )
        except HTTPException:
            raise
        except Exception as err:
            print("Timestamp check error:", err)

    # 4. Server-Side GPS Geofence Check (Strict Fail-Safe Enforcement)
    geofence = get_server_geofence_config()
    sess_instructor = sess_obj.get("instructor_name") or ""
    gps_match = re.search(r"\[GPS:([-\d.]+),([-\d.]+),(\d+),([01])(?:,([^\]]*))?\]", sess_instructor)
    if gps_match:
        try:
            sess_campus_name = "College Campus & Lecture Halls"
            if gps_match.group(5):
                try:
                    sess_campus_name = urllib.parse.unquote(gps_match.group(5))
                except Exception:
                    sess_campus_name = gps_match.group(5)
            geofence = {
                "latitude": float(gps_match.group(1)),
                "longitude": float(gps_match.group(2)),
                "radiusMeters": float(gps_match.group(3)),
                "enabled": gps_match.group(4) == "1",
                "campusName": sess_campus_name,
            }
        except Exception as parse_err:
            print("Session GPS metadata parse error:", parse_err)

    if geofence.get("enabled", True):
        if latitude is None or longitude is None:
            raise HTTPException(
                status_code=403,
                detail="GPS location is required for attendance. Please enable device GPS/Location and grant permission."
            )

        # Explicitly validate and reject NaN, Infinity, out-of-range or malformed coordinates
        try:
            lat = float(latitude)
            lng = float(longitude)
            if math.isnan(lat) or math.isnan(lng) or math.isinf(lat) or math.isinf(lng):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid GPS coordinates: NaN or Infinite values are strictly rejected."
                )
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid GPS coordinates: Latitude must be between -90 and 90, Longitude between -180 and 180."
                )
        except HTTPException:
            raise
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail="Malformed GPS coordinates provided."
            )

        try:
            center_lat = float(geofence["latitude"])
            center_lng = float(geofence["longitude"])
            max_radius = float(geofence.get("radiusMeters", 30.0))
            campus_name = str(geofence.get("campusName", "College Campus & Lecture Halls"))

            if math.isnan(center_lat) or math.isnan(center_lng) or math.isnan(max_radius):
                raise ValueError("Corrupted geofence reference coordinates.")

            actual_dist = calculate_haversine_distance(lat, lng, center_lat, center_lng)
            if math.isnan(actual_dist) or math.isinf(actual_dist):
                raise HTTPException(
                    status_code=403,
                    detail="Could not calculate physical distance from campus. Geofence verification failed."
                )

            if actual_dist > max_radius:
                raise HTTPException(
                    status_code=403,
                    detail=f"Geofence Restriction: You are {int(actual_dist)}m away from {campus_name}. Attendance is only permitted within {int(max_radius)}m of the classroom/campus."
                )
        except HTTPException:
            raise
        except Exception as geo_err:
            print("Server geofence verification error:", geo_err)
            raise HTTPException(
                status_code=403,
                detail="Geofence validation failed: Could not securely verify physical presence inside the classroom boundary."
            )

    contents = await safe_read_image_file(file, MAX_SELFIE_IMAGE_SIZE)

    # 5. Fetch Student from High-Speed In-Memory Biometric RAM Cache (0ms) with targeted DB fallback
    student = get_cached_student_by_roll(clean_roll)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with Roll '{clean_roll}' not found.")

    # Check Active / Non-archived status
    student_year = student.get("academic_year") or ""
    if student.get("is_active") is False or str(student_year).startswith("[ARCHIVED]"):
        raise HTTPException(
            status_code=403,
            detail="This student account has been archived or deactivated. Attendance cannot be submitted."
        )

    # 6. Check Academic Year / Cohort / Sub-Batch Match
    target_year = sess_obj.get("target_academic_year")
    if not is_cohort_matching(target_year, student_year):
        raise HTTPException(
            status_code=403,
            detail=f"Cohort Restriction: This lecture session is exclusively for '{target_year}' students. You are registered as '{student_year}' and cannot submit attendance for this class."
        )

    if not student.get("face_encoding"):
        raise HTTPException(status_code=400, detail=f"Student {student['full_name']} (Roll: {clean_roll}) does not have face biometric data enrolled yet. Please contact the administrator.")
        
    known_encoding = np.array(student["face_encoding"])

    # 7. AI Face Recognition & Anti-Spoofing Verification (Runs FIRST to prevent unauthorized attendance probing)
    if not (AI_ENABLED and app_fa):
        raise HTTPException(
            status_code=503,
            detail="Biometric AI face recognition engine is not initialized. Selfie attendance cannot be verified."
        )

    def _verify_selfie():
        import cv2  # type: ignore
        from app.ai import decode_image_bytes
        image_bgr = decode_image_bytes(contents)
        
        # Anti-Spoofing / Blur check (Adaptive frame & face Laplacian variance)
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        faces = app_fa.get(image_bgr)
        if not faces:
            h, w = image_bgr.shape[:2]
            if w != 640 or h != 640:
                resized = cv2.resize(image_bgr, (640, 640))
                faces = app_fa.get(resized)
        
        valid_faces = faces or []
        if len(valid_faces) == 0:
            raise HTTPException(status_code=400, detail="No clear face detected in the selfie. Please look directly into the camera in good lighting.")
        
        # Face Proximity / Coverage Check
        first_face = valid_faces[0]
        bbox = first_face.bbox
        h_img, w_img = gray.shape[:2]
        bx1, by1, bx2, by2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
        face_crop = gray[max(0, by1):min(h_img, by2), max(0, bx1):min(w_img, bx2)]
        face_lap_var = float(cv2.Laplacian(face_crop, cv2.CV_64F).var()) if face_crop.size > 0 else lap_var

        # Intelligent blur check: either whole frame or the face region must have sufficient focus
        # Strictly rejects if BOTH frame and face region lack edge sharpness
        if lap_var < 14.0 and face_lap_var < 16.0:
            raise HTTPException(
                status_code=400,
                detail="Selfie image is too blurry or out of focus. Please hold your phone steady in a well-lit area."
            )

        face_w = bbox[2] - bbox[0]
        face_h = bbox[3] - bbox[1]
        face_area_ratio = (face_w * face_h) / float(image_bgr.shape[0] * image_bgr.shape[1])
        if face_area_ratio < 0.025:
            raise HTTPException(
                status_code=400,
                detail="Face is too far from camera. Please hold your phone closer to frame your face clearly."
            )

        # Anti-Spoofing: Screen Moiré Pattern & Pixel-Grid Reflection Check
        is_live, spoof_reason, diag = verify_face_liveness(image_bgr, bbox)
        if not is_live:
            print(f"[AntiSpoof REJECT] Student '{student['full_name']}' (Roll: {clean_roll}) | Reason: {spoof_reason} | Diag: {diag}")
            raise HTTPException(status_code=400, detail=spoof_reason)

        # Handle 128D legacy vs 512D
        current_known = known_encoding
        first_emb = valid_faces[0].embedding
        if current_known.shape != first_emb.shape:
            if len(first_emb) == 512:
                safe_db_execute(supabase.table("students").update({"face_encoding": first_emb.tolist()}).eq("id", student["id"]))
                current_known = first_emb
            else:
                raise HTTPException(status_code=500, detail="Face encoding dimension mismatch.")
        
        # If multiple faces detected in selfie, match against best
        best_sim = -1.0
        for f in valid_faces:
            emb = f.embedding
            if emb.shape == current_known.shape:
                sim_score = float(np.dot(current_known, emb) / (norm(current_known) * norm(emb)))
                if sim_score > best_sim:
                    best_sim = sim_score

        sim = best_sim
        threshold = float(os.getenv("SELFIE_SIMILARITY_THRESHOLD", "0.40"))
        print(f"[Selfie AI] Student '{student['full_name']}' (Roll: {clean_roll}) | Blur Var: {lap_var:.1f} | Area: {face_area_ratio:.3f} | Best Similarity: {sim:.4f} | Threshold: {threshold} | Result: {'MATCH' if sim >= threshold else 'MISMATCH'}")
        
        # High precision threshold for selfie verification (ArcFace cosine similarity >= 0.40)
        if sim < threshold:
            current_fails = lock_info.get("fails", 0)
            record_face_failure(session_id, clean_roll, client_ip, current_fails)
            raise HTTPException(
                status_code=400,
                detail=f"Face mismatch! The captured selfie does not match the registered face for {student['full_name']} (Roll {clean_roll}). (Attempt {current_fails + 1}/3)"
            )
            
        # Reset fail counter on successful match across all workers and shared storage
        clear_face_failure(session_id, clean_roll, client_ip)

        return calculate_confidence_score(sim)

    try:
        # Concurrency Limiter: Guard neural inference under asyncio semaphore to prevent CPU thrashing & OOM during spikes
        async with get_ai_semaphore():
            confidence_score = await asyncio.to_thread(_verify_selfie)
    except HTTPException:
        raise
    except Exception as e:
        print("Error in selfie face matching:", e)
        raise HTTPException(status_code=500, detail="AI face analysis failed. Please try again.")

    # 8. Check if already marked present in this session (Fast-Path via In-Memory Attendance Cache, verified strictly AFTER authentic biometric face match)
    cached_att = get_cached_session_attendance(session_id, student["id"])
    if cached_att:
        rec_time = cached_att.get("recorded_at", "Earlier Today")
        # Ensure device lock is registered even if already present (Shared & Persistent)
        if device_id and device_id.strip():
            record_device_lock(session_id, device_id, clean_roll)
        return {
            "success": True,
            "already_marked": True,
            "message": f"Attendance is already recorded for {student['full_name']} (Roll: {clean_roll})!",
            "student_name": student["full_name"],
            "student_roll": student["student_roll"],
            "academic_year": student.get("academic_year") or "MBBS",
            "recorded_at": rec_time,
            "confidence": cached_att.get("confidence", confidence_score)
        }

    # 9. Record Attendance in Supabase (Single-roundtrip atomic upsert, zero redundant individual SELECT queries)
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        safe_db_execute(supabase.table("attendance").upsert({
            "session_id": session_id,
            "student_id": student["id"],
            "status": "Present",
            "capture_mode": "Live Scan",
            "confidence_score": confidence_score
        }, on_conflict="session_id,student_id"))
        
        # 10. Update In-Memory Attendance Cache for zero-DB hits on subsequent checks
        record_cached_session_attendance(session_id, student["id"], {
            "recorded_at": now_str,
            "confidence": confidence_score,
            "capture_mode": "Live Scan",
            "student_roll": clean_roll
        })

        # 11. Lock Device for this Student & Session (Shared & Persistent)
        if device_id and device_id.strip():
            record_device_lock(session_id, device_id, clean_roll)
            
        return {
            "success": True,
            "already_marked": False,
            "message": f"Attendance verified successfully for {student['full_name']}!",
            "student_name": student["full_name"],
            "student_roll": student["student_roll"],
            "academic_year": student.get("academic_year") or "MBBS",
            "confidence": confidence_score,
            "recorded_at": now_str
        }
    except Exception as e:
        print("Database insert error:", e)
        # Check if inserted concurrently
        existing = safe_db_execute(supabase.table("attendance").select("id, recorded_at, confidence_score").eq("session_id", session_id).eq("student_id", student["id"]))
        if existing.data:
            rec_row = existing.data[0]
            record_cached_session_attendance(session_id, student["id"], {
                "recorded_at": rec_row.get("recorded_at", "Just now"),
                "confidence": rec_row.get("confidence_score", confidence_score),
                "capture_mode": "Live Scan",
                "student_roll": clean_roll
            })
            if device_id and device_id.strip():
                record_device_lock(session_id, device_id, clean_roll)
            return {
                "success": True,
                "already_marked": True,
                "message": f"Attendance already recorded for {student['full_name']}.",
                "student_name": student["full_name"],
                "student_roll": student["student_roll"],
                "academic_year": student.get("academic_year") or "MBBS",
                "confidence": rec_row.get("confidence_score", confidence_score),
                "recorded_at": rec_row.get("recorded_at", "Just now")
            }
        raise HTTPException(status_code=500, detail="Failed to save attendance record.")


