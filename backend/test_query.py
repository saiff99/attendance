from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

res = supabase.table("attendance").select("*, students(student_roll, full_name)").eq("session_id", "3cf12bb5-7f61-458a-9fb1-cb646a19b068").order("recorded_at", desc=True).execute()
print(res)
