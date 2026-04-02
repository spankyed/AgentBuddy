#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/resolve-env.sh"

if [ ! -d "$ROOT/dist" ]; then
  echo "Error: dist/ not found. Run 'npm run compile:all' first."
  exit 1
fi

count=$(find "$ROOT/dist" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')
if [ "$count" -eq 0 ]; then
  echo "Error: No .json files in dist/. Run 'npm run compile:all' first."
  exit 1
fi

SEED_DATA="$AB_API/src/setup/seed/data"
mkdir -p "$SEED_DATA"
cp -r "$ROOT/dist/"* "$SEED_DATA/"
echo "Synced compiled output ($count JSON file(s)) → $SEED_DATA/"
