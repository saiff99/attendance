import os
import cv2
import time
import queue
import threading
import numpy as np
from numpy.linalg import norm
from typing import Dict, List, Optional, Set
from app.config import supabase, get_camera_urls, get_cctv_ai_urls, get_camera_details, get_ptz_urls, is_cohort_matching
from app.ai import app_fa, AI_ENABLED, AI_DET_THRESH, AI_DET_SIZE, calculate_confidence_score

from starlette.requests import Request

# High-Performance Robust FFmpeg RTSP Flags (stable over Tailscale VPN without dropped frames or freezes)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|buffer_size;1048576|max_delay;500000|reorder_queue_size;100|stimeout;2500000"
)

# Global Bounded Attendance Event Queue (decouples AI loop from database blocking I/O)
attendance_event_queue: queue.Queue = queue.Queue(maxsize=1000)

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

import gc

def get_enrolled_students(session_id: str) -> List[dict]:
    enrolled, _ = get_enrolled_data(session_id)
    return enrolled


def cleanup_session_state(session_id: Optional[str] = None) -> dict:
    """
    Step 7 — Session Lifecycle Memory Cleanup.
    Releases all session-specific memory, cached embedding matrices, student records,
    and camera spatial caches without disconnecting persistent CCTV RTSP stream connections.

    Args:
        session_id (Optional[str]): Target session ID to clean.
            If provided, cleans caches for that specific session.
            If None, sweeps and cleans all non-active session caches (or all caches if no session is active).
    """
    cleaned_sessions: List[str] = []
    
    try:
        if session_id:
            targets = [str(session_id).strip()]
        else:
            # Discover all sessions currently occupying memory
            all_cached = set(session_recognized_students.keys()) | \
                         set(session_enrolled_cache.keys()) | \
                         set(session_matrix_cache.keys()) | \
                         set(session_last_fetch.keys())
            active_id = ai_coordinator.active_session_id if 'ai_coordinator' in globals() else None
            # Do not touch currently active session during general sweep
            targets = [s for s in all_cached if s != active_id] if active_id else list(all_cached)

        for s_id in targets:
            # 1. Remove recognized student deduplication set
            session_recognized_students.pop(s_id, None)
            
            # 2. Remove enrolled student cache
            session_enrolled_cache.pop(s_id, None)
            
            # 3. Remove embedding matrix and release memory
            mat = session_matrix_cache.pop(s_id, None)
            if mat is not None:
                del mat
                
            # 4. Reset last-fetch timestamp
            session_last_fetch.pop(s_id, None)
            
            cleaned_sessions.append(s_id)

        # 5. Clear spatial tracking caches and last face overlays across all cameras
        # (Purges old student bounding boxes & tracking states while keeping RTSP stream threads running)
        if 'camera_manager' in globals():
            camera_manager.clear_all_detections()
        
        # 6. Explicit Garbage Collection to immediately reclaim freed matrix RAM
        gc.collect()

        print(f"[MEMORY CLEANUP] Released session memory for {len(cleaned_sessions)} session(s): {cleaned_sessions}. RTSP streams remain connected.")
        return {
            "success": True,
            "cleaned_sessions": cleaned_sessions,
            "active_session": ai_coordinator.active_session_id if 'ai_coordinator' in globals() else None,
            "remaining_cached_sessions": len(session_matrix_cache)
        }
    except Exception as e:
        print(f"[MEMORY CLEANUP ERROR] Failed to clean session state: {e}")
        return {"success": False, "error": str(e)}


AI_FRAME_WIDTH = int(os.getenv("AI_FRAME_WIDTH", "960"))
AI_FRAME_HEIGHT = int(os.getenv("AI_FRAME_HEIGHT", "540"))
AI_SCAN_INTERVAL_NORMAL = float(os.getenv("AI_SCAN_INTERVAL", "1.0"))
AI_SCAN_INTERVAL_MIN = float(os.getenv("AI_SCAN_INTERVAL_MIN", "0.8"))
AI_SCAN_INTERVAL_MAX = float(os.getenv("AI_SCAN_INTERVAL_MAX", "2.0"))
AI_ADAPTIVE_LOAD_CONTROL = os.getenv("AI_ADAPTIVE_LOAD_CONTROL", "true").lower() in ("1", "true", "yes")
AI_SCAN_INTERVAL = AI_SCAN_INTERVAL_NORMAL

