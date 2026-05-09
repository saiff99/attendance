import cv2
import time

urls = [
    "rtsp://admin:jimsh123@192.168.0.10:554/cam/realmonitor?channel=1&subtype=0",
    "rtsp://admin:jimsh123@192.168.0.10:554/cam/realmonitor?channel=1&subtype=1",
    "rtsp://admin:jimsh123@192.168.0.10:554/live",
    "rtsp://192.168.0.10:554/cam/realmonitor?channel=1&subtype=0"
]

for url in urls:
    print(f"Testing URL: {url}")
    # Use cv2.CAP_FFMPEG explicitly with a timeout
    # Set environment variable to lower timeout so it doesn't hang forever
    import os
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;5000"
    
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        print(f"FAILED to open {url}")
        continue
        
    success, frame = cap.read()
    if success:
        print(f"SUCCESS! Read frame with shape: {frame.shape}")
        cap.release()
        break
    else:
        print(f"FAILED to read frame from {url}")
        cap.release()
