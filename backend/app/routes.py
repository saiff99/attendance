import io
import time
import random
import numpy as np
from PIL import Image
from numpy.linalg import norm
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import supabase, get_camera_urls
from app.ai import app_fa, AI_ENABLED, calculate_confidence_score
from app.stream import generate_video_feed

router = APIRouter()

class ScanRequest(BaseModel):
    session_id: str

@router.get("/")
def read_root():
    return {"status": "Online", "message": "Smart Attendance API is running", "ai_enabled": AI_ENABLED}

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
    except Exception as e:
        print("Database error:", str(e))
        raise HTTPException(status_code=500, detail="Failed to save face encoding to database.")

    return {"success": True, "message": "Face data enrolled successfully!", "ai_used": AI_ENABLED}

@router.post("/api/process-attendance")
async def process_attendance(file: UploadFile = File(...), session_id: str = Form(...)):
    """
    Receives an image (e.g., a classroom photo), detects all faces, matches them against
    enrolled students, and logs attendance.
    """
    contents = await file.read()
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    # 1. Fetch enrolled students
    students_res = supabase.table("students").select("id, full_name, face_encoding").not_.is_("face_encoding", "null").execute()
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
                if hasattr(face, 'det_score') and face.det_score < 0.50:
                    continue
                    
                unknown_encoding = face.embedding
                best_match_student = None
                highest_sim = 0.42 # Similarity threshold (cosine similarity)
                
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
    urls = get_camera_urls()
    return {"count": len(urls)}

@router.get("/api/video-feed/{session_id}")
async def video_feed(session_id: str, camera_index: int = 0):
    """Streams the live CCTV video with bounding boxes."""
    return StreamingResponse(generate_video_feed(session_id, camera_index), media_type="multipart/x-mixed-replace; boundary=frame")