class AdaptiveLoadController:
    """
    Step 11 — Thermal & Automatic Load Controller.
    Dynamically adjusts AI scan interval between bounded limits (0.8s to 2.0s) based on rolling
    AI inference duration and system load, keeping host hardware cool during long 300+ student classes.
    Never lowers face-recognition accuracy thresholds or halts CCTV streams.
    """
    def __init__(self):
        self.enabled = AI_ADAPTIVE_LOAD_CONTROL
        self.current_interval = AI_SCAN_INTERVAL_NORMAL
        self.min_interval = AI_SCAN_INTERVAL_MIN
        self.max_interval = AI_SCAN_INTERVAL_MAX
        self.rolling_avg_ms: float = 40.0
        self.sample_count: int = 0
        self.last_log_time: float = 0.0
        self.last_logged_interval: float = AI_SCAN_INTERVAL_NORMAL
        self.lock = threading.Lock()

    def get_current_interval(self) -> float:
        if not self.enabled:
            return AI_SCAN_INTERVAL_NORMAL
        with self.lock:
            return self.current_interval

    def record_inference(self, duration_ms: float) -> float:
        """Records an AI scan duration and adapts the scan interval accordingly."""
        if not self.enabled:
            return self.current_interval

        with self.lock:
            # Exponential Moving Average (alpha = 0.15)
            alpha = 0.15
            self.rolling_avg_ms = (alpha * duration_ms) + ((1.0 - alpha) * self.rolling_avg_ms)
            self.sample_count += 1

            # Thresholds: High load if rolling inference > 110ms; Low load if < 60ms
            if self.rolling_avg_ms > 110.0:
                step = 0.08 if self.rolling_avg_ms > 160.0 else 0.04
                self.current_interval = min(self.max_interval, self.current_interval + step)
            elif self.rolling_avg_ms < 60.0:
                self.current_interval = max(self.min_interval, self.current_interval - 0.03)
            else:
                if self.current_interval > AI_SCAN_INTERVAL_NORMAL:
                    self.current_interval = max(AI_SCAN_INTERVAL_NORMAL, self.current_interval - 0.02)
                elif self.current_interval < AI_SCAN_INTERVAL_NORMAL:
                    self.current_interval = min(AI_SCAN_INTERVAL_NORMAL, self.current_interval + 0.02)

            self.current_interval = round(self.current_interval, 2)
            cur = self.current_interval
            avg = self.rolling_avg_ms

        # Throttled logging on significant adaptation changes
        now = time.time()
        if (now - self.last_log_time >= 15.0) and abs(cur - self.last_logged_interval) >= 0.15:
            self.last_log_time = now
            self.last_logged_interval = cur
            direction = "Throttling Up (Cooling)" if cur > AI_SCAN_INTERVAL_NORMAL else "Normalizing"
            print(f"[LOAD CONTROL] {direction} | Scan Interval: {cur}s | Rolling AI Avg: {avg:.1f}ms")

        return cur

# Global Adaptive Load Controller Singleton
load_controller = AdaptiveLoadController()

# Robust Spatial Tracking & Cooldown Tuning
FACE_TRACK_CACHE_SECONDS = float(os.getenv("FACE_TRACK_CACHE_SECONDS", "60.0"))
FACE_TRACK_DISTANCE_PX = float(os.getenv("FACE_TRACK_DISTANCE_PX", "80.0"))
FACE_TRACK_REVERIFY_SECONDS = float(os.getenv("FACE_TRACK_REVERIFY_SECONDS", "8.0"))

