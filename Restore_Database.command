#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "    MedAttend Database Disaster Recovery Restore  "
echo "=================================================="
echo ""

if [ -f "$DIR/backend/.venv/bin/python" ]; then
    "$DIR/backend/.venv/bin/python" "$DIR/scripts/restore_database.py" "$@"
else
    python3 "$DIR/scripts/restore_database.py" "$@"
fi

echo ""
read -p "Press [Enter] to exit..."
