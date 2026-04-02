#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/resolve-env.sh"

if [ ! -d "$AB_DEFS_OUT" ]; then
  echo "Error: $AB_DEFS_OUT not found."
  echo "Run 'npm run generate:defs-types' in AgentBuddy first."
  exit 1
fi

count=$(find "$AB_DEFS_OUT" -maxdepth 1 -name '*.d.ts' | wc -l | tr -d ' ')
if [ "$count" -eq 0 ]; then
  echo "No .d.ts files found in $AB_DEFS_OUT"
  exit 1
fi

cp "$AB_DEFS_OUT"/*.d.ts "$ROOT/defs/"
echo "Copied $count generated def(s) from AgentBuddy → defs/"