class ThreadedRTSPStream:
    """
    High-Performance Zero-Latency RTSP Stream Grabber.
    Maintains dual stream support:
      - Primary/Main Stream (for crisp live UI monitoring)
      - Dedicated AI Sub-Stream (for fast, high-accuracy face recognition in large 300+ student halls)
    Safely falls back to Primary Stream when no dedicated AI Sub-Stream is configured.
    """
    def __init__(self, url: str, name: str = "CCTV Camera", ai_url: Optional[str] = None):
        self.url = url
        self.name = name
        self.source = int(url) if str(url).isdigit() else url
        
        # Dedicated AI Sub-stream or Main Stream Fallback
        self.ai_url = ai_url if (ai_url and str(ai_url).strip()) else url
        self.ai_source = int(self.ai_url) if str(self.ai_url).isdigit() else self.ai_url
        self.has_dedicated_ai_stream = (self.ai_url != self.url)
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.ai_cap: Optional[cv2.VideoCapture] = None
        
        # Display and AI frames
        self.latest_display_frame: Optional[np.ndarray] = None
        self.latest_ai_frame: Optional[np.ndarray] = None
        self.last_frame_time: float = 0.0
        self.last_ai_frame_time: float = 0.0
        self.last_ai_processed_time: float = 0.0
        self.raw_w = AI_FRAME_WIDTH
        self.raw_h = AI_FRAME_HEIGHT
        
        self.last_faces: List[dict] = []
        self.last_faces_time: float = 0.0
        self.spatial_cache: List[dict] = []  # 60s cooldown spatial tracking cache
        
        # Explicit AI Scheduler & Diagnostics
        self.next_allowed_ai_scan: float = 0.0
        self.first_ai_scan_timestamp: Optional[float] = None
        self.actual_scan_interval_sec: float = 0.0
        self.total_capture_failures: int = 0
        self.consecutive_failures: int = 0
        self.ai_scan_count: int = 0
        self.last_ai_duration_ms: float = 0.0
        self.total_ai_duration_ms: float = 0.0
        self.last_insightface_duration_ms: float = 0.0
        self.last_ai_scan_timestamp: Optional[float] = None
        self.last_metrics_log_time: float = 0.0

        self.running = False
        self.connected = False
        self.ai_connected = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        self.ai_thread: Optional[threading.Thread] = None

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        
        if self.has_dedicated_ai_stream:
            self.ai_thread = threading.Thread(target=self._ai_capture_loop, daemon=True)
            self.ai_thread.start()

    def _capture_loop(self):
        self.consecutive_failures = 0
        reconnect_delay = 1.0

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
                        # Exponential backoff on reconnect failure (1s -> 1.5s -> 2.25s ... max 8.0s)
                        time.sleep(reconnect_delay)
                        reconnect_delay = min(reconnect_delay * 1.5, 8.0)
                        continue
                    self.connected = True
                    self.consecutive_failures = 0
                    reconnect_delay = 1.0

                # Continuous live frame grab
                success, frame = self.cap.read()
                if not success or frame is None:
                    self.total_capture_failures += 1
                    self.consecutive_failures += 1
                    if self.consecutive_failures > 30:
                        self.connected = False
                        if self.cap:
                            self.cap.release()
                        self.cap = None
                        self.consecutive_failures = 0
                        time.sleep(reconnect_delay)
                        reconnect_delay = min(reconnect_delay * 1.5, 8.0)
                    else:
                        time.sleep(0.04)
                    continue

                self.consecutive_failures = 0
                self.connected = True
                reconnect_delay = 1.0
                h, w, _ = frame.shape
                self.raw_w = w
                self.raw_h = h

                # Downscaling for crisp display preview and AI fallback
                if w == AI_FRAME_WIDTH and h == AI_FRAME_HEIGHT:
                    display_frame = frame
                else:
                    display_frame = cv2.resize(frame, (AI_FRAME_WIDTH, AI_FRAME_HEIGHT), interpolation=cv2.INTER_LINEAR)

                now = time.time()
                with self.lock:
                    self.latest_display_frame = display_frame
                    if not self.has_dedicated_ai_stream:
                        self.latest_ai_frame = display_frame
                        self.last_ai_frame_time = now
                    self.last_frame_time = now

            except Exception as e:
                self.connected = False
                self.total_capture_failures += 1
                if self.cap:
                    self.cap.release()
                self.cap = None
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, 8.0)

        if self.cap:
            self.cap.release()
            self.cap = None

    def _ai_capture_loop(self):
        """Dedicated capture loop for native AI sub-stream (only active when CCTV_AI_URLS is configured)."""
        reconnect_delay = 1.0
        while self.running:
            try:
                if self.ai_cap is None or not self.ai_cap.isOpened():
                    self.ai_connected = False
                    if isinstance(self.ai_source, str):
                        self.ai_cap = cv2.VideoCapture(self.ai_source, cv2.CAP_FFMPEG)
                    else:
                        self.ai_cap = cv2.VideoCapture(self.ai_source)
                    self.ai_cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    if not self.ai_cap.isOpened():
                        time.sleep(reconnect_delay)
                        reconnect_delay = min(reconnect_delay * 1.5, 8.0)
                        continue
                    self.ai_connected = True
                    reconnect_delay = 1.0

                success, frame = self.ai_cap.read()
                if not success or frame is None:
                    time.sleep(0.04)
                    continue

                self.ai_connected = True
                h, w, _ = frame.shape
                if w != AI_FRAME_WIDTH or h != AI_FRAME_HEIGHT:
                    frame = cv2.resize(frame, (AI_FRAME_WIDTH, AI_FRAME_HEIGHT), interpolation=cv2.INTER_LINEAR)

                now = time.time()
                with self.lock:
                    self.latest_ai_frame = frame
                    self.last_ai_frame_time = now

            except Exception:
                self.ai_connected = False
                if self.ai_cap:
                    self.ai_cap.release()
                self.ai_cap = None
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, 8.0)

        if self.ai_cap:
            self.ai_cap.release()
            self.ai_cap = None

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
        scale_x = w_f / float(AI_FRAME_WIDTH)
        scale_y = h_f / float(AI_FRAME_HEIGHT)

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
        t0 = time.perf_counter()
        insightface_ms = 0.0
        try:
            enrolled_students, enc_matrix = get_enrolled_data(session_id)
            
            t_if_start = time.perf_counter()
            faces = app_fa.get(frame)
            insightface_ms = (time.perf_counter() - t_if_start) * 1000.0

            current_faces = []
            now = time.time()

            # Prune stale spatial tracking cache older than expiration
            self.spatial_cache = [e for e in self.spatial_cache if (now - e.get("last_matched_time", 0)) <= (FACE_TRACK_CACHE_SECONDS + 15.0)]

            if session_id not in session_recognized_students:
                session_recognized_students[session_id] = set()

            recognized_set = session_recognized_students[session_id]

            if faces and len(faces) > 0 and enc_matrix is not None and len(enrolled_students) > 0:
                h_img, w_img, _ = frame.shape

                for face in faces:
                    if hasattr(face, 'det_score') and face.det_score < AI_DET_THRESH:
                        continue

                    box = face.bbox.astype(int)
                    x1 = max(0, min(box[0], w_img - 1))
                    y1 = max(0, min(box[1], h_img - 1))
                    x2 = max(0, min(box[2], w_img - 1))
                    y2 = max(0, min(box[3], h_img - 1))
                    cx = (x1 + x2) / 2.0
                    cy = (y1 + y2) / 2.0
                    bw = max(1, x2 - x1)
                    bh = max(1, y2 - y1)
                    current_area = bw * bh

                    # Extract & normalize face embedding
                    unknown_encoding = face.embedding.astype(np.float32)
                    u_norm = float(norm(unknown_encoding))
                    if u_norm < 1e-6:
                        continue
                    unknown_unit = unknown_encoding / u_norm

                    best_match_student = None
                    highest_sim = 0.0
                    in_cooldown = False

                    # Multi-Condition Robust Spatial Verification:
                    # 1. Fresh timestamp (< FACE_TRACK_CACHE_SECONDS)
                    # 2. Spatial proximity (< FACE_TRACK_DISTANCE_PX)
                    # 3. Bounding box size ratio consistency (0.4x to 2.5x)
                    # 4. Periodic embedding re-verification (every ~8s or 6 reuses) via ultra-fast 1x1 dot product
                    matched_cache_entry = None
                    for cache_entry in self.spatial_cache:
                        if (now - cache_entry.get("last_matched_time", 0)) > FACE_TRACK_CACHE_SECONDS:
                            continue

                        prev_cx, prev_cy = cache_entry.get("center", (0, 0))
                        dist_sq = (cx - prev_cx) ** 2 + (cy - prev_cy) ** 2
                        if dist_sq > (FACE_TRACK_DISTANCE_PX ** 2):
                            continue

                        prev_area = cache_entry.get("box_area", current_area)
                        ratio = current_area / max(1.0, float(prev_area))
                        if ratio < 0.4 or ratio > 2.5:
                            continue

                        # Periodic Re-verification against cached student's verified embedding
                        needs_reverify = (now - cache_entry.get("last_reverify_time", 0)) >= FACE_TRACK_REVERIFY_SECONDS or cache_entry.get("reuse_count", 0) >= 6
                        if needs_reverify:
                            cached_emb = cache_entry.get("encoding")
                            if cached_emb is not None:
                                reverify_sim = float(np.dot(cached_emb, unknown_unit))
                                if reverify_sim < 0.40:
                                    # Identity changed or nearby person swapped! Reject cache reuse.
                                    continue
                                else:
                                    cache_entry["sim"] = reverify_sim
                            cache_entry["last_reverify_time"] = now
                            cache_entry["reuse_count"] = 0
                            cache_entry["encoding"] = unknown_unit
                        else:
                            cache_entry["reuse_count"] = cache_entry.get("reuse_count", 0) + 1

                        matched_cache_entry = cache_entry
                        break

                    if matched_cache_entry:
                        # Re-use verified identity
                        best_match_student = matched_cache_entry["student"]
                        highest_sim = matched_cache_entry["sim"]
                        matched_cache_entry["coords"] = (x1, y1, x2, y2)
                        matched_cache_entry["center"] = (cx, cy)
                        matched_cache_entry["box_area"] = current_area
                        matched_cache_entry["last_matched_time"] = now
                        in_cooldown = True
                    else:
                        # Full vectorized matrix search (0.01ms)
                        sims = np.dot(enc_matrix, unknown_unit)
                        best_idx = int(np.argmax(sims))
                        highest_sim = float(sims[best_idx])

                        if highest_sim >= 0.42:
                            best_match_student = enrolled_students[best_idx]
                            self.spatial_cache.append({
                                "coords": (x1, y1, x2, y2),
                                "center": (cx, cy),
                                "box_area": current_area,
                                "student": best_match_student,
                                "encoding": unknown_unit,
                                "sim": highest_sim,
                                "last_matched_time": now,
                                "last_reverify_time": now,
                                "reuse_count": 0
                            })

                    current_faces.append({
                        "coords": (x1, y1, x2, y2),
                        "student": best_match_student,
                        "sim": highest_sim,
                        "in_cooldown": in_cooldown
                    })

                    # Record attendance via dedicated queue (100% thread-safe, 0 OS thread explosion overhead)
                    if best_match_student:
                        student_id = best_match_student['id']
                        if student_id not in recognized_set:
                            recognized_set.add(student_id)
                            try:
                                attendance_event_queue.put_nowait({
                                    "session_id": session_id,
                                    "student_id": student_id,
                                    "student_name": best_match_student['full_name'],
                                    "highest_sim": highest_sim,
                                    "camera_name": self.name
                                })
                            except queue.Full:
                                pass

            t_end = time.perf_counter()
            total_ai_ms = (t_end - t0) * 1000.0

            # Step 11: Adapt scan interval based on rolling inference duration
            load_controller.record_inference(total_ai_ms)

            with self.lock:
                self.last_faces = current_faces
                self.last_faces_time = time.time()
                self.ai_scan_count += 1
                self.last_ai_duration_ms = round(total_ai_ms, 2)
                self.total_ai_duration_ms += total_ai_ms
                self.last_insightface_duration_ms = round(insightface_ms, 2)
                self.last_ai_scan_timestamp = time.time()

            # Throttled console logging (every 15 seconds per camera)
            if (now - self.last_metrics_log_time) >= 15.0:
                self.last_metrics_log_time = now
                avg_ai_ms = round(self.total_ai_duration_ms / max(1, self.ai_scan_count), 2)
                elapsed = now - (self.first_ai_scan_timestamp or now)
                achieved_fps = round(self.ai_scan_count / max(1.0, elapsed), 2)
                print(f"[PERF] {self.name} | Scans: {self.ai_scan_count} (~{achieved_fps} FPS) | AI: {self.last_ai_duration_ms:.1f}ms (Avg: {avg_ai_ms:.1f}ms) | Interval: {self.actual_scan_interval_sec}s | Queue: {attendance_event_queue.qsize()}")
        except Exception as e:
            print(f"Error processing AI for {self.name}: {e}")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)


