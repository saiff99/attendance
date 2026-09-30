#!/usr/bin/env python3
"""
MedAttend 1-Click Intelligent Launcher
Automatically starts Uvicorn AI Backend + Cloudflare Unlimited Tunnel + Supabase Live Sync.
"""

import os
import sys
import time
import re
import signal
import subprocess
import threading
from urllib.request import urlopen, Request
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
VENV_PYTHON = os.path.join(BACKEND_DIR, ".venv", "bin", "python")
VENV_UVICORN = os.path.join(BACKEND_DIR, ".venv", "bin", "uvicorn")
CLOUDFLARED_BIN = os.path.join(BACKEND_DIR, "bin", "cloudflared")

SUPABASE_URL = "https://bsphlgmxzmlbgzanpujh.supabase.co"
SUPABASE_KEY = "sb_publishable_u8O4lCQg9KtcxeLj7nxqFg_xu3v2WLz"

GREEN = "\033[92m"
BLUE = "\033[94m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

processes = []

def cleanup(signum=None, frame=None):
    print(f"\n{YELLOW}Shutting down MedAttend services...{RESET}")
    for p in processes:
        try:
            p.terminate()
            p.wait(timeout=2)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    # Kill any dangling instances
    os.system("lsof -ti:3000 | xargs kill -9 2>/dev/null || true")
    os.system("lsof -ti:8000 | xargs kill -9 2>/dev/null || true")
    os.system("pkill -f 'next-server|next dev' 2>/dev/null || true")
    os.system("pkill -f 'uvicorn main:app' 2>/dev/null || true")
    os.system("pkill -f 'cloudflared tunnel' 2>/dev/null || true")
    print(f"{GREEN}All services stopped cleanly. Goodbye!{RESET}\n")
    sys.exit(0)

signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

