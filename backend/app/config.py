import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# Supabase Initialization
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://placeholder")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "placeholder")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Failed to initialize Supabase client: {e}")
    supabase = None

def get_camera_urls():
    """Returns a list of camera URLs parsed from the CCTV_URLS env variable."""
    urls_str = os.getenv("CCTV_URLS", "0")
    return [url.strip() for url in urls_str.split(",") if url.strip()]

CAMERA_PRESETS = [
    {"name": "1L", "row": "1st Row (Front)", "position": "Left", "ip": "172.16.7.5"},
    {"name": "1M", "row": "1st Row (Front)", "position": "Middle", "ip": "172.16.7.3"},
    {"name": "1R", "row": "1st Row (Front)", "position": "Right", "ip": "172.16.7.17"},
    {"name": "2L", "row": "2nd Row (Back)", "position": "Left", "ip": "172.16.7.16"},
    {"name": "2M", "row": "2nd Row (Back)", "position": "Middle", "ip": "172.16.7.18"},
    {"name": "2R", "row": "2nd Row (Back)", "position": "Right", "ip": "172.16.7.9"},
]

def get_camera_details():
    """Returns detailed metadata for all configured CCTV cameras."""
    urls = get_camera_urls()
    details = []
    for idx, url in enumerate(urls):
        preset = CAMERA_PRESETS[idx] if idx < len(CAMERA_PRESETS) else {
            "name": f"Camera {idx + 1}",
            "row": "General",
            "position": f"Cam {idx + 1}",
            "ip": url.split("@")[-1].split(":")[0] if "@" in url else "Local"
        }
        details.append({
            "index": idx,
            "id": f"cam-{idx + 1}",
            "name": preset["name"],
            "row": preset["row"],
            "position": preset["position"],
            "ip": preset["ip"],
            "url": url
        })
    return details

def get_ptz_urls():
    """Returns a list of PTZ camera URLs parsed from the PTZ_URLS env variable."""
    urls_str = os.getenv("PTZ_URLS", "0")
    return [url.strip() for url in urls_str.split(",") if url.strip()]

