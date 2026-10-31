#!/bin/bash
# ==============================================================================
# MedAttend 1-Click Database Migration Runner for macOS
# ==============================================================================
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "======================================================================"
echo "   🚀 MedAttend 1-Click Database Migration & Sync Utility"
echo "======================================================================"
echo ""

if command -v node &> /dev/null; then
    node "$DIR/scripts/migrate.mjs" "$@"
elif [ -f "$DIR/backend/.venv/bin/python" ]; then
    "$DIR/backend/.venv/bin/python" "$DIR/scripts/migrate.py" "$@"
else
    python3 "$DIR/scripts/migrate.py" "$@"
fi

echo ""
read -p "Press [Enter] to exit..."

