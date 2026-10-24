#!/usr/bin/env python3
"""
MedAttend Production Disaster Recovery & Database Restore Utility.
Restores Students (with biometric vectors), Sessions, Attendance Records,
and Subjects in strict foreign-key dependency order without cascading drops.
"""
import os
import sys
import json
import glob
import hashlib

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

try:
    from backend.app.config import supabase  # type: ignore
except ImportError:
    try:
        from app.config import supabase  # type: ignore
    except ImportError:
        from supabase import create_client  # type: ignore
        _url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
        _key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or ""
        supabase = create_client(_url, _key)

def batch_upsert(table_name, records, chunk_size=100, on_conflict="id"):
    if not records:
        return 0
    total = 0
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        res = supabase.table(table_name).upsert(chunk, on_conflict=on_conflict).execute()
        total += len(chunk)
        print(f"   ✓ {table_name}: restored {total}/{len(records)} records...", end="\r", flush=True)
    print(f"   ✓ {table_name}: successfully restored {total} records.           ")
    return total

def main():
    print("\n========================================================")
    print(" 🔄 MedAttend Production Database Restore Utility")
    print("========================================================")

    # 1. Locate backup file
    backup_file = None
    if len(sys.argv) > 1:
        backup_file = sys.argv[1]
    else:
        backups_dir = os.path.join(BASE_DIR, "backups")
        files = sorted(glob.glob(os.path.join(backups_dir, "medattend_backup_*.json")), reverse=True)
        if files:
            backup_file = files[0]
            print(f"📁 Auto-detected latest backup: {os.path.basename(backup_file)}")
        else:
            print("❌ No backup files found in backups/ directory.")
            print("   Usage: python3 scripts/restore_database.py <path-to-backup.json>")
            sys.exit(1)

    if not os.path.exists(backup_file):
        print(f"❌ Backup file not found: {backup_file}")
        sys.exit(1)

    print(f"📖 Reading backup file: {backup_file}...")
    with open(backup_file, "r", encoding="utf-8") as f:
        payload = json.load(f)

    if "data" not in payload:
        print("❌ Malformed backup file: Missing 'data' container.")
        sys.exit(1)

    data = payload["data"]
    students = data.get("students", [])
    sessions = data.get("sessions", [])
    attendance = data.get("attendance", [])
    subjects = data.get("subjects", [])
    settings = data.get("settings", [])

    # Checksum verification
    stored_checksum = payload.get("checksum")
    if stored_checksum:
        data_str = json.dumps(data, sort_keys=True)
        calculated = hashlib.sha256(data_str.encode("utf-8")).hexdigest()
        if calculated == stored_checksum:
            print(f"🔒 SHA-256 Checksum Verified: Integrity 100% Intact.")
        else:
            print(f"⚠️  WARNING: Checksum mismatch! File might be modified.")

    print("\n📊 Backup Contents to Restore:")
    print(f"  • Export Date        : {payload.get('exported_at', 'unknown')}")
    print(f"  • Registered Students: {len(students)}")
    print(f"  • Class Sessions     : {len(sessions)}")
    print(f"  • Attendance Records : {len(attendance)}")
    print(f"  • Academic Subjects  : {len(subjects)}")
    print(f"  • Settings Records   : {len(settings)}")
    print("--------------------------------------------------------")
    print("⚠️  This will safely UPSERT (merge/insert) these records into Supabase.")
    print("   Existing attendance IDs will be preserved without duplicates.")
    
    confirm = input("\nType 'CONFIRM' to execute restoration (or press Enter to cancel): ").strip()
    if confirm != "CONFIRM":
        print("❌ Restoration aborted by user.")
        sys.exit(0)

    print("\n⏳ Executing sequential disaster recovery restoration...")

    # Step 1: Subjects
    batch_upsert("academic_subjects", subjects, chunk_size=50)

    # Step 2: Settings (exclude transient rate limit keys)
    clean_settings = [s for s in settings if not s.get("key", "").startswith("rl_")]
    batch_upsert("settings", clean_settings, chunk_size=50, on_conflict="key")

    # Step 3: Students (Prerequisite for attendance foreign keys)
    batch_upsert("students", students, chunk_size=100)

    # Step 4: Sessions (Prerequisite for attendance foreign keys)
    batch_upsert("sessions", sessions, chunk_size=100)

    # Step 5: Attendance Logs
    batch_upsert("attendance", attendance, chunk_size=200)

    print("\n========================================================")
    print(" 🎉 Database Restoration Finished Successfully!")
    print(f" ✅ Restored {len(students)} students, {len(sessions)} sessions, and {len(attendance)} attendance records.")
    print("========================================================\n")

if __name__ == "__main__":
    main()
