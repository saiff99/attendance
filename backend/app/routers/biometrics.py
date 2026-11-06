import asyncio
import io
import hmac
from datetime import datetime, timezone
from typing import Optional, List

import numpy as np
from numpy.linalg import norm
from PIL import Image, ImageOps
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form

from app.config import supabase
from app.ai import app_fa, AI_ENABLED, get_ai_semaphore
from app.security import INTERNAL_API_KEY
from app.biometric_cache import invalidate_biometric_cache
from app.routers.helpers import get_real_client_ip, safe_read_image_file, MAX_SELFIE_IMAGE_SIZE

router = APIRouter(tags=["Biometrics"])


def verify_biometric_actor_auth(request: Request, actor_form: Optional[str] = None) -> dict:
    """
    Enforces strict Zero-Trust authorization for biometric enrollment & revocation (DPDP Act 2023).
    Ensures the caller has a valid X-Internal-API-Key or verified admin authorization token,
    and extracts verified administrator identity from trusted server headers.
    """
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
        elif consent_granted.strip().lower() in ("true", "1", "yes", "affirmative"):
            is_consented = True

    if not is_consented:
        raise HTTPException(
            status_code=400,
            detail="Biometric consent is mandatory before enrolling facial template (DPDP Act 2023). Explicit affirmative consent must be confirmed."
        )

    # 3. Verify student exists in database and is active before proceeding with AI extraction
    try:
        check = supabase.table("students").select("id, student_roll, full_name, academic_year, is_active, biometric_consent").eq("id", student_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found.")
        student_info = check.data[0]
        if student_info.get("is_active") is False or str(student_info.get("academic_year", "")).startswith("[ARCHIVED]"):
            raise HTTPException(
                status_code=403,
                detail="Cannot register or modify facial biometrics for an archived or inactive student profile."
            )
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
        import cv2  # type: ignore
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
        async with get_ai_semaphore():
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

        invalidate_biometric_cache(student_id)

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
        elif consent_granted.strip().lower() in ("true", "1", "yes", "affirmative"):
            is_consented = True

    if not is_consented:
        raise HTTPException(
            status_code=400,
            detail="Biometric consent is mandatory before enrolling facial template (DPDP Act 2023). Explicit affirmative consent must be confirmed."
        )

    # 3. Verify student exists in database and is active before proceeding with AI extraction
    try:
        check = supabase.table("students").select("id, student_roll, full_name, academic_year, is_active, biometric_consent").eq("id", student_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found.")
        student_info = check.data[0]
        if student_info.get("is_active") is False or str(student_info.get("academic_year", "")).startswith("[ARCHIVED]"):
            raise HTTPException(
                status_code=403,
                detail="Cannot register or modify facial biometrics for an archived or inactive student profile."
            )
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
        import cv2  # type: ignore
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
        async with get_ai_semaphore():
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

        invalidate_biometric_cache(student_id)

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

    # 4. Immediately purge student from in-memory photo scan & stream caches
    invalidation_result = invalidate_biometric_cache(student_id)

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

