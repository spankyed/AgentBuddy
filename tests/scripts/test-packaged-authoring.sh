#!/usr/bin/env bash
# End state for outside pack authors (docs/issues/goal-external-pack-authoring.md): in a temp
# dir outside the monorepo, using only the packed @abuddy/* tarballs,
#   1. install @abuddy/cli + @abuddy/sdk from tarballs
#   2. abuddy init → add feature → a flow using keepAlive from default-setup
#   3. abuddy build → abuddy release --local --dry-run produces a verified bundle
#   4. install that bundle into an isolated test data dir
#   5. abuddy test passes against the configured app (this checkout, chosen at the first-run prompt)
# No ABUDDY_ROOT, no symlinks, no PATH edits. Requires a built checkout (npm run build).
# KEEP_WORK=1 keeps the temp dir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/abuddy-authoring-XXXXXX")"
if [ -z "${KEEP_WORK:-}" ]; then trap 'rm -rf "$WORK"' EXIT; else echo "Work dir: $WORK"; fi

step() { printf '\n==> %s\n' "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

unset ABUDDY_ROOT ABUDDY_APP_EXECUTABLE ABUDDY_CLI PACK_DIR
# The CLI keeps its saved app choice and downloads under the user's home; use a fresh one.
# Keep npm's cache so installs don't re-download everything.
export npm_config_cache="$(npm config get cache)"
export HOME="$WORK/home"
mkdir -p "$HOME"

step "Pack @abuddy/sdk, @abuddy/cli and @abuddy/testing"
(cd "$ROOT" && npm run packages:build >/dev/null)
for pkg in sdk cli testing; do
  (cd "$ROOT/packages/abuddy-$pkg/dist/package" && npm pack --silent --pack-destination "$WORK" >/dev/null)
done
SDK_TGZ="$(ls "$WORK"/abuddy-sdk-*.tgz)"
CLI_TGZ="$(ls "$WORK"/abuddy-cli-*.tgz)"
TESTING_TGZ="$(ls "$WORK"/abuddy-testing-*.tgz)"

step "1. Install @abuddy/cli + @abuddy/sdk from the tarballs"
mkdir "$WORK/tools"
(cd "$WORK/tools" && npm init -y >/dev/null && npm install --silent "$SDK_TGZ" "$CLI_TGZ")
ABUDDY="$WORK/tools/node_modules/.bin/abuddy"
"$ABUDDY" --version

step "2. abuddy init → add feature"
cd "$WORK"
"$ABUDDY" init demo-pack >/dev/null
PACK="$WORK/demo-pack"
cd "$PACK"
# The tarballs stand in for the npm registry
npm pkg set "dependencies.@abuddy/sdk=file:$SDK_TGZ" "devDependencies.@abuddy/cli=file:$CLI_TGZ"
npm install --silent
# From here on, `abuddy` is the pack's own pinned CLI
ABUDDY="$PACK/node_modules/.bin/abuddy"
"$ABUDDY" add feature notes --label Notes >/dev/null
"$ABUDDY" init-tests
npm pkg set "devDependencies.@abuddy/testing=file:$TESTING_TGZ"
npm install --silent

step "Configure the app at the first-run prompt (a local checkout)"
# expect gives the CLI a terminal and answers its questions, as an author at the keyboard would
env -u CI ABUDDY="$ABUDDY" ROOT="$ROOT" expect >"$WORK/first-run.log" 2>&1 <<'EXPECT' \
  || { cat "$WORK/first-run.log"; fail "first run of abuddy test"; }
set timeout 120
spawn $env(ABUDDY) test --list
expect "Choose 1 or 2: " { send "1\r" } timeout { exit 1 }
expect "Path to the AgentBuddy checkout: " { send "$env(ROOT)\r" } timeout { exit 1 }
expect eof
lassign [wait] pid spawnid os_error status
exit $status
EXPECT
grep -q "Which AgentBuddy app" "$WORK/first-run.log" || { cat "$WORK/first-run.log"; fail "abuddy test did not ask which app to use"; }
grep -q "\"source\": \"$ROOT\"" "$HOME"/Library/Preferences/abuddy-cli/config.json || fail "the app choice was not saved"

step "2. A flow using keepAlive from default-setup"
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("abuddy.json", "utf8"));
  m.dependencies = { "default-setup": "*" };
  fs.writeFileSync("abuddy.json", JSON.stringify(m, null, 2) + "\n");
'
cat > src/seeds/flows/notes-heartbeat.ts <<'EOF'
import { entry, keepAlive } from '#generated/flow-helpers';

export default {
  "Notes Heartbeat": [
    entry([keepAlive()]),
  ],
};
EOF

step "3. abuddy build"
"$ABUDDY" build | tee "$WORK/build.log"
grep -q "flows: 1" "$WORK/build.log" || fail "the keepAlive flow was not compiled"
node_modules/.bin/tsc --noEmit

step "3. abuddy release --local --dry-run"
git init --quiet -b main
git add -A
git -c user.name=author -c user.email=author@example.com commit --quiet -m "initial pack"
git remote add origin https://github.com/example/demo-pack.git
"$ABUDDY" release patch --local --dry-run --skip-e2e | tee "$WORK/release.log"
BUNDLE="$(sed -n 's/^Bundle: //p' "$WORK/release.log")"
[ -f "$BUNDLE" ] && [ -f "$BUNDLE.sha256" ] || fail "release did not produce a bundle and checksum"
(cd "$(dirname "$BUNDLE")" && shasum -a 256 -c "$(basename "$BUNDLE").sha256")
[ -z "$(git status --porcelain)" ] || fail "a dry run changed the pack's files"

step "4. Install the bundle into an isolated test data dir"
DATA="$WORK/test-data"
ABUDDY_USER_DATA_DIR="$DATA" "$ABUDDY" install "$BUNDLE"
INSTALLED="$(find "$DATA" -path '*/demo-pack/bundle.json' | head -n 1)"
[ -n "$INSTALLED" ] || fail "the bundle was not installed"
node -e '
  const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (b.id !== "demo-pack" || b.version !== "0.1.1") throw new Error(`unexpected bundle ${b.id}@${b.version}`);
' "$INSTALLED"
[ -f "$(dirname "$INSTALLED")/runtime/index.cjs" ] || fail "installed bundle has no runtime"

step "5. abuddy test (the saved app)"
"$ABUDDY" test

step "No symlinks into the monorepo"
if find "$PACK/node_modules" "$WORK/tools/node_modules" -maxdepth 2 -type l -lname "$ROOT*" | grep -q .; then
  fail "node_modules links into the monorepo"
fi

echo
echo "External pack authoring end state: OK"