def _db_attendance_worker_loop():
    """
    Dedicated Single Database Attendance Consumer Worker.
    Processes attendance events sequentially from the bounded event queue.
    Uses database-level deduplication and graceful conflict handling to guarantee
    that concurrent camera detections never create duplicate attendance records.
    """
    while True:
        try:
            event = attendance_event_queue.get()
            session_id = event["session_id"]
            student_id = event["student_id"]
            student_name = event["student_name"]
            highest_sim = event["highest_sim"]
            camera_name = event["camera_name"]

            conf_score = calculate_confidence_score(float(highest_sim))
            
            # Database-level atomic upsert with conflict resolution
            try:
                supabase.table("attendance").upsert({
                    "session_id": session_id,
                    "student_id": student_id,
                    "status": "Present",
                    "capture_mode": "Live Scan",
                    "confidence_score": conf_score
                }, on_conflict="session_id,student_id").execute()
                print(f"[ATTENDANCE] Recorded {student_name} from {camera_name} ({conf_score * 100:.0f}%)")
            except Exception as insert_err:
                err_str = str(insert_err).lower()
                if "duplicate" in err_str or "unique" in err_str or "23505" in err_str:
                    print(f"[ATTENDANCE] {student_name} already marked for session {session_id} (Deduplicated at DB level)")
                else:
                    print(f"[ATTENDANCE DB ERROR] {insert_err}")

            attendance_event_queue.task_done()
        except Exception as e:
            print(f"[ATTENDANCE WORKER ERROR] {e}")
            time.sleep(0.5)

