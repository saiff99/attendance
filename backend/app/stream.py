import os
import cv2
import time
import threading
import numpy as np
from numpy.linalg import norm
from typing import Dict, List, Optional, Set
from app.config import supabase, get_camera_urls, get_camera_details, get_ptz_urls
from app.ai import app_fa, AI_ENABLED, calculate_confidence_score

# High-Performance Zero-Latency FFmpeg RTSP Flags
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0|reorder_queue_size;0|buffer_size;1024|probesize;32768|analyzeduration;0"
)

# Global session-wide deduplication set: session_id -> set of student_ids
session_recognized_students: Dict[str, Set[str]] = {}
session_enrolled_cache: Dict[str, List[dict]] = {}
session_last_fetch: Dict[str, float] = {}

def get_enrolled_students(session_id: str) -> List[dict]:
    """Fetches and caches enrolled students for the given session's cohort."""
    now = time.time()
    if session_id in session_enrolled_cache and (now - session_last_fetch.get(session_id, 0)) < 60:
        return session_enrolled_cache[session_id]

    try:
        session_res = supabase.table("sessions").select("target_academic_year").eq("id", session_id).execute()
        target_year = "All"
        if session_res.data and session_res.data[0].get("target_academic_year"):
            target_year = session_res.data[0]["target_academic_year"]

        query = supabase.table("students").select("id, full_name, face_encoding, student_roll").not_.is_("face_encoding", "null")
        if target_year and target_year != "All":
            query = query.eq("academic_year", target_year)
            
        students_res = query.execute()
        enrolled = students_res.data or []
        session_enrolled_cache[session_id] = enrolled
        session_last_fetch[session_id] = now
        return enrolled
    except Exception as e:
        print(f"Error fetching students for session {session_id}: {e}")
        return session_enrolled_cache.get(session_id, [])


