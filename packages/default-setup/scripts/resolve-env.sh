#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env
if [ -f "$ROOT/.env" ]; then
  set -a; source "$ROOT/.env"; set +a
fi

# Monorepo-relative paths (default-setup is at packages/default-setup/)
MONOREPO_ROOT="$(cd "$ROOT/../.." && pwd)"
AB_API="$MONOREPO_ROOT/packages/api"
AB_DEFS_OUT="$AB_API/defs/dist/default-setup"
