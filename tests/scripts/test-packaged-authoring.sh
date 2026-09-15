#!/usr/bin/env bash
# End state for outside pack authors (docs/issues/goal-external-pack-authoring.md): in a temp
# dir outside the monorepo, using only the packed @abuddy/* tarballs,
#   1. install @abuddy/cli + @abuddy/sdk from tarballs (a backend-only pack installs no editor libraries)
#   2. abuddy init → add feature → a flow using keepAlive from default-setup → seeds from a format
#      with a .ts compiler module, and default-setup's notes format → an llm flow and a service
#      calling services.inference
#   3. abuddy build
#   4. unit tests on the harness: seeds with default-setup's hooks, the feature's system, the service
#      and the llm flow on default-setup's brain, with inference mocked by mockInference
#   5. @abuddy/testing's published declarations type-check on their own (skipLibCheck off)
#   6. abuddy release --local --dry-run produces a verified bundle
#   7. install that bundle into an isolated test data dir
#   8. abuddy test passes against the configured app (this checkout, chosen at the first-run prompt)
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

step "Pack @abuddy/sdk, @abuddy/ui, @abuddy/cli and @abuddy/testing"
(cd "$ROOT" && npm run packages:build >/dev/null)
for dir in abuddy-sdk abuddy-ui abuddy-cli/dist/package abuddy-testing/dist/package; do
  (cd "$ROOT/packages/$dir" && npm pack --silent --pack-destination "$WORK" >/dev/null)
done
SDK_TGZ="$(ls "$WORK"/abuddy-sdk-*.tgz)"
UI_TGZ="$(ls "$WORK"/abuddy-ui-*.tgz)"
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
npm pkg set "dependencies.@abuddy/sdk=file:$SDK_TGZ" "devDependencies.@abuddy/cli=file:$CLI_TGZ" "devDependencies.@abuddy/testing=file:$TESTING_TGZ"
npm install --silent
# @abuddy/sdk carries the platform API only; the component library and its editors come with @abuddy/ui
for lib in @tiptap highlight.js lowlight @guolao/vue-monaco-editor; do
  [ ! -e "node_modules/$lib" ] || fail "a backend-only pack installed $lib"
done
# From here on, `abuddy` is the pack's own pinned CLI
ABUDDY="$PACK/node_modules/.bin/abuddy"
"$ABUDDY" add feature notes --label Notes >/dev/null
# @abuddy/ui's heavier components must build in a pack, not only in the monorepo
npm pkg set "dependencies.@abuddy/ui=file:$UI_TGZ"
npm install --silent
cat > src/features/notes/fe/editors.ts <<'TS'
import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor';

export const editors = { TiptapEditor, SimpleMonacoEditor };
TS
node -e '
  const fs = require("fs");
  const file = "src/features/notes/fe/plugin.ts";
  fs.writeFileSync(file, "import { editors } from \"./editors\";\nconsole.debug(Object.keys(editors));\n" + fs.readFileSync(file, "utf8"));
'
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

step "2. Seeds from abuddy.json: a format with a .ts compiler module, and default-setup's notes format"
mkdir -p src/seeds/glossary src/seeds/notes
printf -- '---\nterm: Pack\n---\nA bundle of features.\n' > src/seeds/glossary/pack.md
mkdir -p src/seeds/compilers
cat > src/seeds/compilers/glossary.ts <<'TS'
import { compileMarkdownTree, type SeedCompileContext, type SeedRecord } from '@abuddy/sdk/build';

export default function compileGlossary({ path }: SeedCompileContext): SeedRecord[] {
  return compileMarkdownTree(path).map((item) => ({ entity: 'DemoPack', term: String(item.frontmatter.term), definition: item.body.trim() }));
}
TS
printf -- '---\ntitle: Demo notes\n---\nSeeded by demo-pack.\n' > src/seeds/notes/demo.md
# demo-notes uses default-setup's notes format, compiled from this pack's markdown through the built dependency
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("abuddy.json", "utf8"));
  m.seedFormats = { ...m.seedFormats, glossary: { compiler: "src/seeds/compilers/glossary.ts", entity: "DemoPack", identity: ["term"] } };
  m.boot.seed.glossary = { path: "src/seeds/glossary", format: "glossary" };
  m.boot.seed["demo-notes"] = { path: "src/seeds/notes", format: "default-setup:notes" };
  fs.writeFileSync("abuddy.json", JSON.stringify(m, null, 2) + "\n");
'

step "2. An llm flow on default-setup's brain, and a service calling services.inference"
"$ABUDDY" add prompt summarize-note >/dev/null
cat > src/seeds/prompts/summarize-note.ts <<'TS'
import type { PromptMeta } from '@abuddy/sdk/build';

export const meta: PromptMeta = {
  label: 'Summarize Note',
  description: 'Summarizes a note in one line.',
  category: 'notes',
  inputs: { text: { name: 'text', type: 'string', description: 'The note', required: true } },
};

