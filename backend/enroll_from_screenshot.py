import asyncio
import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Get SAIF's student ID
res = supabase.table("students").select("id").eq("full_name", "SAIF").execute()
if not res.data:
    print("Could not find SAIF in DB.")
    exit(1)

student_id = res.data[0]['id']

# 2. Upload the screenshot image
screenshot_path = "/Users/saif/.gemini/antigravity/brain/90eb2ede-12c4-48a7-bbcb-0fc4b92c5e91/debug_enrollment_error_2_1778006339242.webp"

if not os.path.exists(screenshot_path):
    print("Screenshot not found at:", screenshot_path)
    exit(1)

with open(screenshot_path, "rb") as f:
    files = {"file": ("screenshot.webp", f, "image/webp")}
    response = requests.post(f"http://localhost:8000/api/enroll-face/{student_id}", files=files)
    
print("Enrollment Response:", response.status_code, response.text)
