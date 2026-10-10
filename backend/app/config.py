import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# Supabase Initialization
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://bsphlgmxzmlbgzanpujh.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_u8O4lCQg9KtcxeLj7nxqFg_xu3v2WLz")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Failed to initialize Supabase client: {e}")
    supabase = None

def get_camera_urls():
    """Returns a list of primary/main camera URLs parsed from the CCTV_URLS env variable."""
    urls_str = os.getenv("CCTV_URLS", "0")
    return [url.strip() for url in urls_str.split(",") if url.strip()]

def get_cctv_ai_urls():
    """Returns a list of optional AI sub-stream URLs parsed from CCTV_AI_URLS env variable."""
    urls_str = os.getenv("CCTV_AI_URLS", "")
    if not urls_str.strip():
        return []
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
    """Returns detailed metadata for all configured CCTV cameras including main and AI sub-streams."""
    urls = get_camera_urls()
    ai_urls = get_cctv_ai_urls()
    details = []
    for idx, url in enumerate(urls):
        preset = CAMERA_PRESETS[idx] if idx < len(CAMERA_PRESETS) else {
            "name": f"Camera {idx + 1}",
            "row": "General",
            "position": f"Cam {idx + 1}",
            "ip": url.split("@")[-1].split(":")[0] if "@" in url else "Local"
        }
        # Fallback: If no dedicated AI sub-stream is defined, use the primary stream URL
        ai_url = ai_urls[idx] if idx < len(ai_urls) and ai_urls[idx] else url
        details.append({
            "index": idx,
            "id": f"cam-{idx + 1}",
            "name": preset["name"],
            "row": preset["row"],
            "position": preset["position"],
            "ip": preset["ip"],
            "url": url,
            "ai_url": ai_url
        })
    return details

def get_ptz_urls():
    """Returns a list of PTZ camera URLs parsed from the PTZ_URLS env variable."""
    urls_str = os.getenv("PTZ_URLS", "0")
    return [url.strip() for url in urls_str.split(",") if url.strip()]


import re
from typing import Optional

def is_cohort_matching(target_cohort: Optional[str], student_year: Optional[str]) -> bool:
    """
    Checks if a student's academic year / sub-group is permitted for a session's target cohort.
    
    Rules:
    1. If target_cohort is 'All', 'All Years', 'All MBBS Batches', 'All Group', empty or None:
       -> ALLOW ALL students from any year/group.
    2. If target_cohort specifies a Base Year without a sub-group (e.g. '1st Year', '1st Year MBBS', '2nd Year'):
       -> ALLOW ALL students belonging to that base year (including Group A, Group B, Group C, or unassigned).
    3. If target_cohort specifies a specific Sub-Group (e.g. '1st Year (Group B)'):
       -> ALLOW ONLY students who belong to that base year AND that specific sub-group.
    """
    if not target_cohort:
        return True
    
    t = str(target_cohort).strip()
    t_lower = t.lower()
    
    if (
        not t
        or t_lower in ("all", "all years", "all mbbs batches", "all group")
        or "all group" in t_lower
        or "full cohort" in t_lower
    ):
        return True
        
    if not student_year:
        return False
        
    s = str(student_year).strip()
    s_lower = s.lower()
    
    def get_base_year(val: str) -> str:
        clean = re.sub(r"\s*\([^)]*\)", "", val)
        clean = re.sub(r"\s*mbbs", "", clean, flags=re.IGNORECASE)
        return clean.strip().lower()
        
    target_base = get_base_year(t)
    student_base = get_base_year(s)
    
    if target_base and student_base and target_base != student_base:
        t_digit = re.search(r"\b\d+", target_base)
        s_digit = re.search(r"\b\d+", student_base)
        if t_digit and s_digit and t_digit.group(0) != s_digit.group(0):
            return False
        if not t_digit or not s_digit:
            if not student_base.startswith(target_base) and not target_base.startswith(student_base):
                return False
                
    # Check specific sub-group requirement
    target_group_match = re.search(r"\(((?:Group|Batch)\s*[^)]+)\)", t, re.IGNORECASE)
    if target_group_match:
        required_group = re.sub(r"^batch\s*", "group ", target_group_match.group(1).strip(), flags=re.IGNORECASE).lower()
        student_group_match = re.search(r"\(((?:Group|Batch)\s*[^)]+)\)", s, re.IGNORECASE)
        if not student_group_match:
            return False
        student_group = re.sub(r"^batch\s*", "group ", student_group_match.group(1).strip(), flags=re.IGNORECASE).lower()
        return required_group == student_group
        
    return True


import math

DEFAULT_GEOFENCE_CONFIG = {
    "enabled": False,
    "latitude": 22.4285,
    "longitude": 88.2435,
    "radiusMeters": 200.0,
    "campusName": "Jagannath Gupta Institute of Medical Sciences (JIMSH)",
}


def get_server_geofence_config() -> dict:
    """Fetches the latest geofence settings from Supabase or returns defaults."""
    try:
        if supabase:
            res = supabase.table("settings").select("value").eq("key", "campus_geofence").execute()
            if res.data and res.data[0].get("value"):
                val = res.data[0]["value"]
                return {
                    "enabled": bool(val.get("enabled", False)),
                    "latitude": float(val.get("latitude", DEFAULT_GEOFENCE_CONFIG["latitude"])),
                    "longitude": float(val.get("longitude", DEFAULT_GEOFENCE_CONFIG["longitude"])),
                    "radiusMeters": float(val.get("radiusMeters", DEFAULT_GEOFENCE_CONFIG["radiusMeters"])),
                    "campusName": str(val.get("campusName", DEFAULT_GEOFENCE_CONFIG["campusName"])),
                }
    except Exception:
        pass
    return DEFAULT_GEOFENCE_CONFIG


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in meters using the Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2.0) ** 2) + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c



