import os
import cv2
import time
import threading
import numpy as np
from numpy.linalg import norm
from typing import Dict, List, Optional, Set
from app.config import supabase, get_camera_urls, get_camera_details, get_ptz_urls, is_cohort_matching
from app.ai import app_fa, AI_ENABLED, calculate_confidence_score

from starlette.requests import Request

# High-Performance Robust FFmpeg RTSP Flags (stable over Tailscale VPN without dropped frames or freezes)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|buffer_size;1048576|max_delay;500000|reorder_queue_size;100|stimeout;2500000"
)

# Global session-wide deduplication set: session_id -> set of student_ids
session_recognized_students: Dict[str, Set[str]] = {}
session_enrolled_cache: Dict[str, List[dict]] = {}
session_matrix_cache: Dict[str, Optional[np.ndarray]] = {}
session_last_fetch: Dict[str, float] = {}

def get_enrolled_data(session_id: str):
    """Fetches and caches enrolled students and normalized embedding matrix for fast vectorized matching."""
    now = time.time()
    if session_id in session_enrolled_cache and (now - session_last_fetch.get(session_id, 0)) < 60:
        return session_enrolled_cache[session_id], session_matrix_cache.get(session_id)

    try:
        session_res = supabase.table("sessions").select("target_academic_year").eq("id", session_id).execute()
        target_year = "All"
        if session_res.data and session_res.data[0].get("target_academic_year"):
            target_year = session_res.data[0]["target_academic_year"]

        query = supabase.table("students").select("id, full_name, face_encoding, student_roll, academic_year").not_.is_("face_encoding", "null")
        students_res = query.execute()
        all_enrolled = students_res.data or []
        
        enrolled = [s for s in all_enrolled if is_cohort_matching(target_year, s.get("academic_year"))]

        matrix = None
        if enrolled:
            valid_encodings = []
            valid_students = []
            for s in enrolled:
                enc = s.get("face_encoding")
                if enc and isinstance(enc, list) and len(enc) == 512:
                    arr = np.array(enc, dtype=np.float32)
                    arr_norm = float(norm(arr))
                    if arr_norm > 1e-6:
                        valid_encodings.append(arr / arr_norm)
                        valid_students.append(s)
            if valid_encodings:
                matrix = np.vstack(valid_encodings)
                enrolled = valid_students

        session_enrolled_cache[session_id] = enrolled
        session_matrix_cache[session_id] = matrix
        session_last_fetch[session_id] = now
        return enrolled, matrix
    except Exception as e:
        print(f"Error fetching students for session {session_id}: {e}")
        return session_enrolled_cache.get(session_id, []), session_matrix_cache.get(session_id)

def get_enrolled_students(session_id: str) -> List[dict]:
    enrolled, _ = get_enrolled_data(session_id)
    return enrolled


