import cv2
import time
import numpy as np
from numpy.linalg import norm
from app.config import supabase, get_camera_urls, get_ptz_urls
from app.ai import app_fa, AI_ENABLED, calculate_confidence_score

def generate_video_feed(session_id: str, camera_index: int = 0, camera_type: str = "cctv"):
    # Determine camera source. 0 = local webcam. Change to RTSP URL for CCTV.
    if camera_type == "ptz":
        urls = get_ptz_urls()
    else:
        urls = get_camera_urls()
    
    if camera_index >= len(urls):
        camera_index = 0
        
    CCTV_URL = urls[camera_index]
    source = int(CCTV_URL) if CCTV_URL.isdigit() else CCTV_URL
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)

    # Fetch enrolled students once when starting the stream
    try:
        # 1. Fetch Session to get target_academic_year
        session_res = supabase.table("sessions").select("target_academic_year").eq("id", session_id).execute()
        target_year = "All"
        if session_res.data and session_res.data[0].get("target_academic_year"):
            target_year = session_res.data[0]["target_academic_year"]

        # 2. Fetch enrolled students (restricted by cohort if applicable)
        query = supabase.table("students").select("id, full_name, face_encoding, student_roll").not_.is_("face_encoding", "null")
        if target_year and target_year != "All":
            query = query.eq("academic_year", target_year)
            
        students_res = query.execute()
        enrolled_students = students_res.data or []
    except Exception as e:
        print("Error fetching students for stream:", e)
        enrolled_students = []

    # Keep track of recognized students to avoid spamming the DB every single frame
    recently_recognized = set()
    
    frame_count = 0
    last_faces = [] # Cache detection state to draw overlays instantly at native 30fps

    while True:
        success, frame = cap.read()
        if not success:
            time.sleep(0.01)
            continue
            
        frame_count += 1

        if AI_ENABLED and app_fa:
            # Throttle heavy InsightFace AI processing to run once every 30 frames (approx 1 fps) to prevent lag
            if frame_count % 30 == 1:
                try:
                    faces = app_fa.get(frame)
                    current_faces = []
                    
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
                        
                        current_faces.append({
                            "coords": (x1, y1, x2, y2),
                            "student": best_match_student,
                            "sim": highest_sim
                        })
                        
                        if best_match_student:
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
                                    
                    last_faces = current_faces
                except Exception as e:
                    print("Error processing frame AI:", e)
                    pass

            # Instantly draw cached overlays onto current frame for silky-smooth output
            for f_info in last_faces:
                x1, y1, x2, y2 = f_info["coords"]
                student = f_info["student"]
                sim = f_info["sim"]
                
                if student:
                    # Draw Green Box & Name
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    conf_pct = int(calculate_confidence_score(float(sim)) * 100)
                    label = f"{student.get('student_roll', '')} {student['full_name']} ({conf_pct}%)"
                    cv2.putText(frame, label, (max(0, x1), max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                else:
                    # Draw Red Box & Unknown
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, "Unknown", (max(0, x1), max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        # Encode frame as JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
        
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    cap.release()
