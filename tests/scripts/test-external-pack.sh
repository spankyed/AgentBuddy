#!/usr/bin/env bash
# Build each external fixture pack with the abuddy CLI and run its E2E suite from the pack
# directory — the same path third-party pack authors use: external-pack uses the host's
# @abuddy/ui, bundled-ui-pack bundles its own (fe.bundleUi). Requires a built monorepo
# (npm run build). Extra args are forwarded to Playwright.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ABUDDY="$ROOT/node_modules/.bin/abuddy"
# Packs depending on a built-in pack (the fixture on default-setup) resolve it from this checkout
export ABUDDY_ROOT="$ROOT"

for PACK in "$ROOT/tests/fixtures/external-pack" "$ROOT/tests/fixtures/bundled-ui-pack"; do
  cd "$PACK"
  "$ABUDDY" validate
  "$ABUDDY" build
  "$ROOT/node_modules/.bin/tsc" --noEmit -p "$PACK"
  # Unit tests (the harness), where the pack has them
  if [ -f "$PACK/vitest.config.ts" ]; then "$ROOT/node_modules/.bin/vitest" run --root "$PACK"; fi
  "$ABUDDY" test --app-root "$ROOT" "$@"
done