export function template(params: Record<string, any>) {
  return `Summarize this note: ${params.text}`;
}
TS
cat > src/seeds/flows/notes-summary.ts <<'TS'
import { entry, keepAlive, on, llm } from '#generated/flow-helpers';

export default {
  "Notes Summary": [
    entry([keepAlive()]),
    on('notes.summarize', [[
      llm('Summarize Note', { label: 'summarize', model: 'openai:gpt-4o-mini', map: { text: '$.event.data.payload.text' } }),
    ]]),
  ],
};
TS
"$ABUDDY" add service digest --feature notes >/dev/null
cat > src/features/notes/be/services/digest.ts <<'TS'
import { Output } from 'ai';
import { z } from 'zod';
import { services } from '#generated/services';

const Digest = z.object({ summary: z.string(), tags: z.array(z.string()) });

export const digestService = {
  async digest(text: string): Promise<z.infer<typeof Digest>> {
    const { output } = await services.inference.generateText({
      model: 'openai:gpt-5-mini',
      prompt: `Digest: ${text}`,
      output: Output.object({ schema: Digest }),
    });
    return output;
  },
};
TS
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("abuddy.json", "utf8"));
  m.boot.seed = { prompts: "src/seeds/prompts", ...m.boot.seed };
  fs.writeFileSync("abuddy.json", JSON.stringify(m, null, 2) + "\n");
'
# The digest service imports the AI SDK's pure pieces (Output); mockInference runs the AI SDK in tests
npm install --silent --save ai@^7.0.100

step "3. abuddy build"
"$ABUDDY" build | tee "$WORK/build.log"
node -e '
  const fs = require("fs");
  const read = (key) => JSON.parse(fs.readFileSync(`dist/runtime/seeds/${key}.seed.json`, "utf8")).records;
  const [term] = read("glossary");
  if (term?.entity !== "DemoPack" || term.term !== "Pack" || term.definition !== "A bundle of features.") throw new Error("glossary: " + JSON.stringify(term));
  const [note] = read("demo-notes");
  // A record carries only what its source sets: defaults are applied when the row is created, so they are not tracked as seeded
  if (note?.entity !== "Note" || note.title !== "Demo notes" || "noteType" in note || "favorite" in note || !note.sourceHash) throw new Error("demo-notes: " + JSON.stringify(note));
' || fail "the compiler module and markdown seeds were not compiled"

step "4. Unit tests through the harness, with default-setup's runtime"
cat > tests/unit/demo-notes.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { seedPack } from '@abuddy/testing/harness';
import { findAll } from '#generated/ears';

describe('demo notes', () => {
  it("seeds notes with default-setup's format and hooks", async () => {
    expect(await seedPack({ keys: ['demo-notes'] })).toEqual({ 'demo-notes': { created: 1, updated: 0, skipped: 0 } });
    const [note] = findAll('Note');
    expect(note).toMatchObject({ title: 'Demo notes', noteType: 'document', lastSeen: 0 });
    expect(note.shortCode).toMatch(/^NOTE-\d+$/);
  });
});
TS
cat > tests/unit/digest-service.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { mockInference } from '@abuddy/testing/harness';
import { services } from '#generated/services';

describe('digest service', () => {
  it('digests a note from the structured output inference returns', async () => {
    const inference = mockInference(JSON.stringify({ summary: 'Buy milk', tags: ['errand'] }));
    expect(await services.digest.digest('Remember to buy milk')).toEqual({ summary: 'Buy milk', tags: ['errand'] });
    expect(inference.calls).toEqual([expect.objectContaining({ model: 'openai:gpt-5-mini', messages: [{ role: 'user', text: 'Digest: Remember to buy milk' }] })]);
  });
});
TS
cat > tests/unit/notes-summary.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { importFlows, mockInference, seedPack, startApp } from '@abuddy/testing/harness';
import { entry, keepAlive, subflow } from '#generated/flow-helpers';

describe('notes summary flow', () => {
  it("runs on default-setup's brain and llm step with inference mocked", async () => {
    await seedPack({ keys: ['prompts', 'flows'] });
    const inference = mockInference('Buy milk');
    // A root flow hosting the pack's flow, as the app's root flow hosts long-running flows
    importFlows({ 'Root Flow': { root: true, tracks: [entry([subflow('Notes Summary')], [keepAlive()])] } });
    const app = await startApp({ systems: ['brain', 'settings'] });

    const run = await app.runFlow('Notes Summary', { event: 'notes.summarize', data: { text: 'Remember to buy milk' } });

    expect(run.steps).toEqual([expect.objectContaining({ label: 'summarize', status: 'completed' })]);
    expect(run.steps[0].nodeAttributes.result).toMatchObject({ text: 'Buy milk' });
    expect(inference.calls).toEqual([expect.objectContaining({ model: 'openai:gpt-4o-mini', messages: [{ role: 'user', text: 'Summarize this note: Remember to buy milk' }] })]);
  });
});
TS
node_modules/.bin/vitest run 2>&1 | tee "$WORK/unit.log"
# The scaffold's seed test (2), the feature's system test, default-setup notes, the service and the flow
grep -qE "Tests +6 passed" "$WORK/unit.log" || fail "unit tests through the harness failed"
# The build prints a seed-file count even with no flows; check the compiled flow itself
node -e '
  const flows = JSON.parse(require("fs").readFileSync("dist/runtime/seeds/flows.seed.json", "utf8"));
  const flow = flows["Notes Heartbeat"];
  if (!flow || !JSON.stringify(flow).includes("keep_alive")) throw new Error("the keepAlive flow was not compiled: " + JSON.stringify(flows));
