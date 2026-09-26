#!/bin/bash

echo "=================================================="
echo "    Stopping Smart CCTV AI Attendance System...   "
echo "=================================================="

# 1. Stop Frontend (Port 3000)
FRONTEND_PID=$(lsof -ti :3000)
if [ -n "$FRONTEND_PID" ]; then
    echo "Stopping Frontend (PID: $FRONTEND_PID)..."
    kill -9 $FRONTEND_PID > /dev/null 2>&1
    echo "Frontend stopped."
else
    echo "Frontend is not running."
fi

# 2. Stop Backend (Port 8000)
BACKEND_PID=$(lsof -ti :8000)
if [ -n "$BACKEND_PID" ]; then
    echo "Stopping Backend (PID: $BACKEND_PID)..."
    kill -9 $BACKEND_PID > /dev/null 2>&1
    echo "Backend stopped."
else
    echo "Backend is not running."
fi

echo ""
echo "All Attendance System processes have been stopped successfully!"