class ThreadedRTSPStream:
    """
    High-Performance Zero-Latency RTSP Stream Grabber.
    Maintains a stable live connection, continuously grabs fresh camera frames,
    and isolates AI detection strictly to real-time incoming video.
    """
    def __init__(self, url: str, name: str = "CCTV Camera"):
        self.url = url
        self.name = name
        self.source = int(url) if url.isdigit() else url
        self.cap: Optional[cv2.VideoCapture] = None
        
        # Display and AI frames
        self.latest_display_frame: Optional[np.ndarray] = None
        self.latest_ai_frame: Optional[np.ndarray] = None
        self.last_frame_time: float = 0.0
        self.last_ai_processed_time: float = 0.0
        self.raw_w = 640
        self.raw_h = 360
        
        self.last_faces: List[dict] = []
        self.last_faces_time: float = 0.0
        self.spatial_cache: List[dict] = []  # 60s cooldown spatial tracking cache
        self.running = False
        self.connected = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

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
                        time.sleep(1.0)
                        continue
                    self.connected = True
                    consecutive_failures = 0

                # Continuous live frame grab
                success, frame = self.cap.read()
                if not success or frame is None:
                    consecutive_failures += 1
                    if consecutive_failures > 30:
                        self.connected = False
                        if self.cap:
                            self.cap.release()
                        self.cap = None
                        consecutive_failures = 0
                        time.sleep(1.0)
                    else:
                        time.sleep(0.04)
                    continue

                consecutive_failures = 0
                self.connected = True
                h, w, _ = frame.shape
                self.raw_w = w
                self.raw_h = h

                # Fast SIMD-accelerated downscaling for crisp and cool rendering
                if w == 640 and h == 360:
                    display_frame = frame
                else:
                    display_frame = cv2.resize(frame, (640, 360), interpolation=cv2.INTER_LINEAR)

                now = time.time()
                with self.lock:
                    self.latest_display_frame = display_frame
                    self.latest_ai_frame = display_frame
                    self.last_frame_time = now

            except Exception as e:
                self.connected = False
                if self.cap:
                    self.cap.release()
                self.cap = None
                time.sleep(1.5)

        if self.cap:
            self.cap.release()
            self.cap = None

    def get_frame_with_overlays(self, session_id: str, is_grid: bool = True) -> Optional[np.ndarray]:
        """Returns live frame with overlays instantly (<0.2ms). Optimized for ultra-lightweight grid preview."""
        ai_coordinator.set_active_session(session_id)
        now = time.time()

        with self.lock:
            # If camera hasn't sent a frame in 6 seconds, show connecting placeholder
            if self.latest_display_frame is None or (self.last_frame_time > 0 and (now - self.last_frame_time > 6.0)):
                return None
            frame = self.latest_display_frame.copy()
            # Expire bounding boxes after 2.5s if student left or face moved
            faces_to_draw = self.last_faces if (now - self.last_faces_time <= 2.5) else []

        h_f, w_f, _ = frame.shape
        scale_x = w_f / 640.0
        scale_y = h_f / 360.0

        # Draw face overlays on lightweight frame
        for f_info in faces_to_draw:
            orig_x1, orig_y1, orig_x2, orig_y2 = f_info["coords"]
            student = f_info.get("student")
            sim = f_info.get("sim", 0.0)

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

            # Draw active cooldown badge if student is in cooldown
            if f_info.get("in_cooldown"):
                cv2.circle(frame, (x2 - 8, y1 + 8), 4, (0, 220, 255), -1)

        # Camera title overlay
        cv2.putText(frame, self.name, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3)
        cv2.putText(frame, self.name, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)

        # Downscale grid frames to 480x270 for ultra-lightweight browser rendering
        if is_grid and (w_f > 480 or h_f > 270):
            frame = cv2.resize(frame, (480, 270), interpolation=cv2.INTER_AREA)

        return frame

    def _process_ai(self, frame: np.ndarray, session_id: str):
        """Detects faces in the frame and matches against enrolled students with 60s cooldown & spatial tracking."""
        try:
            enrolled_students, enc_matrix = get_enrolled_data(session_id)
            faces = app_fa.get(frame)

            current_faces = []
            now = time.time()
            COOLDOWN_SECONDS = 60.0

            # Prune stale spatial tracking cache older than 75s
            self.spatial_cache = [e for e in self.spatial_cache if (now - e.get("last_matched_time", 0)) <= 75.0]

            if session_id not in session_recognized_students:
                session_recognized_students[session_id] = set()

            recognized_set = session_recognized_students[session_id]

            if faces and len(faces) > 0 and enc_matrix is not None and len(enrolled_students) > 0:
                h_img, w_img, _ = frame.shape

                for face in faces:
                    if hasattr(face, 'det_score') and face.det_score < 0.20:
                        continue

                    box = face.bbox.astype(int)
                    x1 = max(0, min(box[0], w_img - 1))
                    y1 = max(0, min(box[1], h_img - 1))
                    x2 = max(0, min(box[2], w_img - 1))
                    y2 = max(0, min(box[3], h_img - 1))
                    cx = (x1 + x2) / 2.0
                    cy = (y1 + y2) / 2.0

                    best_match_student = None
                    highest_sim = 0.0
                    in_cooldown = False

                    # 1. Check Spatial 60-second Cooldown Cache (Zero CPU Embedding matching & Zero DB hit)
                    matched_cache_entry = None
                    for cache_entry in self.spatial_cache:
                        if (now - cache_entry.get("last_matched_time", 0)) < COOLDOWN_SECONDS:
                            prev_cx, prev_cy = cache_entry.get("center", (0, 0))
                            dist_sq = (cx - prev_cx) ** 2 + (cy - prev_cy) ** 2
                            # If face center is within 90px of previous frame location
                            if dist_sq < (90 ** 2):
                                matched_cache_entry = cache_entry
                                break

                    if matched_cache_entry:
                        # Re-use cached identification without running expensive matrix dot product
                        best_match_student = matched_cache_entry["student"]
                        highest_sim = matched_cache_entry["sim"]
                        matched_cache_entry["coords"] = (x1, y1, x2, y2)
                        matched_cache_entry["center"] = (cx, cy)
                        matched_cache_entry["last_matched_time"] = now
                        in_cooldown = True
                    else:
                        # 2. Compute full vectorized cosine similarity via matrix dot product
                        unknown_encoding = face.embedding.astype(np.float32)
                        u_norm = float(norm(unknown_encoding))
                        if u_norm < 1e-6:
                            continue
                        unknown_unit = unknown_encoding / u_norm

                        sims = np.dot(enc_matrix, unknown_unit)
                        best_idx = int(np.argmax(sims))
                        highest_sim = float(sims[best_idx])

                        if highest_sim >= 0.42:
                            best_match_student = enrolled_students[best_idx]
                            # Register in spatial tracking cache
                            self.spatial_cache.append({
                                "coords": (x1, y1, x2, y2),
                                "center": (cx, cy),
                                "student": best_match_student,
                                "sim": highest_sim,
                                "last_matched_time": now
                            })

                    current_faces.append({
                        "coords": (x1, y1, x2, y2),
                        "student": best_match_student,
                        "sim": highest_sim,
                        "in_cooldown": in_cooldown
                    })

                    # Record attendance only once per student across all cameras (async non-blocking)
                    if best_match_student:
                        student_id = best_match_student['id']
                        if student_id not in recognized_set:
                            recognized_set.add(student_id)
                            threading.Thread(
                                target=self._save_attendance_async,
                                args=(session_id, student_id, best_match_student['full_name'], highest_sim),
                                daemon=True
                            ).start()

            with self.lock:
                self.last_faces = current_faces
                self.last_faces_time = time.time()
        except Exception as e:
            print(f"Error processing AI for {self.name}: {e}")

    def _save_attendance_async(self, session_id: str, student_id: str, student_name: str, highest_sim: float):
        try:
            conf_score = calculate_confidence_score(float(highest_sim))
            supabase.table("attendance").insert({
                "session_id": session_id,
                "student_id": student_id,
                "status": "Present",
                "capture_mode": "Live Scan",
                "confidence_score": conf_score
            }).execute()
            print(f"[ATTENDANCE] Recorded {student_name} from {self.name} ({conf_score * 100:.0f}%)")
        except Exception as e:
            print(f"Error saving attendance: {e}")

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

    def clear_all_detections(self):
        """Purges old bounding boxes and cached detections across all cameras."""
        with self.lock:
            for s in list(self.cctv_streams.values()) + list(self.ptz_streams.values()):
                with s.lock:
                    s.last_faces = []
                    s.last_faces_time = 0.0
                    s.spatial_cache = []


