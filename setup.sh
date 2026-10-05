#!/bin/bash
# ==============================================================================
#  MedAttend 1-Click Initial Setup for New MacBooks
# ==============================================================================
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "======================================================================"
echo "   🚀 MedAttend — 1-Click Setup for Mac"
echo "======================================================================"

# 1. Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python from https://www.python.org/ or via Homebrew."
    exit 1
fi
echo "✓ Python 3 found: $(python3 --version)"

# 2. Check Node.js
if ! command -v npm &> /dev/null; then
    echo "❌ Node.js / npm is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js found: $(node --version)"

# 3. Setup Python Virtual Environment
echo ""
echo "[1/2] Setting up Python AI Backend Environment..."
cd "$DIR/backend"
if [ ! -d ".venv" ] || [ ! -f ".venv/bin/python" ]; then
    python3 -m venv .venv
fi
./.venv/bin/pip install --upgrade pip > /dev/null 2>&1 || true
./.venv/bin/pip install -r requirements.txt
echo "✓ Python AI dependencies installed successfully."

# 4. Setup Frontend Dependencies
echo ""
echo "[2/2] Installing Frontend Dependencies..."
cd "$DIR/frontend"
npm install
echo "✓ Frontend dependencies installed successfully."

# Make scripts executable
chmod +x "$DIR/start.sh" "$DIR/setup.sh" "$DIR/Start_Attendance.command" "$DIR/Stop_Attendance.command" 2>/dev/null || true

echo ""
echo "======================================================================"
echo "  🎉 Setup Complete! You can now start the app anytime with:"
echo "     ./start.sh"
echo "======================================================================"
