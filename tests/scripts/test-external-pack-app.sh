#!/usr/bin/env bash
# The half of the external-pack check that needs the built app: each fixture pack's Playwright suite, run
# from the pack directory against this checkout. Extra args are forwarded to Playwright.
#
# It does not build the packs. test-external-pack-contract.sh does, and rebuilding here would cost ~6s a
# fixture to buy nothing — while a pack that is not built is worth saying out loud rather than quietly fixing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ABUDDY="$ROOT/node_modules/.bin/abuddy"
export ABUDDY_ROOT="$ROOT"
source "$ROOT/tests/scripts/lib/fixture-packs.sh"

for PACK in "${FIXTURE_PACKS[@]}"; do
  cd "$PACK"
  if [ ! -d "$PACK/dist" ]; then
    echo "$PACK is not built. Run npm run test:external-pack:contract first." >&2
    exit 1
  fi
  "$ABUDDY" test --app-root "$ROOT" "$@"
done