import asyncio

# Singleton instance
camera_manager = CameraStreamManager()


class CentralAICoordinator:
    """
    Coordinates AI face scanning sequentially across all active cameras.
    Guarantees AI processes only LIVE incoming video captured AFTER session start.
    """
    def __init__(self):
        self.active_session_id: Optional[str] = None
        self.session_start_time: float = time.time()
        self.running = True
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self._ai_worker_loop, daemon=True)
        self.thread.start()

    def set_active_session(self, session_id: str):
        with self.lock:
            if self.active_session_id != session_id:
                self.active_session_id = session_id
                self.session_start_time = time.time()
                camera_manager.clear_all_detections()

    def _ai_worker_loop(self):
        while self.running:
            try:
                if not AI_ENABLED or not app_fa:
                    time.sleep(1.0)
                    continue

                with self.lock:
                    session_id = self.active_session_id
                    session_start = self.session_start_time

                if not session_id:
                    time.sleep(0.3)
                    continue

                # Auto-Sleep Check: When all enrolled students in cohort are recognized, enter low-power sleep mode (100% CPU savings)
                enrolled_students, enc_matrix = get_enrolled_data(session_id)
                if session_id in session_recognized_students and enrolled_students:
                    recognized_set = session_recognized_students[session_id]
                    if len(recognized_set) >= len(enrolled_students) and len(enrolled_students) > 0:
                        time.sleep(2.0)
                        continue

                with camera_manager.lock:
                    active_cctv = list(camera_manager.cctv_streams.values())
                    active_ptz = list(camera_manager.ptz_streams.values())
                
                streams = active_cctv + active_ptz
                if not streams:
                    time.sleep(0.3)
                    continue

                now = time.time()
                for stream in streams:
                    if not stream.running:
                        continue

                    ai_frame = None
                    with stream.lock:
                        # 1. Must have an active frame
                        if stream.latest_ai_frame is None:
                            continue
                        # 2. Must be captured AFTER current session started (prevents ghost attendance from past sessions)
                        if stream.last_frame_time < (session_start - 2.0):
                            continue
                        # 3. Must be captured within last 3.0 seconds (LIVE only)
                        if (now - stream.last_frame_time) > 3.0:
                            continue
                        # 4. Do not re-process identical frame capture timestamp
                        if stream.last_frame_time <= stream.last_ai_processed_time:
                            continue

                        ai_frame = stream.latest_ai_frame.copy()
                        stream.last_ai_processed_time = stream.last_frame_time

                    if ai_frame is not None:
                        stream._process_ai(ai_frame, session_id)
                        time.sleep(0.18)  # Gentle yield between camera AI processes to keep CPU cool

                # Cooldown between multi-camera scan cycles (maintains 100% attendance recall while keeping MacBook completely cool)
                time.sleep(0.6)

            except Exception as e:
                time.sleep(0.5)

