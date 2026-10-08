#!/usr/bin/env bash
# The half of the external-pack check that needs the built app: each fixture pack's Playwright suite, run
# from the pack directory against this checkout. Extra args are forwarded to Playwright.
#
# It does not build the packs, and `--prebuilt` is what makes that true of the fixture as well as of this
# script. test-external-pack-contract.sh builds them, and the chain orders it first (its FIXTURE_OUTPUTS are
# this step's inputs). Rebuilding here would cost ~6s a fixture to buy nothing — and worse than nothing:
# `abuddy build` clears `dist` before its first phase, so a rebuild in this step makes each fixture look
# unbuilt for the length of it, to this step's own installer and to any concurrent reader of `tests/packs`.
# A pack that is not built, or built before its sources, is still said out loud rather than quietly fixed:
# the fixture refuses a stale build under --prebuilt, and the installer names a missing one.
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
  "$ABUDDY" test --app-root "$ROOT" --prebuilt "$@"
done