# Start dedicated background Database Attendance Worker
threading.Thread(target=_db_attendance_worker_loop, daemon=True).start()


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
                    ai_url = cam_meta.get('ai_url', stream_url)
                else:
                    urls = get_camera_urls()
                    ai_urls = get_cctv_ai_urls()
                    stream_url = urls[index] if index < len(urls) else "0"
                    ai_url = ai_urls[index] if index < len(ai_urls) else stream_url
                    stream_name = f"Camera {index + 1}"

                stream = ThreadedRTSPStream(stream_url, stream_name, ai_url=ai_url)
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
            old_session = self.active_session_id
            if old_session != session_id:
                self.active_session_id = session_id
                self.session_start_time = time.time()
                camera_manager.clear_all_detections()
                # If switching from an older session, clean up previous session state
                if old_session and old_session != session_id:
                    cleanup_session_state(old_session)

    def end_active_session(self, session_id: Optional[str] = None):
        """Ends the active attendance session and purges its cached memory state."""
        with self.lock:
            target = session_id or self.active_session_id
            if target and (session_id is None or self.active_session_id == session_id):
                self.active_session_id = None
            if target:
                cleanup_session_state(target)

    def _ai_worker_loop(self):
        """
        Explicit Per-Camera AI Scheduler.
        Replaces arbitrary fixed sleep intervals with predictable per-camera timestamps.
        Guarantees:
          - Each camera scans at target frequency (~1 scan/sec)
          - Offline/slow cameras never delay or block active cameras
          - Zero frame backlog, zero CPU spikes
        """
        while self.running:
            try:
                if not AI_ENABLED or not app_fa:
                    time.sleep(1.0)
                    continue

                with self.lock:
                    session_id = self.active_session_id
                    session_start = self.session_start_time

                if not session_id:
                    time.sleep(0.1)
                    continue

                # Auto-Sleep Check: When all enrolled students in cohort are recognized, enter low-power sleep mode
                enrolled_students, enc_matrix = get_enrolled_data(session_id)
                if session_id in session_recognized_students and enrolled_students:
                    recognized_set = session_recognized_students[session_id]
                    if len(recognized_set) >= len(enrolled_students) and len(enrolled_students) > 0:
                        time.sleep(1.5)
                        continue

                with camera_manager.lock:
                    active_cctv = list(camera_manager.cctv_streams.values())
                    active_ptz = list(camera_manager.ptz_streams.values())
                
                streams = active_cctv + active_ptz
                if not streams:
                    time.sleep(0.1)
                    continue

                now = time.time()
                for stream in streams:
                    if not stream.running:
                        continue

                    # 1. Explicit Timestamp Schedule Check: Skip immediately if not due yet
                    if now < stream.next_allowed_ai_scan:
                        continue

                    ai_frame = None
                    with stream.lock:
                        # 2. Must have an active frame
                        if stream.latest_ai_frame is None:
                            continue
                        # 3. Must be captured AFTER current session started (prevents ghost attendance)
                        if stream.last_frame_time < (session_start - 2.0):
                            continue
                        # 4. Must be captured within last 3.0 seconds (LIVE only)
                        if (now - stream.last_frame_time) > 3.0:
                            continue
                        # 5. Do not re-process identical frame capture timestamp
                        if stream.last_frame_time <= stream.last_ai_processed_time:
                            continue

                        ai_frame = stream.latest_ai_frame.copy()
                        stream.last_ai_processed_time = stream.last_frame_time
                        
                        # Step 11: Advance camera's scheduled scan timestamp using adaptive interval
                        effective_interval = load_controller.get_current_interval()
                        stream.next_allowed_ai_scan = now + effective_interval
                        if stream.last_ai_scan_timestamp:
                            stream.actual_scan_interval_sec = round(now - stream.last_ai_scan_timestamp, 2)
                        if not stream.first_ai_scan_timestamp:
                            stream.first_ai_scan_timestamp = now

                    if ai_frame is not None:
                        try:
                            stream._process_ai(ai_frame, session_id)
                        except Exception as e:
                            print(f"[AI ERROR] {stream.name}: {e}")

                # High-precision non-blocking tick (20ms / 50Hz) for smooth scheduling
                time.sleep(0.02)

            except Exception as e:
                time.sleep(0.2)

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


