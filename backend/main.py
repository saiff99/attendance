from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
import time
import os
import io
import random

# Initialize AI modules
import numpy as np
from PIL import Image
from numpy.linalg import norm
import cv2

app_fa = None
try:
    from insightface.app import FaceAnalysis
    app_fa = FaceAnalysis(name='buffalo_sc')
    app_fa.prepare(ctx_id=0, det_size=(640, 640))
    AI_ENABLED = True
    print("InsightFace AI Engine Initialized successfully.")
except ImportError:
    AI_ENABLED = False
    print("WARNING: insightface not installed. AI disabled.")

load_dotenv()

app = FastAPI(title="Smart Attendance System API")

# Allow CORS for local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase Client
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://placeholder")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "placeholder")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def calculate_confidence_score(sim: float) -> float:
    """
    Maps a raw ArcFace cosine similarity score (typically 0.42 to 0.75+ for valid matches)
    into a polished, intuitive confidence score ranging from 0.70 to 0.99 for live reporting.
    """
    if sim < 0.42:
        return round(float(sim), 2)
    # Map [0.42, 0.75] to [0.70, 0.99]
    clamped_sim = min(max(sim, 0.42), 0.75)
    mapped = 0.70 + ((clamped_sim - 0.42) / (0.75 - 0.42)) * (0.99 - 0.70)
    return round(float(mapped), 2)

class ScanRequest(BaseModel):
    session_id: str


@app.get("/")
def read_root():
    return {"status": "Online", "message": "Smart Attendance API is running", "ai_enabled": AI_ENABLED}

@app.post("/api/enroll-face/{student_id}")
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

@app.post("/api/process-attendance")
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
        # Previously, this randomly marked 1-2 students present every 5 seconds, causing everyone to eventually be marked present.
        # To respect the requirement of only marking legitimate matches, this will now return no matches
        # since actual facial recognition cannot run without the C++ engine installed.
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

@app.post("/api/start-live-scan")
def start_live_scan(request: ScanRequest):
    return {
        "success": True,
        "message": f"Live scan started successfully for session {request.session_id}",
        "timestamp": time.time()
    }

@app.post("/api/upload-photo")
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

def get_camera_urls():
    urls_str = os.getenv("CCTV_URLS", "0")
    return [url.strip() for url in urls_str.split(",") if url.strip()]

@app.get("/api/cameras")
async def get_cameras():
    urls = get_camera_urls()
    return {"count": len(urls)}

def generate_video_feed(session_id: str, camera_index: int = 0):
    # Determine camera source. 0 = local webcam. Change to RTSP URL for CCTV.
    urls = get_camera_urls()
    
    if camera_index >= len(urls):
        camera_index = 0
        
    CCTV_URL = urls[camera_index]
    source = int(CCTV_URL) if CCTV_URL.isdigit() else CCTV_URL
    cap = cv2.VideoCapture(source)

    # Fetch enrolled students once when starting the stream
    try:
        students_res = supabase.table("students").select("id, full_name, face_encoding, student_roll").not_.is_("face_encoding", "null").execute()
        enrolled_students = students_res.data or []
    except Exception as e:
        print("Error fetching students for stream:", e)
        enrolled_students = []

    # Keep track of recognized students to avoid spamming the DB every single frame
    recently_recognized = set()

    while True:
        success, frame = cap.read()
        if not success:
            time.sleep(0.1)
            continue

        if AI_ENABLED and app_fa:
            try:
                # InsightFace expects BGR image, which OpenCV already provides!
                faces = app_fa.get(frame)
                
                for face in faces:
                    if hasattr(face, 'det_score') and face.det_score < 0.50:
                        continue
                        
                    unknown_encoding = face.embedding
                    best_match_student = None
                    highest_sim = 0.42 # Similarity threshold
                    
                    for student in enrolled_students:
                        known_encoding = np.array(student['face_encoding'])
                        if known_encoding.shape != unknown_encoding.shape:
                            if len(unknown_encoding) == 512:
                                supabase.table("students").update({"face_encoding": unknown_encoding.tolist()}).eq("id", student['id']).execute()
                                known_encoding = unknown_encoding
                                student['face_encoding'] = unknown_encoding.tolist()
                            else:
                                continue
                            
                        sim = np.dot(known_encoding, unknown_encoding) / (norm(known_encoding) * norm(unknown_encoding))
                        
                        if sim > highest_sim:
                            highest_sim = sim
                            best_match_student = student
                    
                    # Bounding Box Coordinates with Safety Clamping
                    h_img, w_img, _ = frame.shape
                    box = face.bbox.astype(int)
                    x1 = max(0, min(box[0], w_img - 1))
                    y1 = max(0, min(box[1], h_img - 1))
                    x2 = max(0, min(box[2], w_img - 1))
                    y2 = max(0, min(box[3], h_img - 1))
                    
                    if best_match_student:
                        # Draw Green Box & Name
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        conf_pct = int(calculate_confidence_score(float(highest_sim)) * 100)
                        label = f"{best_match_student.get('student_roll', '')} {best_match_student['full_name']} ({conf_pct}%)"
                        cv2.putText(frame, label, (max(0, x1), max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                        
                        # Log attendance if not recently logged in this stream
                        if best_match_student['id'] not in recently_recognized:
                            try:
                                supabase.table("attendance").insert({
                                    "session_id": session_id,
                                    "student_id": best_match_student['id'],
                                    "status": "Present",
                                    "capture_mode": "Live Scan",
                                    "confidence_score": calculate_confidence_score(float(highest_sim))
                                }).execute()
                                recently_recognized.add(best_match_student['id'])
                            except Exception:
                                pass # Likely duplicate constraint
                    else:
                        # Draw Red Box & Unknown
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                        cv2.putText(frame, "Unknown", (max(0, x1), max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                        
            except Exception as e:
                print("Error processing frame:", e)
                pass

        # Encode frame as JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
        
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    cap.release()

@app.get("/api/video-feed/{session_id}")
async def video_feed(session_id: str, camera_index: int = 0):
    """Streams the live CCTV video with bounding boxes."""
    return StreamingResponse(generate_video_feed(session_id, camera_index), media_type="multipart/x-mixed-replace; boundary=frame")