' || fail "the keepAlive flow was not compiled"
node_modules/.bin/tsc --noEmit

step "5. @abuddy/testing's published types stand alone"
# Its declarations may import only what a pack installs: an unpublished import (@abuddy/host) fails with lib checking
# on, and is silently `any` under the scaffold's skipLibCheck. Errors in other packages' declarations aren't this check's.
cat > tests/types-probe.ts <<'TS'
import type { OutgoingSystemEvents, TestApp, FlowRun } from '@abuddy/testing/harness';
import type { IsolatedDataDir } from '@abuddy/testing/vitest';
import type { AppHelper } from '@abuddy/testing';

type IsAny<T> = 0 extends 1 & T ? true : false;
export const typed: [IsAny<OutgoingSystemEvents>, IsAny<Awaited<ReturnType<TestApp['nextEmit']>>>, IsAny<FlowRun>, IsAny<IsolatedDataDir>, IsAny<AppHelper>] = [false, false, false, false, false];
TS
TYPES_STATUS=0
node_modules/.bin/tsc --noEmit --skipLibCheck false --listFiles --pretty false -p . > "$WORK/types-probe.log" 2>&1 || TYPES_STATUS=$?
rm tests/types-probe.ts
# The diagnostics, without the files tsc lists
grep -v "^/" "$WORK/types-probe.log" || true
# tsc checked the probe: a config error (no inputs, a bad option) or a crash lists no files. tsc lists real paths.
grep -qxF "$(pwd -P)/tests/types-probe.ts" "$WORK/types-probe.log" || fail "tsc didn't type-check the types probe"
# Every error is in other packages' declarations (installed, or dependencies' in .abuddy/deps); errors without a
# file (config) or anywhere else fail
if grep "error TS" "$WORK/types-probe.log" | grep -vE "^(node_modules|\.abuddy/deps)/" | grep .; then
  fail "the types probe didn't type-check"
fi
if grep -E "^node_modules/@abuddy/testing/" "$WORK/types-probe.log"; then
  fail "@abuddy/testing's published declarations don't type-check on their own"
fi
# A non-zero exit with no error in other packages' declarations is tsc failing some other way
if [ "$TYPES_STATUS" -ne 0 ] && ! grep -qE "^(node_modules|\.abuddy/deps)/[^(]+\([0-9]+,[0-9]+\): error TS" "$WORK/types-probe.log"; then
  fail "tsc exited $TYPES_STATUS without type errors while checking the types probe"
fi

step "6. abuddy release --local --dry-run"
git init --quiet -b main
git add -A
git -c user.name=author -c user.email=author@example.com commit --quiet -m "initial pack"
git remote add origin https://github.com/example/demo-pack.git
"$ABUDDY" release patch --local --dry-run --skip-e2e | tee "$WORK/release.log"
BUNDLE="$(sed -n 's/^Bundle: //p' "$WORK/release.log")"
[ -f "$BUNDLE" ] && [ -f "$BUNDLE.sha256" ] || fail "release did not produce a bundle and checksum"
(cd "$(dirname "$BUNDLE")" && shasum -a 256 -c "$(basename "$BUNDLE").sha256")
[ -z "$(git status --porcelain)" ] || fail "a dry run changed the pack's files"

step "7. Install the bundle into an isolated test data dir"
DATA="$WORK/test-data"
ABUDDY_USER_DATA_DIR="$DATA" "$ABUDDY" install "$BUNDLE"
INSTALLED="$(find "$DATA" -path '*/demo-pack/bundle.json' | head -n 1)"
[ -n "$INSTALLED" ] || fail "the bundle was not installed"
node -e '
  const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (b.id !== "demo-pack" || b.version !== "0.1.1") throw new Error(`unexpected bundle ${b.id}@${b.version}`);
' "$INSTALLED"
[ -f "$(dirname "$INSTALLED")/runtime/index.cjs" ] || fail "installed bundle has no runtime"

step "8. abuddy test (the saved app)"
"$ABUDDY" test

step "No symlinks into the monorepo"
if find "$PACK/node_modules" "$WORK/tools/node_modules" -maxdepth 2 -type l -lname "$ROOT*" | grep -q .; then
  fail "node_modules links into the monorepo"
fi

echo
echo "External pack authoring end state: OK"
