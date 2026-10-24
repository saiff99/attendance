#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "    MedAttend 1-Click Database Backup Launcher    "
echo "=================================================="
echo ""

if [ -f "$DIR/backend/.venv/bin/python" ]; then
    "$DIR/backend/.venv/bin/python" "$DIR/scripts/backup_database.py"
else
    python3 "$DIR/scripts/backup_database.py"
fi

echo ""
read -p "Press [Enter] to exit..."
