import os
import sys
import json
import math
from typing import Any
from dotenv import load_dotenv
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = Any

# Load environment variables explicitly from backend/.env or parent
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_path = os.path.join(_backend_dir, ".env")
if os.getenv("SKIP_DOTENV") != "1":
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
    load_dotenv()

# Supabase Initialization
SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "").strip()

if not SUPABASE_URL:
    raise RuntimeError(
        "FATAL CONFIGURATION ERROR: SUPABASE_URL is missing from environment! "
        "Production server cannot start without an authoritative Supabase database connection. "
        "Please configure SUPABASE_URL in backend/.env under Zero-Trust standards."
    )

if not SUPABASE_KEY:
    raise RuntimeError(
        "FATAL CONFIGURATION ERROR: SUPABASE_SERVICE_ROLE_KEY is missing from environment! "
        "Backend server-side operations require service-role credentials to interact with the database under Zero-Trust RLS. "
        "Please configure SUPABASE_SERVICE_ROLE_KEY in backend/.env."
    )

try:
    supabase: Any = create_client(SUPABASE_URL, SUPABASE_KEY) if create_client else None
except Exception as e:
    raise RuntimeError(f"FATAL DATABASE ERROR: Failed to initialize Supabase client: {e}")

def attach_supabase_resilience(client):
    """
    Patches the postgrest httpx.Client session to automatically heal and reconnect
    when Supabase/Cloudflare severs idle keep-alive TCP sockets (e.g. RemoteProtocolError: Server disconnected).
    """
    if not client or not hasattr(client, "postgrest") or not hasattr(client.postgrest, "session"):
        return client

    session = client.postgrest.session
    if getattr(session, "_is_resilient_patched", False):
        return client

    orig_send = session.send

    def resilient_send(request, *args, **kwargs):
        # Buffer request content in memory so it can be replayed on retry
        try:
            if hasattr(request, "read"):
                request.read()
        except Exception:
            pass

        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                return orig_send(request, *args, **kwargs)
            except Exception as exc:
                err_str = str(exc).lower()
                transient_signals = [
                    "server disconnected",
                    "remoteprotocolerror",
                    "connection reset",
                    "connection closed",
                    "broken pipe",
                    "eof occurred",
                    "transport",
                ]
                is_transient = any(sig in err_str for sig in transient_signals)
                if is_transient and attempt < max_retries:
                    import time
                    import httpx
                    print(f"[Supabase Auto-Healing] Idle socket disconnected ('{exc}'). Refreshing connection pool ({attempt + 1}/{max_retries})...")
                    try:
                        session.close()
                    except Exception:
                        pass
                    fresh_session = httpx.Client(
                        base_url=session.base_url,
                        headers=session.headers,
                        timeout=session.timeout,
                    )
                    client.postgrest.session = fresh_session
                    attach_supabase_resilience(client)
                    time.sleep(0.15)
                    return client.postgrest.session.send(request, *args, **kwargs)
                raise exc

    session.send = resilient_send
    session._is_resilient_patched = True
    return client

# Automatically attach resilience to the default client
if supabase:
    attach_supabase_resilience(supabase)

def get_supabase_client(force_new: bool = False):
    """Returns the resilient Supabase client instance, recreating if requested."""
    global supabase
    if not SUPABASE_KEY or not create_client:
        raise RuntimeError("FATAL CONFIGURATION ERROR: Supabase client requested but SUPABASE_SERVICE_ROLE_KEY or supabase-py library is missing.")
    if supabase is None or force_new:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
            attach_supabase_resilience(supabase)
        except Exception as e:
            raise RuntimeError(f"FATAL DATABASE ERROR: Failed to initialize Supabase client: {e}")
    return supabase

def safe_db_execute(query_builder, max_retries: int = 2):
    """
    Executes a Supabase query builder with secondary retry protection in case
    underlying socket transport raises an unhandled connection drop.
    """
    if query_builder is None:
        raise RuntimeError("Database query builder is None: Supabase client is not configured or disabled.")
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return query_builder.execute()
        except Exception as exc:
            last_err = exc
            err_msg = str(exc).lower()
            if any(s in err_msg for s in ["server disconnected", "remoteprotocolerror", "protocolerror", "connection reset", "broken pipe", "stream", "httpcore", "read_incoming_data"]) and attempt < max_retries:
                import time
                print(f"[safe_db_execute] Transient socket disconnect caught ('{exc}'), retrying execution ({attempt + 1}/{max_retries})...")
                time.sleep(0.3)
                continue
            raise
    if last_err is not None:
        raise last_err
    raise RuntimeError("Supabase query execution failed.")

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

import re
from typing import Optional

