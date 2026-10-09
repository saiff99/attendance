import os
import re
import json
import time
import queue
import threading
import urllib.request
import urllib.error
from datetime import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv
from app.config import supabase, is_cohort_matching

load_dotenv()

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "1304612619407965")
GRAPH_API_VERSION = "v21.0"

# Step 8 — Configurable Timeouts, Retries & Bounded Queue
WHATSAPP_TIMEOUT = float(os.getenv("WHATSAPP_TIMEOUT", "8.0"))
WHATSAPP_MAX_RETRIES = int(os.getenv("WHATSAPP_MAX_RETRIES", "2"))
WHATSAPP_QUEUE_MAXSIZE = int(os.getenv("WHATSAPP_QUEUE_MAXSIZE", "2000"))

# Dedicated Thread-Safe Bounded Queue for WhatsApp Alerts (Never blocks AI or CCTV)
whatsapp_event_queue: queue.Queue = queue.Queue(maxsize=WHATSAPP_QUEUE_MAXSIZE)

# Background Job Tracking Storage
whatsapp_jobs: Dict[str, dict] = {}
_jobs_lock = threading.Lock()

def _whatsapp_worker_loop():
    """
    Dedicated Single Background Worker for WhatsApp network requests.
    Processes queued tasks sequentially without creating new OS threads per message.
    Protects camera streams, AI inference, and attendance database queues from network latency.
    """
    while True:
        try:
            task = whatsapp_event_queue.get()
            fn = task.get("fn")
            args = task.get("args", ())
            kwargs = task.get("kwargs", {})
            job_id = task.get("job_id")

            if callable(fn):
                try:
                    result = fn(*args, **kwargs)
                    if job_id and job_id in whatsapp_jobs:
                        with _jobs_lock:
                            job = whatsapp_jobs[job_id]
                            if result.get("success"):
                                job["sent_count"] = job.get("sent_count", 0) + 1
                            else:
                                job["failed_count"] = job.get("failed_count", 0) + 1
                            job.setdefault("details", []).append(result)
                            
                            processed = job["sent_count"] + job["failed_count"]
                            if processed >= job.get("queued_count", 0):
                                job["status"] = "completed"
                                job["completed_at"] = datetime.now().isoformat()
                except Exception as task_err:
                    print(f"[WHATSAPP TASK ERROR] {task_err}")
                    if job_id and job_id in whatsapp_jobs:
                        with _jobs_lock:
                            whatsapp_jobs[job_id]["failed_count"] = whatsapp_jobs[job_id].get("failed_count", 0) + 1

            whatsapp_event_queue.task_done()
        except Exception as e:
            print(f"[WHATSAPP WORKER EXCEPTION] {e}")
            time.sleep(1.0)

# Start persistent background worker thread (exactly 1 daemon thread)
threading.Thread(target=_whatsapp_worker_loop, daemon=True, name="WhatsAppWorker").start()


def update_whatsapp_credentials(token: str, phone_id: str = None) -> dict:
    """Updates the in-memory and .env WhatsApp token so alerts work instantly."""
    global WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
    if token:
        WHATSAPP_TOKEN = token.strip()
        os.environ["WHATSAPP_TOKEN"] = token.strip()
    if phone_id:
        WHATSAPP_PHONE_ID = phone_id.strip()
        os.environ["WHATSAPP_PHONE_ID"] = phone_id.strip()

    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    try:
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                lines = f.readlines()
        
        token_found = False
        phone_found = False
        new_lines = []
        for line in lines:
            if line.startswith("WHATSAPP_TOKEN="):
                new_lines.append(f"WHATSAPP_TOKEN={WHATSAPP_TOKEN}\n")
                token_found = True
            elif line.startswith("WHATSAPP_PHONE_ID=") and phone_id:
                new_lines.append(f"WHATSAPP_PHONE_ID={WHATSAPP_PHONE_ID}\n")
                phone_found = True
            else:
                new_lines.append(line)
        
        if not token_found:
            new_lines.append(f"WHATSAPP_TOKEN={WHATSAPP_TOKEN}\n")
        if phone_id and not phone_found:
            new_lines.append(f"WHATSAPP_PHONE_ID={WHATSAPP_PHONE_ID}\n")
            
        with open(env_path, "w") as f:
            f.writelines(new_lines)
    except Exception as e:
        print("Failed to save token to .env:", e)

    return {"success": True, "message": "WhatsApp Token updated successfully."}


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


