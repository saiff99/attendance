from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Get a valid session
res_sess = supabase.table("sessions").select("id").limit(1).execute()
sess_id = res_sess.data[0]['id']

# Get a valid student
res_stu = supabase.table("students").select("id").eq("full_name", "SAIF").execute()
stu_id = res_stu.data[0]['id']

print(f"Testing insert for session {sess_id} and student {stu_id} with Live CCTV")
try:
    res = supabase.table("attendance").insert({
        "session_id": sess_id,
        "student_id": stu_id,
        "status": "Present",
        "capture_mode": "Live CCTV",
        "confidence_score": 0.95
    }).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", e)
