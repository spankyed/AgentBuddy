#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/resolve-env.sh"

echo "=== Step 1/2: Sync defs from AgentBuddy ==="
bash "$SCRIPT_DIR/sync-defs.sh"

echo ""
echo "=== Step 2/2: Compile all targets ==="
cd "$ROOT"
npm run compile

echo ""
echo "Pipeline complete."