def send_whatsapp_raw(to_phone: str, text: str, template_name: str = None) -> dict:
    """
    Sends a WhatsApp message via Meta Cloud API with bounded retries and timeout protection.
    Retries only on transient network glitches (5xx, timeouts). Fails immediately on 4xx fatal auth errors.
    """
    token = os.getenv("WHATSAPP_TOKEN", WHATSAPP_TOKEN).strip()
    phone_id = os.getenv("WHATSAPP_PHONE_ID", WHATSAPP_PHONE_ID).strip()

    if not token or not phone_id:
        return {"success": False, "error": "WhatsApp credentials not configured."}

    recipient = clean_phone_number(to_phone)
    if not recipient or len(recipient) < 10:
        return {"success": False, "error": f"Invalid recipient phone number: '{to_phone}'"}

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_id}/messages"
    
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

    last_error = ""
    meta_code = None
    http_code = None

    # Configurable retry loop (maximum WHATSAPP_MAX_RETRIES)
    for attempt in range(WHATSAPP_MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=WHATSAPP_TIMEOUT) as response:
                res_body = response.read().decode("utf-8")
                data = json.loads(res_body)
                return {"success": True, "data": data, "recipient": recipient}
        except urllib.error.HTTPError as e:
            http_code = e.code
            err_msg = e.read().decode("utf-8")
            fb_err = err_msg
            try:
                err_json = json.loads(err_msg)
                err_obj = err_json.get("error", {})
                raw_msg = err_obj.get("message", "")
                meta_code = err_obj.get("code")
                
                if meta_code == 131030 or "not in allowed list" in raw_msg.lower():
                    fb_err = "Sandbox Restriction: Recipient number is not added to the allowed test list in Meta Developer Portal. (Go to WhatsApp > API Setup > Step 1 > Manage phone number list)."
                elif meta_code == 190 or "session has expired" in raw_msg.lower() or "invalid oauth" in raw_msg.lower():
                    fb_err = "Meta Access Token expired. Please copy a new Temporary Access Token from Meta Developer Portal > WhatsApp > API Setup."
                elif raw_msg:
                    fb_err = raw_msg
            except Exception:
                fb_err = err_msg

            last_error = fb_err

            # Fatal 4xx client errors (do NOT retry invalid tokens, sandbox block, bad payload)
            if http_code in [400, 401, 403, 404] or meta_code in [131030, 190]:
                return {"success": False, "error": fb_err, "recipient": recipient, "code": http_code, "meta_code": meta_code}

            # Transient 5xx error -> exponential backoff retry
            if attempt < WHATSAPP_MAX_RETRIES:
                time.sleep(1.0 * (attempt + 1))
                continue
            return {"success": False, "error": fb_err, "recipient": recipient, "code": http_code, "meta_code": meta_code}

        except (urllib.error.URLError, TimeoutError, Exception) as e:
            last_error = f"Network Timeout / Connection Error: {str(e)}"
            if attempt < WHATSAPP_MAX_RETRIES:
                time.sleep(1.0 * (attempt + 1))
                continue
            return {"success": False, "error": last_error, "recipient": recipient}

    return {"success": False, "error": last_error or "Maximum retries exceeded", "recipient": recipient}


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


def _send_single_alert_task(student_info: dict, parent_phone: str, alert_text: str) -> dict:
    """Worker task unit that sends one message and returns execution result."""
    resp = send_whatsapp_raw(parent_phone, alert_text)
    student_name = student_info.get("full_name", "Student")
    student_roll = student_info.get("student_roll", "N/A")
    student_id = student_info.get("id", "")

    if resp.get("success"):
        return {
            "student_id": student_id,
            "student_roll": student_roll,
            "student_name": student_name,
            "phone": parent_phone,
            "status": "sent",
            "message_id": resp.get("data", {}).get("messages", [{}])[0].get("id", "ok")
        }
    else:
        return {
            "student_id": student_id,
            "student_roll": student_roll,
            "student_name": student_name,
            "phone": parent_phone,
            "status": "failed",
            "error": resp.get("error", "Failed to deliver")
        }


