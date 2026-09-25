#!/usr/bin/env bash
# Both halves of the external fixture pack check, in order, for running it by hand. The chain runs them
# separately: the contract half is tier 2 and needs no app, the Playwright half is tier 3 and does
# (docs/goals/goal-test-tiers.md). Extra args are forwarded to Playwright.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
bash "$HERE/test-external-pack-contract.sh"
bash "$HERE/test-external-pack-app.sh" "$@"
