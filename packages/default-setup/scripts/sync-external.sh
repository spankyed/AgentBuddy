#!/bin/bash
# Pushes build/, defs/, src/, and docs from this monorepo package (source of truth)
# to the standalone default-setup repo. scripts/ and package.json differ between
# the two environments and must be synced by hand.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env for DEFAULT_SETUP_EXTERNAL
if [ -f "$ROOT/.env" ]; then
  set -a; source "$ROOT/.env"; set +a
fi

if [ -z "${DEFAULT_SETUP_EXTERNAL:-}" ]; then
  echo "Error: DEFAULT_SETUP_EXTERNAL not set. Add it to packages/default-setup/.env"
  exit 1
fi

EXTERNAL="$DEFAULT_SETUP_EXTERNAL"

if [ ! -d "$EXTERNAL" ]; then
  echo "Error: External repo not found at $EXTERNAL"
  exit 1
fi

echo "Syncing packages/default-setup → $EXTERNAL"

rsync -av --delete \
  "$ROOT/build/" "$EXTERNAL/build/"

rsync -av --delete \
  "$ROOT/defs/" "$EXTERNAL/defs/"

rsync -av --delete \
  "$ROOT/src/" "$EXTERNAL/src/"

# Sync root doc files
for f in CLAUDE.md abuddy.json; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$EXTERNAL/$f"
    echo "$f"
  fi
done

echo ""
echo "Synced build/, defs/, src/, and docs to $EXTERNAL"
echo "Note: scripts/ and package.json are not synced — update those by hand if needed."
