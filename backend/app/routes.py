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
from datetime import datetime, timezone
import dateutil.parser
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
    get_ptz_urls,
    is_cohort_matching,
    get_server_geofence_config,
    calculate_haversine_distance,
    has_valid_face_encoding,
)
from app.ai import app_fa, AI_ENABLED, calculate_confidence_score
from app.antispoof import verify_face_liveness
from app.stream import generate_video_feed

import uuid
from app.rate_limiter import (
    check_device_lock,
    record_device_lock,
    check_fail_cooldown,
    record_face_failure,
    clear_face_failure,
    check_selfie_rate_limit,
    check_public_selfie_ip_limit,
    check_lookup_rate_limit
)

logger = logging.getLogger(__name__)

def get_real_client_ip(request: Request) -> str:
    """Extracts genuine client IP behind Cloudflare Tunnel, reverse proxies, or direct connection."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff and xff.strip():
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"

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

class ScanRequest(BaseModel):
    session_id: str

@router.api_route("/", methods=["GET", "HEAD"])
async def read_root():
    return {"status": "Online", "message": "Smart Attendance API is running", "ai_enabled": AI_ENABLED}

@router.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "ok", "ai_enabled": AI_ENABLED}

@router.get("/health/performance")
@router.get("/api/health/performance")
async def health_performance():
    """
    Lightweight performance & diagnostic endpoint for all configured cameras,
    AI inference duration, FPS metrics, and queue status.
    """
    from app.stream import get_performance_diagnostics
    return get_performance_diagnostics()

# =========================================================================
# Secure Image Upload Validation & Anti-DoS File Processing
# =========================================================================
MAX_SELFIE_IMAGE_SIZE = 6 * 1024 * 1024       # 6 MB max for selfie / face enrollment
MAX_CLASSROOM_IMAGE_SIZE = 15 * 1024 * 1024   # 15 MB max for classroom scan

# Decompression bomb prevention for PIL (prevents billion-pixel OOM attacks)
Image.MAX_IMAGE_PIXELS = 25_000_000

ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/jpg",
}

async def safe_read_image_file(file: UploadFile, max_size: int = MAX_SELFIE_IMAGE_SIZE) -> bytes:
    """
    Safely reads an uploaded image with strict size limits, MIME type verification,
    magic byte checking, and decompression bomb protection to prevent DoS attacks.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided in upload request.")

    # 1. Content-Type Header Verification
    content_type = (file.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_IMAGE_MIME_TYPES and content_type != "application/octet-stream":
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file format '{content_type}'. Only JPEG, PNG, and WebP images are allowed."
        )

    # 2. Chunked streaming read with strict hard limit
    chunks = []
    total_size = 0
    chunk_size = 64 * 1024  # 64 KB

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > max_size:
            max_mb = max_size // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File too large! Maximum allowed image size is {max_mb}MB."
            )
        chunks.append(chunk)

    if total_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    contents = b"".join(chunks)

    # 3. Magic Byte Validation
    is_valid_magic = (
        contents.startswith(b"\xff\xd8\xff")  # JPEG
        or contents.startswith(b"\x89PNG\r\n\x1a\n")  # PNG
        or (contents.startswith(b"RIFF") and b"WEBP" in contents[:16])  # WebP
        or (b"ftypheic" in contents[:16] or b"ftypmif1" in contents[:16])  # HEIC
    )
    if not is_valid_magic:
        raise HTTPException(
            status_code=400,
            detail="Invalid image file. File content header does not match valid JPEG, PNG, or WebP format."
        )

    # 4. Decompression verification
    try:
        with Image.open(io.BytesIO(contents)) as test_img:
            test_img.verify()
    except Exception as img_err:
        raise HTTPException(
            status_code=400,
            detail=f"Corrupt or invalid image file: {str(img_err)}"
        )

    return contents


def verify_biometric_actor_auth(request: Request, actor_form: Optional[str] = None) -> dict:
    """
    Enforces strict Zero-Trust authorization for biometric enrollment & revocation (DPDP Act 2023).
    Ensures the caller has a valid X-Internal-API-Key or verified admin authorization token,
    and extracts verified administrator identity from trusted server headers.
    """
    import hmac
    from app.security import INTERNAL_API_KEY

    api_key_header = request.headers.get("x-internal-api-key") or request.headers.get("X-Internal-API-Key")
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")

    is_valid_internal_key = False
    if INTERNAL_API_KEY:
        if api_key_header and hmac.compare_digest(api_key_header.strip(), INTERNAL_API_KEY):
            is_valid_internal_key = True
        elif auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            if hmac.compare_digest(token, INTERNAL_API_KEY):
                is_valid_internal_key = True

    # Biometric operations are high-privilege. Reject if INTERNAL_API_KEY is missing or invalid.
    if not INTERNAL_API_KEY or not is_valid_internal_key:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Biometric operations require authenticated administrator authorization."
        )

    # Extract verified actor metadata from trusted headers forwarded by Next.js server session
    verified_actor_name = request.headers.get("x-actor-name") or (actor_form.strip() if actor_form else "") or "Administrator"
    verified_actor_role = request.headers.get("x-actor-role") or "Admin"
    verified_actor_id = request.headers.get("x-actor-id") or ""
    client_ip = get_real_client_ip(request)

    return {
        "actor_name": verified_actor_name,
        "actor_role": verified_actor_role,
        "actor_id": verified_actor_id,
        "ip": client_ip
    }