class ThreadedRTSPStream:
    """
    High-Performance Zero-Latency RTSP Stream Grabber.
    Pre-processes frames at capture time into optimal display and AI resolutions,
    eliminating 4K bottleneck and CPU memory churn.
    """
    def __init__(self, url: str, name: str = "CCTV Camera"):
        self.url = url
        self.name = name
        self.source = int(url) if url.isdigit() else url
        self.cap: Optional[cv2.VideoCapture] = None
        
        # Dual buffers: Low-res for instant grid display (640x360) & HD for AI (640x360)
        self.latest_display_frame: Optional[np.ndarray] = None
        self.latest_ai_frame: Optional[np.ndarray] = None
        self.raw_w = 640
        self.raw_h = 360
        
        self.last_faces: List[dict] = []
        self.running = False
        self.connected = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        
        self.last_ai_time = 0.0
        self.ai_busy = False

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _capture_loop(self):
        consecutive_failures = 0
        while self.running:
            try:
                if self.cap is None or not self.cap.isOpened():
                    self.connected = False
                    if isinstance(self.source, str):
                        self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                    else:
                        self.cap = cv2.VideoCapture(self.source)
                    self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    if not self.cap.isOpened():
                        time.sleep(1.5)
                        continue
                    self.connected = True
                    consecutive_failures = 0

                # FAST HARDWARE FLUSH: Grab pending buffered packets to ensure zero backlog delay
                grabbed = False
                for _ in range(3):
                    if self.cap.grab():
                        grabbed = True
                    else:
                        break

                if not grabbed:
                    consecutive_failures += 1
                    # Tolerate brief H.265 keyframe intervals before destroying stream
                    if consecutive_failures > 20:
                        self.connected = False
                        if self.cap:
                            self.cap.release()
                        self.cap = None
                        consecutive_failures = 0
                        time.sleep(1.0)
                    else:
                        time.sleep(0.02)
                    continue

                success, frame = self.cap.retrieve()
                if not success or frame is None:
                    continue

                consecutive_failures = 0
                self.connected = True
                h, w, _ = frame.shape
                self.raw_w = w
                self.raw_h = h

                # Downscale immediately to 640x360 for instantaneous zero-lag rendering
                display_frame = cv2.resize(frame, (640, 360), interpolation=cv2.INTER_LINEAR)
                ai_frame = display_frame

                with self.lock:
                    self.latest_display_frame = display_frame
                    self.latest_ai_frame = ai_frame

                time.sleep(0.02)

            except Exception as e:
                print(f"Stream capture exception on {self.name}: {e}")
                self.connected = False
                if self.cap:
                    self.cap.release()
                self.cap = None
                time.sleep(2.0)

        if self.cap:
            self.cap.release()
            self.cap = None

    def get_frame_with_overlays(self, session_id: str, is_grid: bool = True) -> Optional[np.ndarray]:
        """Returns frame with overlays instantly (<0.2ms) without blocking on AI inference."""
        with self.lock:
            if is_grid:
                if self.latest_display_frame is None:
                    return None
                frame = self.latest_display_frame.copy()
            else:
                if self.latest_ai_frame is None:
                    return None
                frame = self.latest_ai_frame.copy()
            
            ai_input_frame = self.latest_ai_frame

        now = time.time()
        # Trigger non-blocking AI inference in background worker every 0.6s
        if AI_ENABLED and app_fa and not self.ai_busy and ai_input_frame is not None and (now - self.last_ai_time >= 0.6):
            self.last_ai_time = now
            self.ai_busy = True
            threading.Thread(target=self._async_ai_worker, args=(ai_input_frame.copy(), session_id), daemon=True).start()

        h_f, w_f, _ = frame.shape
        scale_x = w_f / 640.0
        scale_y = h_f / 360.0

        # Draw cached face overlays on lightweight frame
        for f_info in self.last_faces:
            orig_x1, orig_y1, orig_x2, orig_y2 = f_info["coords"]
            student = f_info.get("student")
            sim = f_info.get("sim", 0.0)

            # Map coordinates from 1280x720 AI scale to current display scale
            x1 = int(orig_x1 * scale_x)
            y1 = int(orig_y1 * scale_y)
            x2 = int(orig_x2 * scale_x)
            y2 = int(orig_y2 * scale_y)

            if student:
                # Green Box & Name + Roll
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                conf_pct = int(calculate_confidence_score(float(sim)) * 100)
                label = f"{student.get('student_roll', '')} {student.get('full_name', '')} ({conf_pct}%)"
                label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                badge_h = 20
                cv2.rectangle(frame, (x1, max(0, y1 - badge_h)), (x1 + label_size[0] + 6, max(0, y1)), (0, 180, 0), -1)
                cv2.putText(frame, label, (x1 + 3, max(0, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
            else:
                # Red Box & Unknown
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                label = "Unknown"
                label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                badge_h = 18
                cv2.rectangle(frame, (x1, max(0, y1 - badge_h)), (x1 + label_size[0] + 6, max(0, y1)), (0, 0, 200), -1)
                cv2.putText(frame, label, (x1 + 3, max(0, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # Camera title overlay
        cv2.putText(frame, self.name, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3)
        cv2.putText(frame, self.name, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)

        return frame

    def _async_ai_worker(self, frame: np.ndarray, session_id: str):
        """Runs AI detection asynchronously so video streaming is never delayed."""
        try:
            self._process_ai(frame, session_id)
        finally:
            self.ai_busy = False

    def _process_ai(self, frame: np.ndarray, session_id: str):
        """Detects faces in the frame and matches against enrolled students."""
        try:
            enrolled_students = get_enrolled_students(session_id)
            faces = app_fa.get(frame)
            
            if len(faces) == 0:
                enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
                faces = app_fa.get(enhanced)

            current_faces = []

            if session_id not in session_recognized_students:
                session_recognized_students[session_id] = set()

            recognized_set = session_recognized_students[session_id]

            for face in faces:
                if hasattr(face, 'det_score') and face.det_score < 0.20:
                    continue

                unknown_encoding = face.embedding
                best_match_student = None
                highest_sim = 0.28  # Cosine similarity threshold

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

                # Record attendance only once per student across all cameras
                if best_match_student:
                    student_id = best_match_student['id']
                    if student_id not in recognized_set:
                        try:
                            conf_score = calculate_confidence_score(float(highest_sim))
                            supabase.table("attendance").insert({
                                "session_id": session_id,
                                "student_id": student_id,
                                "status": "Present",
                                "capture_mode": "Live Scan",
                                "confidence_score": conf_score
                            }).execute()
                            recognized_set.add(student_id)
                            print(f"[ATTENDANCE] Recorded {best_match_student['full_name']} from {self.name} ({conf_score * 100:.0f}%)")
                        except Exception as e:
                            recognized_set.add(student_id)

            self.last_faces = current_faces
        except Exception as e:
            print(f"Error processing AI for {self.name}: {e}")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)


class CameraStreamManager:
    """Manages active threaded streams for all cameras."""
    def __init__(self):
        self.cctv_streams: Dict[int, ThreadedRTSPStream] = {}
        self.ptz_streams: Dict[int, ThreadedRTSPStream] = {}
        self.lock = threading.Lock()

    def get_cctv_stream(self, index: int) -> ThreadedRTSPStream:
        with self.lock:
            if index not in self.cctv_streams:
                camera_details = get_camera_details()
                if index < len(camera_details):
                    cam_meta = camera_details[index]
                    stream_name = cam_meta['name']
                    stream_url = cam_meta['url']
                else:
                    urls = get_camera_urls()
                    stream_url = urls[index] if index < len(urls) else "0"
                    stream_name = f"Camera {index + 1}"

                stream = ThreadedRTSPStream(stream_url, stream_name)
                stream.start()
                self.cctv_streams[index] = stream

            return self.cctv_streams[index]

    def get_ptz_stream(self, index: int) -> ThreadedRTSPStream:
        with self.lock:
            if index not in self.ptz_streams:
                urls = get_ptz_urls()
                url = urls[index] if index < len(urls) else "0"
                stream = ThreadedRTSPStream(url, f"PTZ Camera {index + 1}")
                stream.start()
                self.ptz_streams[index] = stream
            return self.ptz_streams[index]


# Singleton instance
camera_manager = CameraStreamManager()


def create_placeholder_frame(text: str, width: int = 640, height: int = 360) -> np.ndarray:
    """Creates a sleek dark placeholder frame when a camera is connecting/offline."""
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (20, 24, 30)
    cv2.rectangle(frame, (10, 10), (width - 10, height - 10), (45, 55, 72), 1)
    
    text_size, _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
    text_x = (width - text_size[0]) // 2
    text_y = (height + text_size[1]) // 2
    cv2.putText(frame, text, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160, 174, 192), 2)
    return frame


def generate_video_feed(session_id: str, camera_index: int = 0, camera_type: str = "cctv", is_grid: bool = True):
    """
    High-Performance Generator yielding live MJPEG multipart frames.
    Optimized for multi-camera grids to eliminate frame lag and buffer stutter.
    """
    if camera_type == "ptz":
        stream = camera_manager.get_ptz_stream(camera_index)
    else:
        stream = camera_manager.get_cctv_stream(camera_index)

    jpeg_quality = 65 if is_grid else 80
    fps_delay = 0.10 if is_grid else 0.04  # ~10 FPS for grid tiles (low network/CPU load), ~25 FPS for focus view

    while True:
        frame = stream.get_frame_with_overlays(session_id, is_grid=is_grid)
        if frame is None:
            placeholder_text = "Connecting..."
            frame = create_placeholder_frame(placeholder_text)

        # Ultra-fast JPEG encoding with tuned quality
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        if not ret:
            time.sleep(fps_delay)
            continue

        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

        time.sleep(fps_delay)


def prewarm_all_cctv():
    """Background worker to start all CCTV streams with staggered delays on boot."""
    time.sleep(1.0)
    camera_details = get_camera_details()
    for idx in range(len(camera_details)):
        try:
            camera_manager.get_cctv_stream(idx)
            time.sleep(0.35)
        except Exception as e:
            print(f"Pre-warm error on cam {idx}: {e}")

# Pre-warm streams in background so feeds are instantly available
threading.Thread(target=prewarm_all_cctv, daemon=True).start()