ai_coordinator = CentralAICoordinator()


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


async def generate_video_feed(
    session_id: str,
    request: Optional[Request] = None,
    camera_index: int = 0,
    camera_type: str = "cctv",
    is_grid: bool = True
):
    """
    High-Performance Async Generator yielding live MJPEG multipart frames.
    Instantly terminates when client disconnects or switches views, eliminating ghost socket leaks
    and preventing event loop starvation.
    """
    if camera_type == "ptz":
        stream = camera_manager.get_ptz_stream(camera_index)
    else:
        stream = camera_manager.get_cctv_stream(camera_index)

    jpeg_quality = 45 if is_grid else 70
    fps_delay = 0.12 if is_grid else 0.05

    try:
        while True:
            # Immediate disconnect check to free event loop and socket
            if request and await request.is_disconnected():
                break

            frame = stream.get_frame_with_overlays(session_id, is_grid=is_grid)
            if frame is None:
                placeholder_text = "Connecting..."
                frame = create_placeholder_frame(placeholder_text)

            # Ultra-fast JPEG encoding with tuned quality
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
            if not ret:
                await asyncio.sleep(fps_delay)
                continue

            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

            await asyncio.sleep(fps_delay)
    except (asyncio.CancelledError, GeneratorExit, Exception, BaseException):
        pass



def prewarm_all_cctv():
    """Background worker to gently initialize CCTV streams on boot without blocking."""
    time.sleep(2.0)
    try:
        camera_details = get_camera_details()
        for idx in range(len(camera_details)):
            try:
                camera_manager.get_cctv_stream(idx)
                time.sleep(0.5)
            except Exception as e:
                print(f"Pre-warm error on cam {idx}: {e}")
    except Exception:
        pass

# Pre-warm streams in background so feeds are instantly available
threading.Thread(target=prewarm_all_cctv, daemon=True).start()


