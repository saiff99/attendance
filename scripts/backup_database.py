#!/usr/bin/env python3
"""
MedAttend Production 1-Click Database Backup Utility.
Exports all Students (including biometric face encodings & DPDP consent),
Class Sessions, Historical Attendance Records, and Academic Subjects.
"""
import os
import sys
import json
import time
import hashlib
from datetime import datetime

# Add project root to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Load environment
def load_env(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k and k not in os.environ:
                        os.environ[k] = v

load_env(os.path.join(BACKEND_DIR, ".env"))
load_env(os.path.join(BASE_DIR, "frontend", ".env.local"))

from app.config import supabase

def fetch_table_paginated(table_name, select_cols="*"):
    all_rows = []
    start = 0
    step = 1000
    while True:
        res = supabase.table(table_name).select(select_cols).range(start, start + step - 1).execute()
        rows = res.data or []
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < step:
            break
        start += step
    return all_rows

def main():
    print("\n========================================================")
    print(" 📦 MedAttend Production Database 1-Click Backup Tool")
    print("========================================================")
    print(f"📡 Connecting to Supabase: {os.getenv('SUPABASE_URL', '').split('//')[-1]}")
    
    start_time = time.time()
    
    # 1. Fetch tables
    print("⏳ [1/5] Exporting Registered Students & Face Biometrics...")
    students = fetch_table_paginated("students", "*")
    print(f"   ✓ Fetched {len(students)} student profiles (with face encodings)")

    print("⏳ [2/5] Exporting Class Sessions & Geofences...")
    sessions = fetch_table_paginated("sessions", "*")
    print(f"   ✓ Fetched {len(sessions)} class sessions")

    print("⏳ [3/5] Exporting Historical Attendance Records...")
    attendance = fetch_table_paginated("attendance", "*")
    print(f"   ✓ Fetched {len(attendance)} attendance records")

    print("⏳ [4/5] Exporting Academic Subjects & Curriculum...")
    subjects = fetch_table_paginated("academic_subjects", "id, academic_year, name, code, department, is_active")
    print(f"   ✓ Fetched {len(subjects)} academic subjects")

    print("⏳ [5/5] Exporting System Settings...")
    settings_all = fetch_table_paginated("settings", "key, value, updated_at")
    settings = [s for s in settings_all if not s.get("key", "").startswith("rl_")]
    print(f"   ✓ Fetched {len(settings)} configuration settings")

    # 2. Package and Checksum
    backup_data = {
        "students": students,
        "sessions": sessions,
        "attendance": attendance,
        "subjects": subjects,
        "settings": settings
    }
    data_str = json.dumps(backup_data, sort_keys=True)
    checksum = hashlib.sha256(data_str.encode("utf-8")).hexdigest()
    
    now_iso = datetime.now().isoformat()
    now_filename = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    
    payload = {
        "app": "MedAttend",
        "version": "2.0",
        "exported_at": now_iso,
        "record_counts": {
            "students": len(students),
            "sessions": len(sessions),
            "attendance": len(attendance),
            "subjects": len(subjects),
            "settings": len(settings)
        },
        "checksum": checksum,
        "data": backup_data
    }

    # 3. Save to backups directory
    backups_dir = os.path.join(BASE_DIR, "backups")
    os.makedirs(backups_dir, exist_ok=True)
    backup_file = os.path.join(backups_dir, f"medattend_backup_{now_filename}.json")

    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    elapsed = round(time.time() - start_time, 2)
    file_size_kb = round(os.path.getsize(backup_file) / 1024, 2)

    print("\n--------------------------------------------------------")
    print(" ✅ Database Backup Successfully Created!")
    print(f" 📁 Saved To : {backup_file}")
    print(f" 📊 Size     : {file_size_kb} KB (Generated in {elapsed}s)")
    print(f" 🔒 SHA-256  : {checksum}")
    print("--------------------------------------------------------")
    print(f"  • Students           : {len(students)}")
    print(f"  • Sessions           : {len(sessions)}")
    print(f"  • Attendance Records : {len(attendance)}")
    print(f"  • Subjects           : {len(subjects)}")
    print("========================================================\n")

if __name__ == "__main__":
    main()
