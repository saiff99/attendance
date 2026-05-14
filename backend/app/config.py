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