def get_performance_diagnostics() -> dict:
    """
    Lightweight runtime performance diagnostics aggregator.
    Measures per-camera connection health, frame latency, AI inference speeds,
    and event queue sizes without introducing runtime overhead.
    """
    now = time.time()
    cameras_status = []

    with camera_manager.lock:
        cctv_items = [(f"cctv_{idx}", stream) for idx, stream in camera_manager.cctv_streams.items()]
        ptz_items = [(f"ptz_{idx}", stream) for idx, stream in camera_manager.ptz_streams.items()]
        all_streams = cctv_items + ptz_items

    for cam_id, stream in all_streams:
        with stream.lock:
            frame_age = round(now - stream.last_frame_time, 3) if stream.last_frame_time > 0 else None
            avg_ai_ms = round(stream.total_ai_duration_ms / max(1, stream.ai_scan_count), 2) if stream.ai_scan_count > 0 else 0.0

            achieved_fps = round(stream.ai_scan_count / max(1.0, (now - (stream.first_ai_scan_timestamp or now))), 2) if stream.first_ai_scan_timestamp else 0.0

            cameras_status.append({
                "camera_id": cam_id,
                "name": stream.name,
                "url": stream.url,
                "ai_url": stream.ai_url,
                "has_dedicated_ai_stream": stream.has_dedicated_ai_stream,
                "ai_resolution": f"{AI_FRAME_WIDTH}x{AI_FRAME_HEIGHT}",
                "target_scan_interval_sec": AI_SCAN_INTERVAL,
                "actual_scan_interval_sec": stream.actual_scan_interval_sec,
                "achieved_scan_fps": achieved_fps,
                "connected": stream.connected,
                "ai_connected": stream.ai_connected if stream.has_dedicated_ai_stream else stream.connected,
                "frame_age_seconds": frame_age,
                "consecutive_failures": stream.consecutive_failures,
                "total_capture_failures": stream.total_capture_failures,
                "ai_scan_count": stream.ai_scan_count,
                "last_ai_duration_ms": stream.last_ai_duration_ms,
                "avg_ai_duration_ms": avg_ai_ms,
                "last_insightface_duration_ms": stream.last_insightface_duration_ms,
                "last_ai_scan_timestamp": stream.last_ai_scan_timestamp,
                "active_spatial_cache_count": len(stream.spatial_cache)
            })

    from app.ai import active_engine

    return {
        "status": "healthy",
        "timestamp": now,
        "ai_enabled": AI_ENABLED,
        "ai_hardware_acceleration": active_engine,
        "detector_size": AI_DET_SIZE,
        "detector_threshold": AI_DET_THRESH,
        "face_track_cache_seconds": FACE_TRACK_CACHE_SECONDS,
        "face_track_distance_px": FACE_TRACK_DISTANCE_PX,
        "face_track_reverify_seconds": FACE_TRACK_REVERIFY_SECONDS,
        "active_session_id": ai_coordinator.active_session_id,
        "cached_sessions_count": len(session_matrix_cache),
        "cached_recognized_sessions": len(session_recognized_students),
        "attendance_queue_size": attendance_event_queue.qsize(),
        "adaptive_load_control": {
            "enabled": load_controller.enabled,
            "current_scan_interval_sec": load_controller.current_interval,
            "normal_scan_interval_sec": AI_SCAN_INTERVAL_NORMAL,
            "min_scan_interval_sec": AI_SCAN_INTERVAL_MIN,
            "max_scan_interval_sec": AI_SCAN_INTERVAL_MAX,
            "rolling_avg_inference_ms": round(load_controller.rolling_avg_ms, 2)
        },
        "total_active_cameras": len(cameras_status),
        "cameras": cameras_status
    }


