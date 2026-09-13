#!/usr/bin/env bash
# Build the external-pack fixture with the abuddy CLI and run its E2E suite from the
# pack directory — the same path third-party pack authors use. Requires a built
# monorepo (npm run build). Extra args are forwarded to Playwright.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PACK="$ROOT/tests/fixtures/external-pack"
ABUDDY="$ROOT/node_modules/.bin/abuddy"

cd "$PACK"
"$ABUDDY" validate
"$ABUDDY" build
"$ROOT/node_modules/.bin/tsc" --noEmit -p "$PACK"
"$ABUDDY" test --app-root "$ROOT" "$@"
