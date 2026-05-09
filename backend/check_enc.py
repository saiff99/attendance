from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

res = supabase.table("students").select("id, full_name, face_encoding").execute()
for s in res.data:
    enc = s['face_encoding']
    enc_len = len(enc) if enc else 0
    print(f"Student: {s['full_name']} | Face Encoding Size: {enc_len}")