def redact_stream_url(url: Optional[str]) -> str:
    """
    Safely redacts passwords and credentials from stream URLs (RTSP, HTTP, etc.).
    Handles special characters in passwords and ensures sensitive credentials are masked.
    Example:
        'rtsp://admin:Tech_1234@172.16.7.5:554/live' -> 'rtsp://admin:***@172.16.7.5:554/live'
    """
    if not url or not isinstance(url, str):
        return str(url) if url is not None else ""
    return re.sub(r'(://[^/@:]+):(.*)@([^/@]+(?:/.*)?)$', r'\1:***@\3', url)

def get_camera_details(redact_credentials: bool = False):
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
        display_url = redact_stream_url(url) if redact_credentials else url
        display_ai_url = redact_stream_url(ai_url) if redact_credentials else ai_url
        details.append({
            "index": idx,
            "id": f"cam-{idx + 1}",
            "name": preset["name"],
            "row": preset["row"],
            "position": preset["position"],
            "ip": preset["ip"],
            "url": display_url,
            "ai_url": display_ai_url
        })
    return details

def get_ptz_urls():
    """Returns a list of PTZ camera URLs parsed from the PTZ_URLS env variable."""
    urls_str = os.getenv("PTZ_URLS", "0")
    return [url.strip() for url in urls_str.split(",") if url.strip()]


def has_valid_face_encoding(face_encoding) -> bool:
    """
    Verifies that face_encoding is a genuine ArcFace/InsightFace biometric vector template
    (typically 512 dimensions) rather than None, empty, or metadata.
    """
    if not face_encoding:
        return False
    if isinstance(face_encoding, list):
        return len(face_encoding) >= 128
    if isinstance(face_encoding, dict):
        keys = set(face_encoding.keys())
        return len(keys) > 0 and keys != {"parent_phone"}
    return False


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
    
    t = target_cohort.strip()
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
        
    s = student_year.strip()
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
    "enabled": True,  # Secure by default: always enabled
    "latitude": 22.451550,
    "longitude": 88.172366,
    "radiusMeters": 30.0,
    "campusName": "JIMSH Medical College Campus & Lecture Halls",
}


def _parse_and_sanitize_geofence(val: dict) -> dict:
    """Sanitizes and bounds raw geofence dictionary values."""
    enabled_val = val.get("enabled")
    enabled = bool(enabled_val) if enabled_val is not None else DEFAULT_GEOFENCE_CONFIG["enabled"]

    try:
        lat = float(val.get("latitude", DEFAULT_GEOFENCE_CONFIG["latitude"]))
        if math.isnan(lat) or math.isinf(lat) or not (-90.0 <= lat <= 90.0):
            lat = DEFAULT_GEOFENCE_CONFIG["latitude"]
    except (ValueError, TypeError):
        lat = DEFAULT_GEOFENCE_CONFIG["latitude"]

    try:
        lng = float(val.get("longitude", DEFAULT_GEOFENCE_CONFIG["longitude"]))
        if math.isnan(lng) or math.isinf(lng) or not (-180.0 <= lng <= 180.0):
            lng = DEFAULT_GEOFENCE_CONFIG["longitude"]
    except (ValueError, TypeError):
        lng = DEFAULT_GEOFENCE_CONFIG["longitude"]

    try:
        radius = float(val.get("radiusMeters", DEFAULT_GEOFENCE_CONFIG["radiusMeters"]))
        if math.isnan(radius) or math.isinf(radius) or radius <= 0:
            radius = DEFAULT_GEOFENCE_CONFIG["radiusMeters"]
    except (ValueError, TypeError):
        radius = DEFAULT_GEOFENCE_CONFIG["radiusMeters"]

    campus_name = str(val.get("campusName", DEFAULT_GEOFENCE_CONFIG["campusName"])).strip() or DEFAULT_GEOFENCE_CONFIG["campusName"]

    return {
        "enabled": enabled,
        "latitude": lat,
        "longitude": lng,
        "radiusMeters": radius,
        "campusName": campus_name,
    }


def get_server_geofence_config() -> dict:
    """Fetches the latest geofence settings from Supabase (settings table or system session row) or returns secure defaults."""
    # 1. Try public.settings table
    try:
        if supabase:
            res = supabase.table("settings").select("value").eq("key", "campus_geofence").execute()
            if res.data and res.data[0].get("value"):
                return _parse_and_sanitize_geofence(res.data[0]["value"])
    except Exception:
        pass

    # 2. Fallback to sessions table system config row (00000000-0000-0000-0000-000000000001)
    try:
        if supabase:
            res2 = supabase.table("sessions").select("instructor_name").eq("id", "00000000-0000-0000-0000-000000000001").execute()
            if res2.data and res2.data[0].get("instructor_name"):
                raw_json = res2.data[0]["instructor_name"]
                parsed = json.loads(raw_json)
                return _parse_and_sanitize_geofence(parsed)
    except Exception:
        pass

    return DEFAULT_GEOFENCE_CONFIG.copy()


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



