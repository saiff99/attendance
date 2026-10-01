import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime
from dotenv import load_dotenv
from app.config import supabase

load_dotenv()

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "1304612619407965")
GRAPH_API_VERSION = "v21.0"


def clean_phone_number(phone: str) -> str:
    """Normalizes phone number to international E.164 digits without plus (e.g. 919876543210)."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    # If 10 digits (Standard Indian mobile number), prepend 91
    if len(digits) == 10 and digits[0] in ["6", "7", "8", "9"]:
        digits = f"91{digits}"
    return digits


def extract_parent_phone(student: dict) -> str:
    """Extracts parent WhatsApp phone number from student record or email pattern."""
    if not student:
        return ""
    # 1. Direct field if present
    if student.get("parent_phone"):
        return clean_phone_number(student["parent_phone"])
    
    # 2. Check face_encoding metadata dictionary
    fe = student.get("face_encoding")
    if isinstance(fe, dict) and fe.get("parent_phone"):
        return clean_phone_number(fe["parent_phone"])

    # 3. Check email encoding pattern: {roll}__p{phone}@student.local
    email = student.get("email", "")
    if "__p" in email:
        match = re.search(r"__p([0-9]+)@", email)
        if match:
            return clean_phone_number(match.group(1))

    return ""


def send_whatsapp_raw(to_phone: str, text: str, template_name: str = None) -> dict:
    """Sends a WhatsApp message via Meta Cloud API."""
    token = os.getenv("WHATSAPP_TOKEN", WHATSAPP_TOKEN).strip()
    phone_id = os.getenv("WHATSAPP_PHONE_ID", WHATSAPP_PHONE_ID).strip()

    if not token or not phone_id:
        return {"success": False, "error": "WhatsApp credentials not configured."}

    recipient = clean_phone_number(to_phone)
    if not recipient or len(recipient) < 10:
        return {"success": False, "error": f"Invalid recipient phone number: '{to_phone}'"}

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_id}/messages"
    
    # Payload for Text Message
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": text
        }
    }

    if template_name:
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": "en_US"}
            }
        }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            return {"success": True, "data": data, "recipient": recipient}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        fb_err = err_msg
        err_code = None
        try:
            err_json = json.loads(err_msg)
            err_obj = err_json.get("error", {})
            raw_msg = err_obj.get("message", "")
            err_code = err_obj.get("code")
            
            if err_code == 131030 or "not in allowed list" in raw_msg.lower():
                fb_err = "Sandbox Restriction: Recipient number is not added to the allowed test list in Meta Developer Portal. (Go to WhatsApp > API Setup > Step 1 > Manage phone number list)."
            elif err_code == 190 or "session has expired" in raw_msg.lower() or "invalid oauth" in raw_msg.lower():
                fb_err = "Meta Access Token expired. Please copy a new Temporary Access Token from Meta Developer Portal > WhatsApp > API Setup."
            elif raw_msg:
                fb_err = raw_msg
        except Exception:
            fb_err = err_msg
        return {"success": False, "error": fb_err, "recipient": recipient, "code": e.code, "meta_code": err_code}
    except Exception as e:
        return {"success": False, "error": str(e), "recipient": recipient}


def send_session_absentee_alerts(session_id: str) -> dict:
    """
    Finds all absent students for a given class session and sends personalized WhatsApp alerts
    to their registered parent/guardian WhatsApp phone numbers.
    """
    if not supabase:
        return {"success": False, "error": "Database not initialized."}

    # 1. Fetch Session Info
    sess_res = supabase.table("sessions").select("*").eq("id", session_id).execute()
    if not sess_res.data:
        return {"success": False, "error": "Session not found."}
    
    session = sess_res.data[0]
    class_name = session.get("class_name", "Medical Class")
    raw_instructor = session.get("instructor_name", "")
    
    # Extract topic from metadata
    topic = "Class Lecture"
    if "::" in raw_instructor:
        topic = raw_instructor.split("::")[0].strip() or topic
    elif raw_instructor:
        topic = raw_instructor.strip()

    # Format Date & Time in localized representation
    session_date = session.get("date", datetime.now().strftime("%Y-%m-%d"))
    start_time_iso = session.get("start_time")
    if start_time_iso:
        try:
            dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
            time_display = dt.strftime("%I:%M %p")
        except Exception:
            time_display = session_date
    else:
        time_display = session_date

    # 2. Fetch all registered students (optionally filtered by academic year)
    target_year = session.get("target_academic_year")
    student_query = supabase.table("students").select("id, student_roll, full_name, email, academic_year, face_encoding")
    if target_year and target_year != "All Years":
        student_query = student_query.eq("academic_year", target_year)
    
    students_res = student_query.order("student_roll").execute()
    all_students = students_res.data or []

    if not all_students:
        return {"success": True, "message": "No students registered for this class.", "sent_count": 0, "absent_count": 0}

    # 3. Fetch all present attendance records for this session
    att_res = supabase.table("attendance").select("student_id, status").eq("session_id", session_id).eq("status", "Present").execute()
    present_student_ids = set(r["student_id"] for r in (att_res.data or []))

    # 4. Identify Absent Students
    absent_students = [s for s in all_students if s["id"] not in present_student_ids]
    
    results = []
    sent_count = 0
    failed_count = 0
    missing_phone_count = 0

    for s in absent_students:
        parent_phone = extract_parent_phone(s)
        student_name = s.get("full_name", "Student")
        student_roll = s.get("student_roll", "N/A")

        if not parent_phone:
            missing_phone_count += 1
            results.append({
                "student_id": s["id"],
                "student_roll": student_roll,
                "student_name": student_name,
                "status": "skipped_no_phone",
                "message": "No parent WhatsApp number registered."
            })
            continue

        # Formulate rich, respectful, professional WhatsApp alert message
        alert_text = (
            f"🏫 *Jagannath Gupta Institute of Medical Sciences & Hospital*\n"
            f"⚠️ *Student Attendance Alert Notice*\n\n"
            f"Dear Parent/Guardian,\n"
            f"This is to notify you that your ward *{student_name}* (Roll No: *{student_roll}*) was marked *ABSENT* for today's scheduled class session:\n\n"
            f"📚 *Class / Hall:* {class_name}\n"
            f"👨‍🏫 *Topic:* {topic}\n"
            f"📅 *Date & Time:* {session_date} at {time_display}\n\n"
            f"If this is an authorized medical leave or university posting, please disregard this notice or contact the faculty administration."
        )

        resp = send_whatsapp_raw(parent_phone, alert_text)
        
        if resp.get("success"):
            sent_count += 1
            results.append({
                "student_id": s["id"],
                "student_roll": student_roll,
                "student_name": student_name,
                "phone": parent_phone,
                "status": "sent",
                "message_id": resp.get("data", {}).get("messages", [{}])[0].get("id", "ok")
            })
        else:
            failed_count += 1
            results.append({
                "student_id": s["id"],
                "student_roll": student_roll,
                "student_name": student_name,
                "phone": parent_phone,
                "status": "failed",
                "error": resp.get("error", "Failed to deliver")
            })

    return {
        "success": True,
        "total_enrolled": len(all_students),
        "present_count": len(present_student_ids),
        "absent_count": len(absent_students),
        "sent_count": sent_count,
        "failed_count": failed_count,
        "missing_phone_count": missing_phone_count,
        "details": results
    }
