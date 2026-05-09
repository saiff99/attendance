from supabase import create_client, Client
import os
from dotenv import load_dotenv
import numpy as np
from numpy.linalg import norm

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

res = supabase.table("students").select("id, full_name, face_encoding").not_.is_("face_encoding", "null").execute()
for s in res.data:
    enc = s['face_encoding']
    if enc and len(enc) == 512:
        print(f"Valid 512D encoding found for: {s['full_name']}")
        enc_np = np.array(enc)
        print("Norm:", norm(enc_np))
