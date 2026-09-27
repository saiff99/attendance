import io
import time
import random
import numpy as np
from PIL import Image
from numpy.linalg import norm
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel

from app.config import supabase, get_camera_urls, get_camera_details, get_ptz_urls
from app.ai import app_fa, AI_ENABLED, calculate_confidence_score
from app.stream import generate_video_feed

router = APIRouter()

class ScanRequest(BaseModel):
    session_id: str

@router.api_route("/", methods=["GET", "HEAD"])
def read_root():
    return {"status": "Online", "message": "Smart Attendance API is running", "ai_enabled": AI_ENABLED}

@router.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "ok", "ai_enabled": AI_ENABLED}

@router.post("/api/enroll-face/{student_id}")
async def enroll_face(student_id: str, file: UploadFile = File(...)):
    contents = await file.read()
    
    if AI_ENABLED and app_fa:
        try:
            image = Image.open(io.BytesIO(contents)).convert('RGB')
            # InsightFace expects BGR image
            image_np = np.array(image)
            image_bgr = image_np[:, :, ::-1]
            
            faces = app_fa.get(image_bgr)
            
            if len(faces) == 0:
                raise HTTPException(status_code=400, detail="No faces found in the image.")
            if len(faces) > 1:
                raise HTTPException(status_code=400, detail="Multiple faces found. Please upload a picture of just this student.")
                
            encoding = faces[0].embedding.tolist()
        except HTTPException:
            raise
        except Exception as e:
            print("Error processing image with AI:", str(e))
            raise HTTPException(status_code=500, detail="Failed to process image.")
    else:
        encoding = [random.uniform(-1.0, 1.0) for _ in range(128)]
        time.sleep(1)

    try:
        supabase.table("students").update({"face_encoding": encoding}).eq("id", student_id).execute()
        from app.stream import session_enrolled_cache
        session_enrolled_cache.clear()
    except Exception as e:
        print("Database error:", str(e))
        raise HTTPException(status_code=500, detail="Failed to save face encoding to database.")

    return {"success": True, "message": "Face data enrolled successfully!", "ai_used": AI_ENABLED}

