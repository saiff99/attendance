import cv2
import numpy as np
from insightface.app import FaceAnalysis
from supabase import create_client, Client
import os
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

# 2. Init InsightFace
app_fa = FaceAnalysis(name='buffalo_sc')
app_fa.prepare(ctx_id=0, det_size=(640, 640))

# 3. Load screenshot
screenshot_path = "/Users/saif/.gemini/antigravity/brain/90eb2ede-12c4-48a7-bbcb-0fc4b92c5e91/debug_enrollment_error_2_1778006339242.webp"
img = cv2.imread(screenshot_path)

if img is None:
    print("Could not read image")
    exit(1)

# Try detection on original image
faces = app_fa.get(img)

if not faces:
    print("No face found in original image. Cropping to webcam area...")
    h, w, _ = img.shape
    # Guessing webcam box coordinates based on UI layout
    crop_img = img[int(h*0.2):int(h*0.8), int(w*0.1):int(w*0.6)]
    faces = app_fa.get(crop_img)

if not faces:
    print("No face found in cropped image either.")
    exit(1)

print("Face found! Extracting embedding...")
encoding = faces[0].embedding.tolist()

# 4. Save to DB
supabase.table("students").update({"face_encoding": encoding}).eq("id", student_id).execute()
print("Success! Enrolled 512D face encoding.")
