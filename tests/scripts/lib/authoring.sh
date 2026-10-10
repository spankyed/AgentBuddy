# Shared by the two halves of the packaged-authoring check: phase timing, and the environment an outside
# pack author actually has.
#
# A library rather than one script with a mode, for the reason `test-external-pack-contract.sh` gives:
# `check:tiers` reads a step's scripts as text to find out whether it can reach the app, and a branch it
# never takes still reads as a reach. So the half that needs no app is its own file, and nothing in here
# mentions the app either.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Where the author half tells the app half what it built. Repo-relative because that is the only thing the
# chain can derive an edge from (`dependsOn` reads one step's `outputs` against another's `inputs`), and
# **the work dir itself stays outside the checkout**: a pack built inside it would resolve `@abuddy/*` by
# walking up to the workspace `node_modules`, which is the one thing this check exists to prove does not
# happen. So the handoff is a path and a digest in the tree, and the tree the pack lives in is not.
HANDOFF="$ROOT/tests/authoring-handoff"

# Every phase goes through here, so this is the one place that can say where the time went. This script
# is the tail of the chain's critical path (`packages:ensure -> compile -> build:app -> this`), and it
# had no timing of its own — the step's total was the only number anyone had.
step() {
  _step_report
  _step_name="$*"; _step_at=$SECONDS
  printf '\n==> %s\n' "$*"
}
_step_report() {
  [ -n "${_step_name:-}" ] && printf '    [%3ss] %s\n' "$((SECONDS - _step_at))" "$_step_name"
  return 0
}
fail() { echo "FAIL: $*" >&2; exit 1; }

unset ABUDDY_ROOT ABUDDY_BUILD ABUDDY_APP_EXECUTABLE ABUDDY_CLI
# The CLI caches its Beta downloads under the user's home; use a fresh one.
#
# THE ONE NON-HERMETIC INPUT. Everything else this script reads is in the checkout or in $WORK: HOME is a
# fresh directory, the @abuddy packages come from tarballs it packs itself, and the app choice is written
# below rather than typed. npm's cache is deliberately not isolated, because a cold cache makes this a
# network test — several minutes of downloads, and a failure when the network is down that says nothing
# about the code. The cost of keeping it is that a corrupt or partial cache entry fails here and nowhere
# else; `npm cache verify` is the first thing to try when this script fails on an install and no other
# step does.
# Each half sets this once it knows its work dir, through `useWorkDir` below.
useWorkDir() {
  export npm_config_cache="$(npm config get cache)"
  export HOME="$1/home"
  mkdir -p "$HOME"
}

