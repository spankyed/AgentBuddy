#!/usr/bin/env bash
# Both halves of the external fixture pack check, in order, for running it by hand. The chain runs them as
# two steps: the contract half needs no app and runs before `build:app`, the Playwright half needs one and
# runs after (`needsApp`, scripts/lib/chain-steps.ts). Extra args are forwarded to Playwright.
#
# Both halves run as bash here rather than through their npm scripts, so this takes one outer bound — the
# `scenario` one its own npm script carries — and not the contract half's `suite` bound as well.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
bash "$HERE/test-external-pack-contract.sh"
bash "$HERE/test-external-pack-app.sh" "$@"
