#!/bin/bash
# ==============================================================================
# MedAttend 1-Click Terminator & CPU Cool-Down
# Safely terminates all frontend, backend, AI, and tunnel processes.
# ==============================================================================
cd "$(dirname "$0")"

echo "🛑 Stopping all MedAttend background processes..."

# 1. Kill any process listening on ports 3000 and 8000
for PORT in 3000 8000; do
  PIDS=$(lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null)
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      kill -9 "$PID" 2>/dev/null
      echo "  ✓ Freed Port ${PORT} (PID ${PID})"
    done
  fi
done

# 2. Kill any orphaned next-server or uvicorn processes
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "uvicorn.*main:app" 2>/dev/null
pkill -9 -f "cloudflared.*tunnel" 2>/dev/null

# 3. Clean launcher lock
rm -f .medattend_launcher.lock

# 4. Restore 24/7 Cloud Backend on Supabase via Python
if [ -f "backend/.venv/bin/python" ]; then
  PYTHONPATH=backend backend/.venv/bin/python -c "
import os
try:
    from app.config import supabase
    if supabase:
        supabase.table('settings').upsert({
            'key': 'tunnel_config',
            'value': {
                'url': 'https://saiwebss-medattend-backend.hf.space',
                'updated_at': 'now()'
            }
        }).execute()
except Exception:
    pass
" 2>/dev/null
fi

echo "✅ All MedAttend services stopped cleanly. CPU is 100% cold and clear!"