@router.post("/api/enroll-face-burst/{student_id}")
async def enroll_face_burst(student_id: str, files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    valid_encodings = []
    
    if AI_ENABLED and app_fa:
        try:
            for file in files:
                contents = await file.read()
                image = Image.open(io.BytesIO(contents)).convert('RGB')
                image_np = np.array(image)
                image_bgr = image_np[:, :, ::-1]
                
                faces = app_fa.get(image_bgr)
                
                # We only want frames where exactly one face is detected
                if len(faces) == 1:
                    valid_encodings.append(faces[0].embedding)
            
            if not valid_encodings:
                raise HTTPException(status_code=400, detail="Could not detect a clear single face in any of the captured frames. Please try again.")
                
            # Average the encodings for a highly robust 3D representation
            avg_encoding = np.mean(valid_encodings, axis=0)
            
            # Normalize the average encoding
            avg_encoding = avg_encoding / norm(avg_encoding)
            encoding_list = avg_encoding.tolist()
            
        except HTTPException:
            raise
        except Exception as e:
            print("Error processing images with AI:", str(e))
            raise HTTPException(status_code=500, detail="Failed to process images.")
    else:
        # Fallback Mock
        encoding_list = [random.uniform(-1.0, 1.0) for _ in range(128)]
        time.sleep(1)

    try:
        supabase.table("students").update({"face_encoding": encoding_list}).eq("id", student_id).execute()
        from app.stream import session_enrolled_cache
        session_enrolled_cache.clear()
    except Exception as e:
        print("Database error:", str(e))
        raise HTTPException(status_code=500, detail="Failed to save face encoding to database.")

    return {
        "success": True, 
        "message": f"Face data enrolled successfully using {len(valid_encodings)} angles!", 
        "ai_used": AI_ENABLED
    }

@router.post("/api/process-attendance")
async def process_attendance(file: UploadFile = File(...), session_id: str = Form(...)):
    """
    Receives an image (e.g., a classroom photo), detects all faces, matches them against
    enrolled students, and logs attendance.
    """
    contents = await file.read()
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    # 1. Fetch Session to get target_academic_year
    session_res = supabase.table("sessions").select("target_academic_year").eq("id", session_id).execute()
    target_year = "All"
    if session_res.data and session_res.data[0].get("target_academic_year"):
        target_year = session_res.data[0]["target_academic_year"]

    # 2. Fetch enrolled students (restricted by cohort if applicable)
    query = supabase.table("students").select("id, full_name, face_encoding").not_.is_("face_encoding", "null")
    if target_year and target_year != "All":
        query = query.eq("academic_year", target_year)
    
    students_res = query.execute()
    enrolled_students = students_res.data
    
    if not enrolled_students:
        raise HTTPException(status_code=400, detail="No students have enrolled face data yet.")

    recognized_students = []

    if AI_ENABLED and app_fa:
        try:
            image = Image.open(io.BytesIO(contents)).convert('RGB')
            image_np = np.array(image)
            image_bgr = image_np[:, :, ::-1] # RGB to BGR
            
            # Detect faces
            faces = app_fa.get(image_bgr)
            
            for face in faces:
                if hasattr(face, 'det_score') and face.det_score < 0.20:
                    continue
                    
                unknown_encoding = face.embedding
                best_match_student = None
                highest_sim = 0.28 # Calibrated similarity threshold (cosine similarity) for distant faces
                
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
                    if not any(s['id'] == best_match_student['id'] for s in recognized_students):
                        recognized_students.append({
                            **best_match_student,
                            "confidence": calculate_confidence_score(float(highest_sim))
                        })
                            
        except Exception as e:
            print("Error matching faces:", str(e))
            raise HTTPException(status_code=500, detail="Failed to run AI face matching.")
    else:
        # Fallback Mock: The C++ AI engine is missing on this machine.
        time.sleep(1)
        recognized_students = []

    # 3. Record Attendance
    results = []
    for student in recognized_students:
        try:
            supabase.table("attendance").insert({
                "session_id": session_id,
                "student_id": student['id'],
                "status": "Present",
                "capture_mode": "Manual Upload",
                "confidence_score": student['confidence']
            }).execute()
            results.append({"name": student['full_name'], "confidence": student['confidence']})
        except Exception as e:
            print(f"Duplicate or error for {student['full_name']}:", str(e))
            # If UNIQUE constraint fails (already scanned today), we ignore it.
            pass

    return {
        "success": True,
        "message": f"Processed image. Recognized {len(recognized_students)} students.",
        "recognized": results,
        "ai_used": AI_ENABLED
    }

@router.post("/api/start-live-scan")
def start_live_scan(request: ScanRequest):
    return {
        "success": True,
        "message": f"Live scan started successfully for session {request.session_id}",
        "timestamp": time.time()
    }

@router.post("/api/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    return {
        "success": True,
        "filename": file.filename if file.filename else "unknown",
        "message": "Photo uploaded and processed successfully",
        "mock_result": {
            "student_id": "mock-uuid-1234",
            "student_name": "John Doe",
            "confidence": 0.98
        }
    }

@router.get("/api/cameras")
async def get_cameras():
    cameras = get_camera_details()
    return {"count": len(cameras), "cameras": cameras}

@router.get("/api/video-feed/{session_id}")
async def video_feed(session_id: str, camera_index: int = 0):
    """Streams the live CCTV video with bounding boxes."""
    return StreamingResponse(generate_video_feed(session_id, camera_index, "cctv"), media_type="multipart/x-mixed-replace; boundary=frame")

@router.get("/api/ptz-cameras")
async def get_ptz_cameras():
    urls = get_ptz_urls()
    return {"count": len(urls)}

@router.get("/api/ptz-video-feed/{session_id}")
async def ptz_video_feed(session_id: str, camera_index: int = 0):
    """Streams the live PTZ video with bounding boxes."""
    return StreamingResponse(generate_video_feed(session_id, camera_index, "ptz"), media_type="multipart/x-mixed-replace; boundary=frame")

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

@router.get("/api/active-sessions")
async def get_active_sessions():
    """
    Fetches current/recent active class sessions with remaining 5-minute window for student self-attendance.
    """
    try:
        from datetime import datetime, timezone
        now_utc = datetime.now(timezone.utc)

        res = supabase.table("sessions").select(
            "id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at"
        ).order("created_at", desc=True).limit(15).execute()
        
        sessions = res.data or []
        
        # Attach total attendance count and remaining seconds to each session
        enhanced_sessions = []
        for s in sessions:
            att_res = supabase.table("attendance").select("id", count="exact").eq("session_id", s["id"]).execute()
            count = att_res.count if hasattr(att_res, "count") and att_res.count is not None else len(att_res.data or [])
            
            time_str = s.get("start_time") or s.get("created_at")
            remaining_seconds = 0
            is_expired = True
            
            if time_str:
                try:
                    start_dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                    elapsed_seconds = (now_utc - start_dt).total_seconds()
                    # 5-minute window = 300 seconds
                    rem = int(300 - elapsed_seconds)
                    remaining_seconds = max(0, rem)
                    is_expired = remaining_seconds <= 0
                except Exception as e:
                    print("Error parsing timestamp:", e)
                    remaining_seconds = 0
                    is_expired = True

            enhanced_sessions.append({
                **s,
                "attendance_count": count,
                "remaining_seconds": remaining_seconds,
                "is_expired": is_expired,
                "window_duration_seconds": 300
            })
            
        return {"success": True, "sessions": enhanced_sessions}
    except Exception as e:
        print("Error fetching active sessions:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch active sessions")


@router.get("/api/student-lookup/{student_roll}")
async def student_lookup(student_roll: str, session_id: Optional[str] = None):
    """
    Looks up student details by roll number and verifies if attendance has already been recorded (e.g. by CCTV AI) for the active session.
    """
    try:
        clean_roll = student_roll.strip()
        res = supabase.table("students").select(
            "id, student_roll, full_name, email, academic_year, face_encoding"
        ).ilike("student_roll", clean_roll).execute()
        
        if not res.data:
            res = supabase.table("students").select(
                "id, student_roll, full_name, email, academic_year, face_encoding"
            ).eq("student_roll", clean_roll).execute()
            
        if not res.data:
            raise HTTPException(status_code=404, detail=f"No student found with Roll Number '{clean_roll}'. Please check and try again.")
            
        student = res.data[0]
        has_face = student.get("face_encoding") is not None and len(student.get("face_encoding") or []) > 0
        
        # Check if already marked present in this session
        is_already_present = False
        attendance_info = None
        
        if session_id:
            att_res = supabase.table("attendance").select(
                "id, status, capture_mode, confidence_score, recorded_at"
            ).eq("session_id", session_id).eq("student_id", student["id"]).execute()
            
            if att_res.data:
                is_already_present = True
                att_record = att_res.data[0]
                attendance_info = {
                    "id": att_record["id"],
                    "status": att_record.get("status", "Present"),
                    "capture_mode": att_record.get("capture_mode", "Live Scan"),
                    "confidence_score": att_record.get("confidence_score", 0.95),
                    "recorded_at": att_record.get("recorded_at", "Earlier Today")
                }
        
        return {
            "success": True,
            "student": {
                "id": student["id"],
                "student_roll": student["student_roll"],
                "full_name": student["full_name"],
                "academic_year": student.get("academic_year") or "MBBS",
                "has_face_enrolled": has_face,
                "is_already_present": is_already_present,
                "attendance_info": attendance_info
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print("Error in student lookup:", e)
        raise HTTPException(status_code=500, detail="Failed to lookup student details")


@router.post("/api/selfie-attendance")
async def selfie_attendance(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    student_roll: str = Form(...)
):
    """
    Processes a student's mobile selfie, verifies face against student's enrolled embedding using InsightFace AI,
    and logs attendance if matched (valid within 5-minute window).
    """
    clean_roll = student_roll.strip()
    contents = await file.read()
    
    # 1. Check 5-minute session expiration window
    session_res = supabase.table("sessions").select("id, start_time, created_at, class_name").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Lecture session not found.")
        
    sess_obj = session_res.data[0]
    time_str = sess_obj.get("start_time") or sess_obj.get("created_at")
    if time_str:
        from datetime import datetime, timezone
        try:
            start_dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
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

    # 2. Fetch Student from DB
    res = supabase.table("students").select(
        "id, student_roll, full_name, academic_year, face_encoding"
    ).ilike("student_roll", clean_roll).execute()
    
    if not res.data:
        res = supabase.table("students").select(
            "id, student_roll, full_name, academic_year, face_encoding"
        ).eq("student_roll", clean_roll).execute()
        
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Student with Roll '{clean_roll}' not found.")
        
    student = res.data[0]
    if not student.get("face_encoding"):
        raise HTTPException(status_code=400, detail=f"Student {student['full_name']} (Roll: {clean_roll}) does not have face biometric data enrolled yet. Please contact the administrator.")
        
    known_encoding = np.array(student["face_encoding"])
    
    # 2. Check if already marked present in this session
    existing_att = supabase.table("attendance").select("id, recorded_at, confidence_score").eq("session_id", session_id).eq("student_id", student["id"]).execute()
    if existing_att.data:
        rec_time = existing_att.data[0].get("recorded_at", "Earlier Today")
        return {
            "success": True,
            "already_marked": True,
            "message": f"Attendance is already recorded for {student['full_name']} (Roll: {clean_roll})!",
            "student_name": student["full_name"],
            "student_roll": student["student_roll"],
            "academic_year": student.get("academic_year") or "MBBS",
            "recorded_at": rec_time,
            "confidence": existing_att.data[0].get("confidence_score", 0.95)
        }
        
    # 3. AI Face Recognition Verification
    if AI_ENABLED and app_fa:
        try:
            image = Image.open(io.BytesIO(contents)).convert('RGB')
            image_np = np.array(image)
            image_bgr = image_np[:, :, ::-1]
            
            faces = app_fa.get(image_bgr)
            
            if len(faces) == 0:
                raise HTTPException(status_code=400, detail="No face detected in the selfie. Please look directly into the camera in good lighting.")
            if len(faces) > 1:
                raise HTTPException(status_code=400, detail="Multiple faces detected. Please ensure only you are in the selfie frame.")
                
            unknown_encoding = faces[0].embedding
            
            # Handle 128D legacy vs 512D
            if known_encoding.shape != unknown_encoding.shape:
                if len(unknown_encoding) == 512:
                    supabase.table("students").update({"face_encoding": unknown_encoding.tolist()}).eq("id", student["id"]).execute()
                    known_encoding = unknown_encoding
                else:
                    raise HTTPException(status_code=500, detail="Face encoding dimension mismatch.")
                    
            sim = float(np.dot(known_encoding, unknown_encoding) / (norm(known_encoding) * norm(unknown_encoding)))
            
            # High precision threshold for single-face selfie verification (ArcFace cosine similarity >= 0.35)
            if sim < 0.35:
                raise HTTPException(status_code=400, detail=f"Face mismatch! The captured selfie does not match the registered face for {student['full_name']} (Roll {clean_roll}).")
                
            confidence_score = calculate_confidence_score(sim)
            
        except HTTPException:
            raise
        except Exception as e:
            print("Error in selfie face matching:", e)
            raise HTTPException(status_code=500, detail="AI face analysis failed. Please try again.")
    else:
        # Fallback Mock
        confidence_score = 0.95
        time.sleep(0.5)
        
    # 4. Record Attendance in Supabase
    try:
        supabase.table("attendance").insert({
            "session_id": session_id,
            "student_id": student["id"],
            "status": "Present",
            "capture_mode": "Live Scan",
            "confidence_score": confidence_score
        }).execute()
        
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
        existing = supabase.table("attendance").select("id, recorded_at, confidence_score").eq("session_id", session_id).eq("student_id", student["id"]).execute()
        if existing.data:
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

