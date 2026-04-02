#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/resolve-env.sh"

echo "=== Step 1/3: Sync defs from AgentBuddy ==="
bash "$SCRIPT_DIR/sync-defs.sh"

echo ""
echo "=== Step 2/3: Compile all targets ==="
cd "$ROOT"
npm run compile:all

echo ""
echo "=== Step 3/3: Sync compiled output to API seed data ==="
bash "$SCRIPT_DIR/sync-seed.sh"

echo ""
echo "Pipeline complete."