def send_session_absentee_alerts(session_id: str, async_mode: bool = True) -> dict:
    """
    Step 8 — Non-Blocking WhatsApp Absentee Alert Dispatcher.
    Prepares absentee student alerts and enqueues them into the dedicated background worker.
    Returns immediately (<30ms) without blocking FastAPI event loop or holding camera threads.
    """
    if not supabase:
        return {"success": False, "error": "Database not initialized."}

    # 1. Fetch Session Info safely
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

    # Format Date & Time in localized representation
    session_date = session.get("date", datetime.now().strftime("%Y-%m-%d"))
    start_time_iso = session.get("start_time")
    time_display = ""
    if start_time_iso:
        try:
            import dateutil.parser
            dt = dateutil.parser.isoparse(start_time_iso)
            time_display = dt.strftime("%I:%M %p")
        except Exception:
            time_display = ""

    date_time_str = f"{session_date} at {time_display}" if time_display else session_date

    # 2. Fetch all registered students
    target_year = session.get("target_academic_year")
    student_query = supabase.table("students").select("id, student_roll, full_name, email, academic_year, face_encoding")
    students_res = student_query.order("student_roll").execute()
    raw_students = students_res.data or []
    all_students = [s for s in raw_students if is_cohort_matching(target_year, s.get("academic_year"))]

    if not all_students:
        return {"success": True, "message": "No students registered for this class.", "sent_count": 0, "absent_count": 0, "details": []}

    # 3. Fetch all present attendance records for this session
    att_res = supabase.table("attendance").select("student_id, status").eq("session_id", session_id).eq("status", "Present").execute()
    present_student_ids = set(r["student_id"] for r in (att_res.data or []))

    # 4. Identify Absent Students
    absent_students = [s for s in all_students if s["id"] not in present_student_ids]
    
    results = []
    queued_count = 0
    missing_phone_count = 0
    job_id = f"job_{session_id}_{int(time.time() * 1000)}"

    tasks_to_queue = []

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

        alert_text = (
            f"🏫 *Jagannath Gupta Institute of Medical Sciences & Hospital*\n"
            f"⚠️ *Student Attendance Alert Notice*\n\n"
            f"Dear Parent/Guardian,\n"
            f"This is to notify you that your ward *{student_name}* (Roll No: *{student_roll}*) was marked *ABSENT* for today's scheduled class session:\n\n"
            f"📚 *Class / Hall:* {class_name}\n"
            f"👨‍🏫 *Topic:* {topic}\n"
            f"📅 *Date & Time:* {date_time_str}\n\n"
            f"If this is an authorized medical leave or university posting, please disregard this notice or contact the faculty administration."
        )

        queued_count += 1
        results.append({
            "student_id": s["id"],
            "student_roll": student_roll,
            "student_name": student_name,
            "phone": parent_phone,
            "status": "queued",
            "message": "Queued for delivery"
        })

        tasks_to_queue.append((s, parent_phone, alert_text))

    # Initialize Job Tracker
    with _jobs_lock:
        whatsapp_jobs[job_id] = {
            "job_id": job_id,
            "session_id": session_id,
            "status": "processing" if queued_count > 0 else "completed",
            "total_enrolled": len(all_students),
            "present_count": len(present_student_ids),
            "absent_count": len(absent_students),
            "queued_count": queued_count,
            "sent_count": 0,
            "failed_count": 0,
            "missing_phone_count": missing_phone_count,
            "created_at": datetime.now().isoformat(),
            "details": [r for r in results if r["status"] == "skipped_no_phone"]
        }

    # Asynchronous Dispatch via Dedicated Queue
    if async_mode:
        for s, phone, text in tasks_to_queue:
            try:
                whatsapp_event_queue.put_nowait({
                    "fn": _send_single_alert_task,
                    "args": (s, phone, text),
                    "job_id": job_id
                })
            except queue.Full:
                print(f"[WHATSAPP QUEUE FULL] Could not queue alert for {s.get('full_name')}")

        return {
            "success": True,
            "status": "queued",
            "job_id": job_id,
            "message": f"Successfully queued {queued_count} WhatsApp alert(s) for delivery.",
            "total_enrolled": len(all_students),
            "present_count": len(present_student_ids),
            "absent_count": len(absent_students),
            "sent_count": queued_count,
            "queued_count": queued_count,
            "failed_count": 0,
            "missing_phone_count": missing_phone_count,
            "queue_size": whatsapp_event_queue.qsize(),
            "details": results
        }
    else:
        # Synchronous mode (for CLI tests)
        sent_count = 0
        failed_count = 0
        sync_details = []
        for s, phone, text in tasks_to_queue:
            res = _send_single_alert_task(s, phone, text)
            if res.get("status") == "sent":
                sent_count += 1
            else:
                failed_count += 1
            sync_details.append(res)
        return {
            "success": True,
            "status": "completed",
            "total_enrolled": len(all_students),
            "present_count": len(present_student_ids),
            "absent_count": len(absent_students),
            "sent_count": sent_count,
            "failed_count": failed_count,
            "missing_phone_count": missing_phone_count,
            "details": [r for r in results if r["status"] == "skipped_no_phone"] + sync_details
        }


def get_whatsapp_job_status(job_id: str) -> dict:
    """Returns the current processing status and details of a background WhatsApp dispatch job."""
    with _jobs_lock:
        if job_id in whatsapp_jobs:
            return {"success": True, "job": whatsapp_jobs[job_id]}
        return {"success": False, "error": f"Job '{job_id}' not found."}


def get_whatsapp_diagnostics() -> dict:
    """Diagnostic helper for queue size and worker status."""
    return {
        "queue_size": whatsapp_event_queue.qsize(),
        "max_queue_size": WHATSAPP_QUEUE_MAXSIZE,
        "timeout_seconds": WHATSAPP_TIMEOUT,
        "max_retries": WHATSAPP_MAX_RETRIES,
        "total_tracked_jobs": len(whatsapp_jobs)
    }
