#!/usr/bin/env bash
# Build each external fixture pack with the abuddy CLI and run its E2E suite from the pack
# directory — the same path third-party pack authors use: external-pack uses the host's
# @abuddy/ui, bundled-ui-pack bundles its own (fe.bundleUi). Requires a built monorepo
# (npm run build). Extra args are forwarded to Playwright.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ABUDDY="$ROOT/node_modules/.bin/abuddy"

for PACK in "$ROOT/tests/fixtures/external-pack" "$ROOT/tests/fixtures/bundled-ui-pack"; do
  cd "$PACK"
  "$ABUDDY" validate
  "$ABUDDY" build
  "$ROOT/node_modules/.bin/tsc" --noEmit -p "$PACK"
  "$ABUDDY" test --app-root "$ROOT" "$@"
done
