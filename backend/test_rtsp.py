import os
import re
import sys
import time
import cv2
from dotenv import load_dotenv

# Load environment variables explicitly from backend/.env or parent directory
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_env_path = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path)
load_dotenv()


def mask_rtsp_url(url: str) -> str:
    """
    Sanitizes RTSP URLs by masking embedded credentials to prevent secret leakage in logs.
    Example: 'rtsp://admin:secret123@192.168.1.10:554/stream' -> 'rtsp://admin:****@192.168.1.10:554/stream'
    """
    if not isinstance(url, str):
        return str(url)
    return re.sub(r"://([^:@\s]+):([^@\s]+)@", r"://\1:****@", url)


def get_test_urls() -> list[str]:
    """
    Retrieves RTSP test URLs from environment variables (Zero-Trust Configuration).
    Order of precedence:
      1. TEST_RTSP_URL (comma-separated or single)
      2. CCTV_URLS (first configured CCTV stream from .env)
      3. PTZ_URLS (configured PTZ stream from .env)
    """
    test_rtsp = os.getenv("TEST_RTSP_URL", "").strip()
    if test_rtsp:
        return [u.strip() for u in test_rtsp.split(",") if u.strip()]

    cctv_urls = os.getenv("CCTV_URLS", "").strip()
    if cctv_urls and cctv_urls != "0":
        urls = [u.strip() for u in cctv_urls.split(",") if u.strip()]
        if urls:
            return [urls[0]]

    ptz_urls = os.getenv("PTZ_URLS", "").strip()
    if ptz_urls and ptz_urls != "0":
        urls = [u.strip() for u in ptz_urls.split(",") if u.strip()]
        if urls:
            return [urls[0]]

    return []


def test_rtsp_connection():
    """
    Validates RTSP camera connectivity without exposing credentials.
    Skips safely if no RTSP stream is configured.
    """
    urls = get_test_urls()

    if not urls:
        print("[INFO] No RTSP camera URL configured in environment variables.")
        print("[INFO] To test an RTSP camera, set TEST_RTSP_URL or CCTV_URLS in backend/.env:")
        print("       Example: TEST_RTSP_URL=\"rtsp://<username>:<password>@<camera-ip>:554/live\"")
        print("[INFO] Test safely skipped.")
        return 0

    # Ensure OpenCV FFMPEG timeout is set so socket operations do not hang
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;5000"

    print(f"[START] Testing RTSP stream connectivity for {len(urls)} stream(s)...")

    any_success = False
    for idx, url in enumerate(urls, 1):
        masked = mask_rtsp_url(url)
        print(f"\n[{idx}/{len(urls)}] Connecting to: {masked}")

        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print(f"[-] FAILED to open connection to {masked}")
            continue

        success, frame = cap.read()
        if success and frame is not None:
            print(f"[+] SUCCESS! Received video frame with resolution: {frame.shape[1]}x{frame.shape[0]} (Channels: {frame.shape[2]})")
            any_success = True
            cap.release()
            break
        else:
            print(f"[-] FAILED to read video frame from {masked}")
            cap.release()

    if any_success:
        print("\n[RESULT] RTSP stream verification passed.")
        return 0
    else:
        print("\n[WARN] Could not capture frames from configured test streams. Ensure network connectivity and camera status.")
        return 1


if __name__ == "__main__":
    sys.exit(test_rtsp_connection())
