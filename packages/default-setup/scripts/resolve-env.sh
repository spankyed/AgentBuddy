#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Sibling package paths
AB_API="$(cd "$ROOT/../api" && pwd)"
AB_DEFS_OUT="$AB_API/defs/dist/default-setup"