@router.post("/api/enroll-face/{student_id}")
async def enroll_face(
    student_id: str, 
    request: Request,
    file: UploadFile = File(...),
    consent_granted: Optional[str] = Form(None),
    consent_version: Optional[str] = Form("v1.0-dpdp"),
    actor: Optional[str] = Form(None)
):
    # 1. Enforce verified administrator authorization
    auth_meta = verify_biometric_actor_auth(request, actor)

    # 2. Strict DPDP Act 2023 Compliance: Explicit affirmative consent is mandatory
    is_consented = False
    if consent_granted is not None:
        if isinstance(consent_granted, bool) and consent_granted is True:
            is_consented = True
        elif str(consent_granted).strip().lower() in ("true", "1", "yes", "affirmative"):
            is_consented = True

    if not is_consented:
        raise HTTPException(
            status_code=400,
            detail="Biometric consent is mandatory before enrolling facial template (DPDP Act 2023). Explicit affirmative consent must be confirmed."
        )

    # 3. Verify student exists in database before proceeding with AI extraction
    try:
        check = supabase.table("students").select("id, student_roll, full_name, biometric_consent").eq("id", student_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found.")
        student_info = check.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database lookup error: {str(e)}")

    contents = await safe_read_image_file(file, MAX_SELFIE_IMAGE_SIZE)
    
    if not (AI_ENABLED and app_fa):
        raise HTTPException(
            status_code=503,
            detail="Biometric AI face recognition engine is not initialized. Face enrollment cannot proceed without AI."
        )

    def _extract_single_face():
        import cv2
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        image_np = np.array(image)
        image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        
        faces = app_fa.get(image_bgr)
        if not faces:
            h, w = image_bgr.shape[:2]
            if w != 640 or h != 640:
                resized = cv2.resize(image_bgr, (640, 640))
                faces = app_fa.get(resized)
        
        if len(faces) == 0:
            raise HTTPException(status_code=400, detail="No faces found in the image. Please ensure your face is well-lit.")
        
        # Sort by bounding box area to get the primary face
        faces.sort(key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)
        return faces[0].embedding.tolist()

    try:
        encoding = await asyncio.to_thread(_extract_single_face)
    except HTTPException:
        raise
    except Exception as e:
        print("Error processing image with AI:", str(e))
        raise HTTPException(status_code=500, detail="Failed to process image.")

    try:
        consent_now = datetime.now(timezone.utc).isoformat()
        resolved_actor_str = f"{auth_meta['actor_name']} ({auth_meta['actor_role']})"
        update_payload = {
            "face_encoding": encoding,
            "biometric_consent": True,
            "biometric_consent_date": consent_now,
            "biometric_consent_version": consent_version or "v1.0-dpdp",
            "biometric_consent_actor": resolved_actor_str,
            "biometric_consent_revoked_at": None
        }
        try:
            res = supabase.table("students").update(update_payload).eq("id", student_id).execute()
        except Exception as col_err:
            if any(col in str(col_err) for col in ["biometric_consent_version", "biometric_consent_actor", "biometric_consent_revoked_at"]):
                res = supabase.table("students").update({
                    "face_encoding": encoding,
                    "biometric_consent": True,
                    "biometric_consent_date": consent_now
                }).eq("id", student_id).execute()
            else:
                raise col_err

        if hasattr(res, 'error') and res.error:
            raise RuntimeError(f"Database error: {res.error}")

        from app.stream import cleanup_session_state
        cleanup_session_state(None)

        # 4. Immutable Security Audit Log Entry
        try:
            supabase.table("audit_logs").insert({
                "action": "ENROLL_BIOMETRICS",
                "actor_id": auth_meta["actor_name"],
                "target_type": "student",
                "target_id": student_id,
                "ip_address": auth_meta["ip"],
                "details": {
                    "method": "single_shot",
                    "student_name": student_info.get("full_name"),
                    "student_roll": student_info.get("student_roll"),
                    "consent_version": consent_version or "v1.0-dpdp",
                    "actor_role": auth_meta["actor_role"],
                    "actor_id": auth_meta["actor_id"],
                }
            }).execute()
        except Exception as audit_err:
            print(f"[Audit Log Warning] Failed to log biometric enrollment: {audit_err}")

    except Exception as e:
        print("Database error:", str(e))
        raise HTTPException(status_code=500, detail="Failed to save face encoding to database.")

    return {
        "success": True, 
        "message": "Face data enrolled successfully with explicit affirmative consent!", 
        "consent_version": consent_version or "v1.0-dpdp",
        "actor": resolved_actor_str,
        "ai_used": AI_ENABLED
    }

@router.post("/api/enroll-face-burst/{student_id}")
async def enroll_face_burst(
    student_id: str, 
    request: Request,
    files: List[UploadFile] = File(...),
    consent_granted: Optional[str] = Form(None),
    consent_version: Optional[str] = Form("v1.0-dpdp"),
    actor: Optional[str] = Form(None)
):
    # 1. Enforce verified administrator authorization
    auth_meta = verify_biometric_actor_auth(request, actor)

    # 2. Strict DPDP Act 2023 Compliance: Explicit affirmative consent is mandatory
    is_consented = False
    if consent_granted is not None:
        if isinstance(consent_granted, bool) and consent_granted is True:
            is_consented = True
        elif str(consent_granted).strip().lower() in ("true", "1", "yes", "affirmative"):
            is_consented = True

    if not is_consented:
        raise HTTPException(
            status_code=400,
            detail="Biometric consent is mandatory before enrolling facial template (DPDP Act 2023). Explicit affirmative consent must be confirmed."
        )

    # 3. Verify student exists in database before proceeding with AI extraction
    try:
        check = supabase.table("students").select("id, student_roll, full_name, biometric_consent").eq("id", student_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found.")
        student_info = check.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database lookup error: {str(e)}")

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 burst angle photos allowed.")

    if not (AI_ENABLED and app_fa):
        raise HTTPException(
            status_code=503,
            detail="Biometric AI face recognition engine is not initialized. Burst face enrollment cannot proceed without AI."
        )

    # Read all files asynchronously with strict safe verification
    file_contents = []
    for f in files:
        if f:
            c = await safe_read_image_file(f, MAX_SELFIE_IMAGE_SIZE)
            file_contents.append(c)

    def _extract_burst_encodings():
        import cv2
        encs = []
        for contents in file_contents:
            if not contents:
                continue
            raw_img = Image.open(io.BytesIO(contents))
            image = ImageOps.exif_transpose(raw_img).convert('RGB')
            image_np = np.array(image)
            image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
            
            faces = app_fa.get(image_bgr)
            if not faces:
                h, w = image_bgr.shape[:2]
                if w != 640 or h != 640:
                    resized = cv2.resize(image_bgr, (640, 640))
                    faces = app_fa.get(resized)
            
            if faces:
                # Pick largest face in the frame
                faces.sort(key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)
                encs.append(faces[0].embedding)
        
        if not encs:
            raise HTTPException(status_code=400, detail="Could not detect a clear face in any of the captured frames. Please ensure your face is well-lit and directly facing the camera.")
            
        # Average the encodings for a highly robust 3D representation
        avg_encoding = np.mean(encs, axis=0)
        avg_encoding = avg_encoding / norm(avg_encoding)
        return avg_encoding.tolist(), len(encs)

    try:
        encoding_list, valid_count = await asyncio.to_thread(_extract_burst_encodings)
    except HTTPException:
        raise
    except Exception as e:
        print("Error processing images with AI:", str(e))
        raise HTTPException(status_code=500, detail="Failed to process images.")

    try:
        consent_now = datetime.now(timezone.utc).isoformat()
        resolved_actor_str = f"{auth_meta['actor_name']} ({auth_meta['actor_role']})"
        update_payload = {
            "face_encoding": encoding_list,
            "biometric_consent": True,
            "biometric_consent_date": consent_now,
            "biometric_consent_version": consent_version or "v1.0-dpdp",
            "biometric_consent_actor": resolved_actor_str,
            "biometric_consent_revoked_at": None
        }
        try:
            res = supabase.table("students").update(update_payload).eq("id", student_id).execute()
        except Exception as col_err:
            if any(col in str(col_err) for col in ["biometric_consent_version", "biometric_consent_actor", "biometric_consent_revoked_at"]):
                res = supabase.table("students").update({
                    "face_encoding": encoding_list,
                    "biometric_consent": True,
                    "biometric_consent_date": consent_now
                }).eq("id", student_id).execute()
            else:
                raise col_err

        if hasattr(res, 'error') and res.error:
            raise RuntimeError(f"Database error: {res.error}")

        from app.stream import cleanup_session_state
        cleanup_session_state(None)

        # 4. Immutable Security Audit Log Entry
        try:
            supabase.table("audit_logs").insert({
                "action": "ENROLL_BIOMETRICS",
                "actor_id": auth_meta["actor_name"],
                "target_type": "student",
                "target_id": student_id,
                "ip_address": auth_meta["ip"],
                "details": {
                    "method": "burst_angles",
                    "valid_angles": valid_count,
                    "student_name": student_info.get("full_name"),
                    "student_roll": student_info.get("student_roll"),
                    "consent_version": consent_version or "v1.0-dpdp",
                    "actor_role": auth_meta["actor_role"],
                    "actor_id": auth_meta["actor_id"],
                }
            }).execute()
        except Exception as audit_err:
            print(f"[Audit Log Warning] Failed to log burst biometric enrollment: {audit_err}")

    except Exception as e:
        print("Database error:", str(e))
        raise HTTPException(status_code=500, detail="Failed to save face encoding to database.")

    return {
        "success": True, 
        "message": f"Face data enrolled successfully using {valid_count} angles with explicit affirmative consent!", 
        "consent_version": consent_version or "v1.0-dpdp",
        "actor": resolved_actor_str,
        "ai_used": AI_ENABLED
    }


@router.post("/api/students/{student_id}/revoke-biometrics")
async def revoke_biometrics(student_id: str, request: Request):
    """
    DPDP Act 2023 Compliance: Allows explicit revocation of biometric consent,
    erases facial vector embeddings, and immediately purges in-memory caches.
    Requires authenticated administrator authorization.
    """
    # 1. Enforce verified authorization
    auth_meta = verify_biometric_actor_auth(request, None)

    # 2. Verify student exists
    try:
        check = supabase.table("students").select("id, student_roll, full_name, biometric_consent").eq("id", student_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found.")
        student_info = check.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database lookup error: {str(e)}")

    # 3. Database Erasure: erase facial embedding, record revocation timestamp, and reset consent
    try:
        revocation_now = datetime.now(timezone.utc).isoformat()
        try:
            res = supabase.table("students").update({
                "face_encoding": None,
                "biometric_consent": False,
                "biometric_consent_date": None,
                "biometric_consent_revoked_at": revocation_now
            }).eq("id", student_id).execute()
        except Exception as col_err:
            if "biometric_consent_revoked_at" in str(col_err):
                res = supabase.table("students").update({
                    "face_encoding": None,
                    "biometric_consent": False,
                    "biometric_consent_date": None
                }).eq("id", student_id).execute()
            else:
                raise col_err

        if hasattr(res, 'error') and res.error:
            raise RuntimeError(f"Database update error: {res.error}")
    except Exception as e:
        print(f"[ERROR] Failed to erase biometric data from DB for {student_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to erase biometric data from database: {str(e)}")

    # 4. Immediately purge student from in-memory stream caches
    from app.stream import invalidate_student_biometrics
    invalidation_result = invalidate_student_biometrics(student_id)

    # 5. Immutable Security Audit Log Entry (Severity: CRITICAL)
    try:
        supabase.table("audit_logs").insert({
            "action": "REVOKE_BIOMETRICS",
            "actor_id": auth_meta["actor_name"],
            "target_type": "student",
            "target_id": student_id,
            "ip_address": auth_meta["ip"],
            "details": {
                "student_name": student_info.get("full_name"),
                "student_roll": student_info.get("student_roll"),
                "severity": "CRITICAL",
                "actor_role": auth_meta["actor_role"],
                "actor_id": auth_meta["actor_id"],
                "revoked_at": revocation_now,
                "compliance": "DPDP Act 2023 Section 12 - Right to Erasure",
            }
        }).execute()
    except Exception as audit_err:
        print(f"[Audit Log Warning] Failed to log biometric revocation: {audit_err}")

    return {
        "success": True, 
        "student_id": student_id,
        "message": "Biometric face template permanently erased, consent revoked, and active memory caches invalidated.",
        "invalidation": invalidation_result
    }


@router.post("/api/process-attendance")
async def process_attendance(file: UploadFile = File(...), session_id: str = Form(...)):
    """
    Receives an image (e.g., a classroom photo), detects all faces, matches them against
    enrolled students, and logs attendance.
    """
    contents = await safe_read_image_file(file, MAX_CLASSROOM_IMAGE_SIZE)
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    # 1. Fetch Session to get target_academic_year and verify active status
    session_res = supabase.table("sessions").select("target_academic_year, is_archived, class_name").eq("id", session_id).execute()
    target_year = "All"
    if session_res.data:
        sess_item = session_res.data[0]
        if sess_item.get("is_archived") or str(sess_item.get("class_name", "")).startswith("[ARCHIVED]"):
            raise HTTPException(status_code=403, detail="Cannot process attendance for an archived session.")
        if sess_item.get("target_academic_year"):
            target_year = sess_item["target_academic_year"]

    # 2. Fetch active enrolled students (restricted by cohort and sub-batch if applicable)
    query = supabase.table("students").select("id, full_name, face_encoding, academic_year, is_active").not_.is_("face_encoding", "null")
    students_res = query.execute()
    all_enrolled = students_res.data or []

    enrolled_students = [
        s for s in all_enrolled 
        if s.get("is_active") is not False 
        and not str(s.get("academic_year", "")).startswith("[ARCHIVED]")
        and is_cohort_matching(target_year, s.get("academic_year"))
    ]
    
    if not enrolled_students:
        raise HTTPException(status_code=400, detail="No students have enrolled face data yet.")

    recognized_students = []

    if not (AI_ENABLED and app_fa):
        raise HTTPException(
            status_code=503,
            detail="Biometric AI face recognition engine is not initialized. Batch photo attendance processing cannot proceed without AI."
        )

    def _match_photo_faces():
        import cv2
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        image_np = np.array(image)
        image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        
        # Detect faces
        faces = app_fa.get(image_bgr)
        recognized = []
        
        for face in faces:
            if hasattr(face, 'det_score') and face.det_score < 0.20:
                continue
                
            unknown_encoding = face.embedding
            best_match_student = None
            highest_sim = 0.42 # High-precision calibrated similarity threshold (cosine similarity >= 0.42)
            
            for student in enrolled_students:
                known_encoding = np.array(student['face_encoding'])
                
                # Auto-update: If the DB has old 128D data, replace it with the newly detected 512D face!
                if known_encoding.shape != unknown_encoding.shape:
                    if len(unknown_encoding) == 512:
                        print(f"Auto-upgrading face data for {student['full_name']}...")
                        supabase.table("students").update({"face_encoding": unknown_encoding.tolist()}).eq("id", student['id']).execute()
                        known_encoding = unknown_encoding # Match instantly
                        student['face_encoding'] = unknown_encoding.tolist()
                    else:
                        continue
                    
                sim = np.dot(known_encoding, unknown_encoding) / (norm(known_encoding) * norm(unknown_encoding))
                
                if sim > highest_sim:
                    highest_sim = sim
                    best_match_student = student
            
            if best_match_student:
                # Avoid duplicates in the same scan
                if not any(s['id'] == best_match_student['id'] for s in recognized):
                    recognized.append({
                        **best_match_student,
                        "confidence": calculate_confidence_score(float(highest_sim))
                    })
        return recognized

    try:
        recognized_students = await asyncio.to_thread(_match_photo_faces)
    except Exception as e:
        print("Error matching faces:", str(e))
        raise HTTPException(status_code=500, detail="Failed to run AI face matching.")

    # 3. Record Attendance
    results = []
    for student in recognized_students:
        try:
            supabase.table("attendance").upsert({
                "session_id": session_id,
                "student_id": student['id'],
                "status": "Present",
                "capture_mode": "Manual Upload",
                "confidence_score": student['confidence']
            }, on_conflict="session_id,student_id").execute()
            results.append({"name": student['full_name'], "confidence": student['confidence']})
        except Exception as e:
            print(f"Attendance recorded/duplicate for {student['full_name']}:", str(e))
            # If UNIQUE constraint fails (already scanned today), we ignore it.
            pass

    return {
        "success": True,
        "message": f"Processed image. Recognized {len(recognized_students)} students.",
        "recognized": results,
        "ai_used": AI_ENABLED
    }

class EndSessionRequest(BaseModel):
    session_id: Optional[str] = None

@router.post("/api/start-live-scan")
def start_live_scan(request: ScanRequest):
    from app.stream import ai_coordinator
    ai_coordinator.set_active_session(request.session_id)
    return {
        "success": True,
        "message": f"Live scan started successfully for session {request.session_id}",
        "session_id": request.session_id,
        "timestamp": time.time()
    }

@router.post("/api/end-session")
@router.post("/api/stop-session")
@router.post("/api/cleanup-session")
async def api_end_session(request: Optional[EndSessionRequest] = None):
    """
    Step 7 — Session Lifecycle Memory Cleanup.
    Releases all session-specific memory, cached embedding matrices, student records,
    and camera spatial caches without disconnecting persistent CCTV RTSP stream connections.
    """
    s_id = request.session_id if request else None
    from app.stream import ai_coordinator, cleanup_session_state
    ai_coordinator.end_active_session(s_id)
    result = cleanup_session_state(s_id)
    return {
        "success": True,
        "message": "Session memory cleaned up successfully. RTSP streams remain connected.",
        "details": result
    }

@router.post("/api/sessions/{session_id}/end")
async def api_end_session_by_id(session_id: str):
    """Ends a specific session and purges its cached state."""
    from app.stream import ai_coordinator, cleanup_session_state
    ai_coordinator.end_active_session(session_id)
    result = cleanup_session_state(session_id)
    return {
        "success": True,
        "message": f"Session {session_id} ended and memory cleaned up successfully.",
        "details": result
    }

@router.post("/api/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    contents = await safe_read_image_file(file, MAX_SELFIE_IMAGE_SIZE)
    return {
        "success": True,
        "filename": file.filename if file.filename else "unknown",
        "size_bytes": len(contents),
        "message": "Photo uploaded and verified successfully",
        "mock_result": {
            "student_id": "mock-uuid-1234",
            "student_name": "John Doe",
            "confidence": 0.98
        }
    }

@router.get("/api/cameras")
async def get_cameras():
    cameras = get_camera_details(redact_credentials=True)
    return {"count": len(cameras), "cameras": cameras}

@router.get("/api/video-feed/{session_id}")
async def video_feed(session_id: str, request: Request, camera_index: int = 0, grid: int = 1):
    """Streams the live CCTV video with bounding boxes."""
    return StreamingResponse(
        generate_video_feed(session_id, request=request, camera_index=camera_index, camera_type="cctv", is_grid=bool(grid)),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/api/ptz-cameras")
async def get_ptz_cameras():
    urls = get_ptz_urls()
    return {"count": len(urls)}

@router.get("/api/ptz-video-feed/{session_id}")
async def ptz_video_feed(session_id: str, request: Request, camera_index: int = 0, grid: int = 0):
    """Streams the live PTZ video with bounding boxes."""
    return StreamingResponse(
        generate_video_feed(session_id, request=request, camera_index=camera_index, camera_type="ptz", is_grid=bool(grid)),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

class PTZCommand(BaseModel):
    direction: str

from app.ptz import ptz_move

@router.post("/api/ptz/move")
async def ptz_control(cmd: PTZCommand):
    """Controls the PTZ camera movement."""
    success = ptz_move(cmd.direction)
    if success:
        return {"status": "success", "direction": cmd.direction}
    else:
        raise HTTPException(status_code=500, detail="Failed to execute PTZ command")


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


def generate_checkin_token(session_id: str, valid_seconds: int = 300) -> str:
    try:
        uuid.UUID(str(session_id).strip())
    except Exception:
        return ""
    expires_at = int(time.time()) + min(max(valid_seconds, 30), 330)
    payload = f"{session_id}:{expires_at}"
    try:
        secret = get_checkin_secret()
    except Exception as e:
        logger.error(f"[Checkin Token] Cannot sign token: {e}")
        return ""
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def verify_checkin_token(token: Optional[str], expected_session_id: str) -> bool:
    if not token or not isinstance(token, str) or not token.strip():
        return False
    parts = token.strip().split(":")
    if len(parts) != 3:
        return False
    sess_id, expires_str, sig = parts
    if sess_id.lower() != str(expected_session_id).lower().strip():
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
    payload = f"{sess_id}:{expires_str}"
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
    try:
        now_utc = datetime.now(timezone.utc)
        today_local = datetime.now().strftime("%Y-%m-%d")
        start_of_today_iso = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Check internal authorization (Next.js server proxy or authenticated staff)
        api_key_header = request.headers.get("x-internal-api-key") or request.headers.get("X-Internal-API-Key")
        internal_key = os.getenv("INTERNAL_API_KEY", "").strip()
        is_internal_auth = bool(internal_key and api_key_header and hmac.compare_digest(api_key_header.strip(), internal_key))

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

            checkin_token = generate_checkin_token(s["id"], remaining_seconds) if not is_expired and remaining_seconds > 0 else None

            enhanced_sessions.append({
                **s,
                "instructor_name": s.get("instructor_name") if is_internal_auth else clean_public_instructor_name(s.get("instructor_name")),
                "attendance_count": count,
                "checkin_token": checkin_token,
                "remaining_seconds": remaining_seconds,
                "is_expired": is_expired,
                "window_duration_seconds": 300
            })
            
        return {"success": True, "sessions": enhanced_sessions}
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
    api_key_header = request.headers.get("x-internal-api-key") or request.headers.get("X-Internal-API-Key")
    internal_key = os.getenv("INTERNAL_API_KEY", "").strip()
    is_internal_auth = bool(internal_key and api_key_header and hmac.compare_digest(api_key_header.strip(), internal_key))

    checkin_token = token or request.headers.get("x-checkin-token") or request.query_params.get("token")
    has_valid_checkin_token = verify_checkin_token(checkin_token, clean_sess_id)

    if not is_internal_auth and not has_valid_checkin_token:
        raise HTTPException(
            status_code=403,
            detail="Valid signed check-in token or authenticated session required. Unauthenticated student lookup is prohibited."
        )

    sess_res = safe_db_execute(supabase.table("sessions").select("id, class_name, start_time, created_at, target_academic_year, is_archived").eq("id", clean_sess_id))
    if not sess_res.data:
        raise HTTPException(status_code=404, detail="Lecture session not found.")
        
    sess_obj = sess_res.data[0]
    if sess_obj.get("is_archived") or str(sess_obj.get("class_name", "")).startswith("[ARCHIVED]"):
        raise HTTPException(
            status_code=403,
            detail="This lecture session has been archived. Attendance lookup is not permitted."
        )

    time_str = sess_obj.get("start_time") or sess_obj.get("created_at")
    if time_str:
        try:
            start_dt = parse_iso_datetime(time_str)
            elapsed = (datetime.now(timezone.utc) - start_dt).total_seconds()
            if elapsed > 330:
                raise HTTPException(
                    status_code=403,
                    detail=f"Attendance window closed! The 5-minute check-in time for '{sess_obj.get('class_name')}' has expired."
                )
        except HTTPException:
            raise
        except Exception:
            pass

    try:
        clean_roll = student_roll.strip()
        # Query student profile and face template status (raw biometric vectors are evaluated server-side and omitted from API response)
        res = safe_db_execute(supabase.table("students").select(
            "id, student_roll, full_name, academic_year, is_active, biometric_consent, face_encoding"
        ).ilike("student_roll", clean_roll))
        
        if not res.data:
            res = safe_db_execute(supabase.table("students").select(
                "id, student_roll, full_name, academic_year, is_active, biometric_consent, face_encoding"
            ).eq("student_roll", clean_roll))
            
        if not res.data:
            raise HTTPException(status_code=404, detail=f"No student found with Roll Number '{clean_roll}'. Please check and try again.")
            
        student = res.data[0]
        if student.get("is_active") is False or str(student.get("academic_year", "")).startswith("[ARCHIVED]"):
            raise HTTPException(
                status_code=403,
                detail="This student record has been archived and is not eligible for attendance check-in."
            )
        has_face = bool(student.get("biometric_consent")) and has_valid_face_encoding(student.get("face_encoding"))
        
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

        can_checkin = bool(not cohort_mismatch and not is_already_present and has_face)

        return {
            "success": True,
            "student": {
                "student_roll": student["student_roll"],
                "full_name": student["full_name"] if is_internal_auth else mask_student_name(student["full_name"]),
                "academic_year": student.get("academic_year") if is_internal_auth else "Enrolled Student",
                "has_face_enrolled": has_face,
                "is_already_present": is_already_present,
                "can_checkin": can_checkin,
                "attendance_info": attendance_info if is_internal_auth else None,
                "cohort_mismatch": cohort_mismatch,
                "target_academic_year": target_academic_year if is_internal_auth else None
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
    device_id: Optional[str] = Form(None)
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

    # 5. Check Session Expiration & Load Metadata
    session_res = safe_db_execute(supabase.table("sessions").select("id, start_time, created_at, class_name, target_academic_year, instructor_name").eq("id", clean_sess_id))
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Lecture session not found.")
        
    sess_obj = session_res.data[0]
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

    # 5. Fetch Student from DB
    res = safe_db_execute(supabase.table("students").select(
        "id, student_roll, full_name, academic_year, face_encoding"
    ).ilike("student_roll", clean_roll))
    
    if not res.data:
        res = safe_db_execute(supabase.table("students").select(
            "id, student_roll, full_name, academic_year, face_encoding"
        ).eq("student_roll", clean_roll))
        
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Student with Roll '{clean_roll}' not found.")
        
    student = res.data[0]

    # 6. Check Academic Year / Cohort / Sub-Batch Match
    target_year = sess_obj.get("target_academic_year")
    student_year = student.get("academic_year") or ""
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
        import cv2
        raw_img = Image.open(io.BytesIO(contents))
        image = ImageOps.exif_transpose(raw_img).convert('RGB')
        image_np = np.array(image)
        image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        
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
        confidence_score = await asyncio.to_thread(_verify_selfie)
    except HTTPException:
        raise
    except Exception as e:
        print("Error in selfie face matching:", e)
        raise HTTPException(status_code=500, detail="AI face analysis failed. Please try again.")

    # 8. Check if already marked present in this session (Verified strictly AFTER authentic biometric face match)
    existing_att = safe_db_execute(supabase.table("attendance").select("id, recorded_at, confidence_score").eq("session_id", session_id).eq("student_id", student["id"]))
    if existing_att.data:
        rec_time = existing_att.data[0].get("recorded_at", "Earlier Today")
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
            "confidence": existing_att.data[0].get("confidence_score", confidence_score)
        }

    # 9. Record Attendance in Supabase
    try:
        safe_db_execute(supabase.table("attendance").upsert({
            "session_id": session_id,
            "student_id": student["id"],
            "status": "Present",
            "capture_mode": "Live Scan",
            "confidence_score": confidence_score
        }, on_conflict="session_id,student_id"))
        
        # 10. Lock Device for this Student & Session (Shared & Persistent)
        if device_id and device_id.strip():
            record_device_lock(session_id, device_id, clean_roll)

        # Sync memory cache if stream is currently active
        try:
            from app.stream import session_recognized_students
            if session_id in session_recognized_students:
                session_recognized_students[session_id].add(student["id"])
        except Exception:
            pass
            
        return {
            "success": True,
            "already_marked": False,
            "message": f"Attendance verified successfully for {student['full_name']}!",
            "student_name": student["full_name"],
            "student_roll": student["student_roll"],
            "academic_year": student.get("academic_year") or "MBBS",
            "confidence": confidence_score,
            "recorded_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    except Exception as e:
        print("Database insert error:", e)
        # Check if inserted concurrently
        existing = safe_db_execute(supabase.table("attendance").select("id, recorded_at, confidence_score").eq("session_id", session_id).eq("student_id", student["id"]))
        if existing.data:
            if device_id and device_id.strip():
                record_device_lock(session_id, device_id, clean_roll)
            return {
                "success": True,
                "already_marked": True,
                "message": f"Attendance already recorded for {student['full_name']}.",
                "student_name": student["full_name"],
                "student_roll": student["student_roll"],
                "academic_year": student.get("academic_year") or "MBBS",
                "confidence": existing.data[0].get("confidence_score", confidence_score),
                "recorded_at": existing.data[0].get("recorded_at", "Just now")
            }
        raise HTTPException(status_code=500, detail="Failed to save attendance record.")


# ==========================================
# WhatsApp Multi-Device QR Bridge Notifications
# ==========================================

from app.whatsapp import (
    get_whatsapp_status,
    disconnect_whatsapp,
    send_whatsapp_raw,
    send_session_absentee_alerts,
    get_whatsapp_job_status
)

class WhatsAppTestRequest(BaseModel):
    phone: str
    message: Optional[str] = None

class WhatsAppAlertRequest(BaseModel):
    session_id: str
    async_mode: Optional[bool] = True

@router.get("/api/whatsapp/status")
async def api_whatsapp_status():
    """Returns real-time WhatsApp Web connection status, active QR code, and linked phone number."""
    return await asyncio.to_thread(get_whatsapp_status)

@router.post("/api/whatsapp/disconnect")
async def api_whatsapp_disconnect():
    """Disconnects the active WhatsApp account and generates a fresh QR code."""
    return await asyncio.to_thread(disconnect_whatsapp)

@router.post("/api/whatsapp/test")
async def api_whatsapp_test(req: WhatsAppTestRequest):
    """Sends a test WhatsApp message from the connected account."""
    msg = req.message or "🏫 *Jagannath Gupta Institute of Medical Sciences & Hospital*\nThis is a verified test message from your MedAttend Attendance Notification System."
    return await asyncio.to_thread(send_whatsapp_raw, req.phone, msg)

@router.post("/api/whatsapp/send-absent-alerts")
async def api_whatsapp_send_absent_alerts(req: WhatsAppAlertRequest):
    """
    Step 8 — Non-Blocking WhatsApp Absentee Alert Dispatcher.
    Dispatches WhatsApp absent notices asynchronously from the connected account with safe anti-spam throttling.
    """
    return await asyncio.to_thread(send_session_absentee_alerts, req.session_id, req.async_mode)

@router.get("/api/whatsapp/job-status/{job_id}")
async def api_whatsapp_job_status(job_id: str):
    """Fetches real-time status and live counter of a background WhatsApp alert dispatch job."""
    return await asyncio.to_thread(get_whatsapp_job_status, job_id)

