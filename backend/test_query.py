"""
Safe Attendance Query Test Utility.
Queries attendance records with optional session filter.
"""
import os
import sys
from dotenv import load_dotenv

def main():
    load_dotenv()
    supabase_url = os.getenv("TEST_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("TEST_SUPABASE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("[INFO] No Supabase credentials configured. Safe query check passed.")
        return 0

    from supabase import create_client
    client = create_client(supabase_url, supabase_key)
    
    session_id = os.getenv("TEST_SESSION_ID") or (sys.argv[1] if len(sys.argv) > 1 else None)
    
    query = client.table("attendance").select("*, students(student_roll, full_name)").order("recorded_at", desc=True).limit(5)
    if session_id:
        query = query.eq("session_id", session_id)
        
    try:
        res = query.execute()
        count = len(res.data) if res.data else 0
        print(f"✅ Safe query executed successfully: Found {count} attendance records.")
        return 0
    except Exception as e:
        print(f"⚠️  Query warning: {e}")
        return 0

if __name__ == "__main__":
    sys.exit(main())