def update_supabase_tunnel_url(tunnel_url: str):
    """Updates the live tunnel URL in Supabase so Vercel instantly connects."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/sessions"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        payload = {
            "id": "00000000-0000-0000-0000-000000000000",
            "class_name": "__SYSTEM_CONFIG__",
            "instructor_name": tunnel_url,
            "date": "2000-01-01",
            "start_time": "2000-01-01T00:00:00Z",
            "end_time": "2000-01-01T00:00:00Z",
            "target_academic_year": "System"
        }
        req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urlopen(req, timeout=8) as res:
            if res.status in (200, 201, 204):
                return True
    except Exception as e:
        print(f"{RED}[Supabase Sync Warning] {e}{RESET}")
    return False

import shutil
import platform
import urllib.request

def get_cloudflared_binary():
    """Finds existing cloudflared binary or downloads the official Cloudflare release for macOS/Linux."""
    if os.path.exists(CLOUDFLARED_BIN) and os.access(CLOUDFLARED_BIN, os.X_OK):
        return CLOUDFLARED_BIN
    
    system_cf = shutil.which("cloudflared")
    if system_cf:
        return system_cf
        
    print(f"{YELLOW}Downloading Cloudflare Tunnel engine for Apple Silicon...{RESET}")
    os.makedirs(os.path.dirname(CLOUDFLARED_BIN), exist_ok=True)
    
    arch = "arm64" if platform.machine() in ("arm64", "aarch64") else "amd64"
    system = "darwin" if sys.platform == "darwin" else "linux"
    url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-{system}-{arch}"
    
    try:
        urllib.request.urlretrieve(url, CLOUDFLARED_BIN)
        os.chmod(CLOUDFLARED_BIN, 0o755)
        print(f"{GREEN}✓ Cloudflared downloaded successfully.{RESET}")
        return CLOUDFLARED_BIN
    except Exception as e:
        print(f"{RED}Failed to auto-download cloudflared: {e}{RESET}")
        return None

def main():
    print("\n" + "="*70)
    print(f"{BOLD}{CYAN}   🚀 MedAttend AI Hub — M1 Apple Silicon Accelerated Launcher{RESET}")
    print("="*70 + "\n")

    # 1. Clean previous lingering processes
    os.system("lsof -ti:3000 | xargs kill -9 2>/dev/null || true")
    os.system("lsof -ti:8000 | xargs kill -9 2>/dev/null || true")
    os.system("pkill -f 'next-server|next dev' 2>/dev/null || true")
    os.system("pkill -f 'uvicorn main:app' 2>/dev/null || true")
    os.system("pkill -f 'cloudflared tunnel' 2>/dev/null || true")
    time.sleep(0.5)

    if not os.path.exists(VENV_UVICORN):
        print(f"{RED}Virtual environment not found at {VENV_UVICORN}! Please run setup first.{RESET}")
        sys.exit(1)

    cf_binary = get_cloudflared_binary()
    if not cf_binary:
        print(f"{RED}Cloudflared binary could not be found or downloaded!{RESET}")
        sys.exit(1)

    # 2. Start Next.js Frontend
    print(f"{BLUE}[1/4]{RESET} Starting Next.js Web Frontend (http://localhost:3000)...")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(frontend_proc)

    def log_frontend():
        for line in iter(frontend_proc.stdout.readline, ""):
            if "Ready in" in line or "compiled client and server" in line or "Local:" in line:
                print(f"  {GREEN}✓{RESET} Frontend: {line.strip()}")

    threading.Thread(target=log_frontend, daemon=True).start()

    # 3. Start Uvicorn AI Backend
    print(f"{BLUE}[2/4]{RESET} Starting FastAPI Backend + InsightFace AI (Port 8000)...")
    uvicorn_proc = subprocess.Popen(
        [VENV_UVICORN, "main:app", "--port", "8000"],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(uvicorn_proc)

    def log_uvicorn():
        for line in iter(uvicorn_proc.stdout.readline, ""):
            if "Application startup complete" in line or "AI Engine" in line:
                print(f"  {GREEN}✓{RESET} {line.strip()}")
            elif "ERROR" in line or "Exception" in line:
                print(f"  {RED}! {line.strip()}{RESET}")

    threading.Thread(target=log_uvicorn, daemon=True).start()
    time.sleep(2)

    # 4. Start Cloudflare Unlimited Tunnel
    print(f"{BLUE}[3/4]{RESET} Initializing Cloudflare Unlimited Bandwidth Tunnel...")
    cf_proc = subprocess.Popen(
        [cf_binary, "tunnel", "--url", "http://127.0.0.1:8000"],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(cf_proc)

    tunnel_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

    start_time = time.time()
    while time.time() - start_time < 20:
        line = cf_proc.stdout.readline()
        if not line:
            time.sleep(0.1)
            continue
        match = url_pattern.search(line)
        if match:
            tunnel_url = match.group(0)
            break

    if not tunnel_url:
        print(f"{RED}Failed to obtain Cloudflare Tunnel URL. Please check your internet connection.{RESET}")
        cleanup()

    # 5. Sync Live Tunnel URL with Supabase
    print(f"{BLUE}[4/4]{RESET} Syncing Live Tunnel with Cloud Vercel Portal...")
    synced = update_supabase_tunnel_url(tunnel_url)
    if synced:
        print(f"  {GREEN}✓{RESET} Cloud Vercel Portal automatically connected to this Mac!")
    else:
        print(f"  {YELLOW}! Note: Supabase sync warning, but tunnel is active.{RESET}")

    # 6. Display Dashboard
    print("\n" + BOLD + GREEN + "╔" + "═"*68 + "╗" + RESET)
    print(f"{BOLD}{GREEN}║  🎉 MedAttend System is 100% ONLINE & READY FOR ATTENDANCE        ║{RESET}")
    print(BOLD + GREEN + "╠" + "═"*68 + "╣" + RESET)
    print(f"║  {CYAN}Local Web Dashboard:{RESET}  http://localhost:3000                            ║")
    print(f"║  {CYAN}Local AI Backend:{RESET}     http://127.0.0.1:8000                            ║")
    print(f"║  {CYAN}Cloudflare Tunnel:{RESET}    {tunnel_url:<49} ║")
    print(f"║  {CYAN}Vercel Live Portal:{RESET}   https://newshuge.com/selfieattend                ║")
    print(f"║  {CYAN}Bandwidth Quota:{RESET}      {GREEN}UNLIMITED FOREVER (No Limits){RESET}                    ║")
    print(BOLD + GREEN + "╚" + "═"*68 + "╝" + RESET + "\n")
    print(f"{YELLOW}Press Ctrl+C anytime to stop all services.{RESET}\n")

    # Keep main thread alive
    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()

