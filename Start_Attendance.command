#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=================================================="
echo "    Starting Smart CCTV AI Attendance System...    "
echo "=================================================="

# 1. Start Backend
if ! lsof -i :8000 > /dev/null 2>&1; then
    echo "[1/3] Launching Python AI Engine on port 8000..."
    cd "$DIR/backend"
    "$DIR/backend/.venv/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 > /dev/null 2>&1 &
else
    echo "[1/3] Backend is already running."
fi

# 2. Start Frontend
if ! lsof -i :3000 > /dev/null 2>&1; then
    echo "[2/3] Launching Next.js Web UI on port 3000..."
    cd "$DIR/frontend"
    npm run dev > /dev/null 2>&1 &
else
    echo "[2/3] Frontend is already running."
fi

echo "[3/3] Opening UI..."
sleep 2

if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="http://localhost:3000/live-scan"
else
    open "http://localhost:3000/live-scan"
fi

echo "Application launched successfully!"
