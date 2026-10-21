import os
import re
import json
import time
import urllib.request
import urllib.error
from datetime import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv
from app.config import supabase, is_cohort_matching

load_dotenv()

WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "http://127.0.0.1:5005").rstrip("/")
WHATSAPP_TIMEOUT = float(os.getenv("WHATSAPP_TIMEOUT", "6.0"))


def clean_phone_number(phone: str) -> str:
    """Normalizes phone number to digits (e.g. 919876543210 or 9876543210)."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) == 10 and digits[0] in ["6", "7", "8", "9"]:
        digits = f"91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        digits = f"91{digits[1:]}"
    return digits


def extract_parent_phone(student: dict) -> str:
    """Extracts parent WhatsApp phone number from student record or email pattern."""
    if not student:
        return ""
    if student.get("parent_phone"):
        return clean_phone_number(student["parent_phone"])

    fe = student.get("face_encoding")
    if isinstance(fe, dict) and fe.get("parent_phone"):
        return clean_phone_number(fe["parent_phone"])

    email = student.get("email", "")
    if "__p" in email:
        match = re.search(r"__p([0-9]+)@", email)
        if match:
            return clean_phone_number(match.group(1))

    return ""


def decode_session_topic(raw_instructor: str) -> str:
    """Strips GPS metadata and extracts clean topic name for WhatsApp notices."""
    if not raw_instructor:
        return "General Medical Lecture"
    cleaned = re.sub(r"\[GPS:[^\]]*\]", "", str(raw_instructor)).strip()
    if "::" in cleaned:
        parts = [p.strip() for p in cleaned.split("::") if p.strip()]
        if len(parts) >= 2:
            return parts[1]
        elif parts:
            return parts[0]
    return cleaned or "General Medical Lecture"


def get_whatsapp_status() -> dict:
    """
    Fetches real-time WhatsApp Web connection status and active QR code Data URL
    from the local Baileys bridge service.
    """
    url = f"{WHATSAPP_SERVICE_URL}/status"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MedAttend-Backend"})
        with urllib.request.urlopen(req, timeout=WHATSAPP_TIMEOUT) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            return {
                "success": True,
                "status": data.get("status", "disconnected"),
                "qr": data.get("qr"),
                "user": data.get("user")
            }
    except Exception as e:
        return {
            "success": False,
            "status": "disconnected",
            "error": f"WhatsApp bridge service offline: {str(e)}",
            "qr": None,
            "user": None
        }


def disconnect_whatsapp() -> dict:
    """
    Disconnects the active WhatsApp Web session and requests a fresh QR code.
    """
    url = f"{WHATSAPP_SERVICE_URL}/disconnect"
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({}).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "MedAttend-Backend"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=WHATSAPP_TIMEOUT) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except Exception as e:
        return {"success": False, "error": f"Failed to disconnect WhatsApp session: {str(e)}"}


def send_whatsapp_raw(to_phone: str, text: str) -> dict:
    """
    Sends a single message through the connected WhatsApp account.
    """
    url = f"{WHATSAPP_SERVICE_URL}/send"
    payload = {
        "phone": to_phone,
        "message": text
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "MedAttend-Backend"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=12.0) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as he:
        try:
            err_json = json.loads(he.read().decode("utf-8"))
            return {"success": False, "error": err_json.get("error", f"HTTP {he.code}")}
        except Exception:
            return {"success": False, "error": f"HTTP {he.code}"}
    except Exception as e:
        return {"success": False, "error": f"WhatsApp send failed: {str(e)}"}


def send_session_absentee_alerts(session_id: str, async_mode: bool = True) -> dict:
    """
    Gathers absent students from the class session and dispatches notices via the
    WhatsApp Multi-Device Bridge service with safe throttling.
    """
    if not supabase:
        return {"success": False, "error": "Database not initialized."}

    # 1. Fetch Session Info
    try:
        sess_res = supabase.table("sessions").select("*").eq("id", str(session_id).strip()).execute()
        if not sess_res.data:
            return {"success": False, "error": f"Session '{session_id}' not found."}
        session = sess_res.data[0]
    except Exception as e:
        return {"success": False, "error": f"Database query error: {str(e)}"}

    class_name = session.get("class_name", "Medical Class")
    raw_instructor = session.get("instructor_name", "")
    topic = decode_session_topic(raw_instructor)
    session_date = session.get("date", datetime.now().strftime("%Y-%m-%d"))

    # 2. Fetch enrolled students
    target_year = session.get("target_academic_year")
    student_query = supabase.table("students").select("id, student_roll, full_name, email, academic_year, face_encoding")
    students_res = student_query.order("student_roll").execute()
    raw_students = students_res.data or []
    all_students = [s for s in raw_students if is_cohort_matching(target_year, s.get("academic_year"))]

    if not all_students:
        return {"success": True, "message": "No students registered for this class.", "sent_count": 0, "absent_count": 0, "details": []}

    # 3. Fetch present students
    att_res = supabase.table("attendance").select("student_id, status").eq("session_id", session_id).eq("status", "Present").execute()
    present_student_ids = set(r["student_id"] for r in (att_res.data or []))

    # 4. Filter absent students
    absent_students = [s for s in all_students if s["id"] not in present_student_ids]

    recipients = []
    for s in absent_students:
        phone = extract_parent_phone(s)
        recipients.append({
            "id": s["id"],
            "student_name": s.get("full_name", "Student"),
            "student_roll": s.get("student_roll", "N/A"),
            "phone": phone
        })

    # 5. Forward batch to WhatsApp Service
    batch_url = f"{WHATSAPP_SERVICE_URL}/send-batch"
    batch_payload = {
        "sessionId": session_id,
        "sessionName": class_name,
        "topicName": topic,
        "date": session_date,
        "recipients": recipients
    }

    try:
        req = urllib.request.Request(
            batch_url,
            data=json.dumps(batch_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "MedAttend-Backend"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15.0) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            data["total_enrolled"] = len(all_students)
            data["present_count"] = len(present_student_ids)
            data["absent_count"] = len(absent_students)
            return data
    except urllib.error.HTTPError as he:
        try:
            err_json = json.loads(he.read().decode("utf-8"))
            return {"success": False, "error": err_json.get("error", f"HTTP {he.code}")}
        except Exception:
            return {"success": False, "error": f"HTTP {he.code}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to dispatch to WhatsApp service: {str(e)}"}


def get_whatsapp_job_status(job_id: str) -> dict:
    """
    Fetches real-time progress for a batch dispatch job from WhatsApp service.
    """
    url = f"{WHATSAPP_SERVICE_URL}/job/{job_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MedAttend-Backend"})
        with urllib.request.urlopen(req, timeout=WHATSAPP_TIMEOUT) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as he:
        return {"success": False, "error": f"Job not found or HTTP {he.code}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch job status: {str(e)}"}
