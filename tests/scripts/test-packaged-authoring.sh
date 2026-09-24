#!/usr/bin/env bash
# End state for outside pack authors (docs/archive/goals/goal-external-pack-authoring.md): in a temp
# dir outside the monorepo, using only the packed @abuddy/* tarballs,
#   1. install @abuddy/cli + @abuddy/sdk (with @abuddy/ears) from tarballs (a backend-only pack installs no editor libraries)
#   2. abuddy init → add feature → a flow using keepAlive from default-setup → seeds from a format
#      with a .ts compiler module, default-setup's notes format, and default-setup's library format
#      (its compiler module, loaded from the dependency's bundled seed-compilers.mjs) → an llm flow and a service
#      calling services.inference
#   3. abuddy build
#   4. unit tests on the harness: seeds with default-setup's formats and hooks, the feature's system, the service
#      and the llm flow on default-setup's brain, with inference mocked by mockInference
#   5. @abuddy/testing's published declarations type-check on their own (skipLibCheck off)
#   6. abuddy release --local --dry-run produces a verified archive
#   7. install that archive into an isolated test data dir
#   8. abuddy test passes against the configured app (this checkout, chosen at the first-run prompt)
#   9. the packed CLI's abuddy db reads and exports the data that app seeded
# No ABUDDY_ROOT, no symlinks, no PATH edits. Requires a built checkout (npm run build).
# KEEP_WORK=1 keeps the temp dir, and the app data dir step 8 keeps for step 9.
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

step "Pack @abuddy/ears, @abuddy/sdk, @abuddy/ui, @abuddy/cli and @abuddy/testing"
(cd "$ROOT" && npm run packages:build >/dev/null)
for dir in abuddy-ears abuddy-sdk abuddy-ui abuddy-cli/dist/package abuddy-testing/dist/package; do
  (cd "$ROOT/packages/$dir" && npm pack --silent --pack-destination "$WORK" >/dev/null)
done
EARS_TGZ="$(ls "$WORK"/abuddy-ears-*.tgz)"
SDK_TGZ="$(ls "$WORK"/abuddy-sdk-*.tgz)"
UI_TGZ="$(ls "$WORK"/abuddy-ui-*.tgz)"
CLI_TGZ="$(ls "$WORK"/abuddy-cli-*.tgz)"
TESTING_TGZ="$(ls "$WORK"/abuddy-testing-*.tgz)"

step "1. Install @abuddy/cli + @abuddy/sdk from the tarballs"
mkdir "$WORK/tools"
# The SDK's @abuddy/ears comes from its tarball too
(cd "$WORK/tools" && npm init -y >/dev/null && npm install --silent "$EARS_TGZ" "$SDK_TGZ" "$CLI_TGZ")
ABUDDY="$WORK/tools/node_modules/.bin/abuddy"
"$ABUDDY" --version

step "2. abuddy init → add feature"
cd "$WORK"
"$ABUDDY" init demo-pack >/dev/null
PACK="$WORK/demo-pack"
cd "$PACK"
# The tarballs stand in for the npm registry
npm pkg set "dependencies.@abuddy/ears=file:$EARS_TGZ" "dependencies.@abuddy/sdk=file:$SDK_TGZ" "devDependencies.@abuddy/cli=file:$CLI_TGZ" "devDependencies.@abuddy/testing=file:$TESTING_TGZ"
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

step "2. Seeds from abuddy.json: a format with a .ts compiler module, and default-setup's notes and library formats"
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
mkdir -p src/seeds/library/guides
printf -- '---\nname: Demo guides\n---\n' > src/seeds/library/guides/_meta.md
printf -- '---\nname: Getting started\ntags: [demo]\n---\n<!-- section:text -->\nInstall demo-pack.\n' > src/seeds/library/guides/start.md
# demo-notes and demo-library use default-setup's formats, compiled from this pack's markdown through the built
# dependency; the library format's compiler module comes from default-setup's dist/build/seed-compilers.mjs
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("abuddy.json", "utf8"));
  m.seedFormats = { ...m.seedFormats, glossary: { compiler: "src/seeds/compilers/glossary.ts", entity: "DemoPack", identity: ["term"] } };
  m.boot.seed.glossary = { path: "src/seeds/glossary", format: "glossary" };
  m.boot.seed["demo-notes"] = { path: "src/seeds/notes", format: "default-setup:notes" };
  m.boot.seed["demo-library"] = { path: "src/seeds/library", format: "default-setup:library" };
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
  // Sections and the _meta.md name come from the library compiler module of default-setup, not the generic walker
  const [guides] = read("demo-library");
  const [doc] = guides?.children ?? [];
  if (guides?.entity !== "Collection" || guides.name !== "Demo guides" || doc?.entity !== "Document"
    || JSON.stringify(doc.content) !== JSON.stringify([{ type: "text", text: "Install demo-pack." }])) throw new Error("demo-library: " + JSON.stringify(guides));
' || fail "the compiler modules and markdown seeds were not compiled"

step "4. Unit tests through the harness, with default-setup's runtime"
cat > tests/unit/demo-notes.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { seedPack } from '@abuddy/testing/harness';
import { findAll } from '#generated/ears';
import { findRelations } from '@abuddy/ears';

describe('demo notes', () => {
  it("seeds notes with default-setup's format and hooks", async () => {
    expect(await seedPack({ keys: ['demo-notes'] })).toEqual({ 'demo-notes': { created: 1, updated: 0, skipped: 0 } });
    const [note] = findAll('Note');
    expect(note).toMatchObject({ title: 'Demo notes', noteType: 'document', lastSeen: 0 });
    expect(note.shortCode).toMatch(/^NOTE-\d+$/);
  });

  it("seeds a library with default-setup's bundled compiler module and hooks", async () => {
    expect(await seedPack({ keys: ['demo-library'] })).toEqual({ 'demo-library': { created: 2, updated: 0, skipped: 0 } });
    const [guides] = findAll('Collection');
    const [doc] = findAll('Document');
    expect(guides).toMatchObject({ name: 'Demo guides' });
    expect(doc).toMatchObject({ name: 'Getting started', tags: ['demo'], content: [{ type: 'text', text: 'Install demo-pack.' }] });
    expect(findRelations({ sourceEntity: guides.id, targetEntity: doc.id }).length).toBeGreaterThan(0);
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
    const app = await startApp({ systems: ['default-setup/brain', 'host/settings'] });

    const run = await app.runFlow('Notes Summary', { event: 'notes.summarize', data: { text: 'Remember to buy milk' } });

    expect(run.steps).toEqual([expect.objectContaining({ label: 'summarize', status: 'completed' })]);
    expect(run.steps[0].nodeAttributes.result).toMatchObject({ text: 'Buy milk' });
    expect(inference.calls).toEqual([expect.objectContaining({ model: 'openai:gpt-4o-mini', messages: [{ role: 'user', text: 'Summarize this note: Remember to buy milk' }] })]);
  });
});
TS
# Uncoloured, so the summary line below matches whatever FORCE_COLOR the caller set
NO_COLOR=1 FORCE_COLOR=0 node_modules/.bin/vitest run 2>&1 | tee "$WORK/unit.log"
# The scaffold's seed test (2), the feature's system test, default-setup notes and library, the service and the flow
grep -qE "Tests +7 passed" "$WORK/unit.log" || fail "unit tests through the harness failed"
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
import type { PluginEvent, TestApp, FlowRun } from '@abuddy/testing/harness';
import type { IsolatedDataDir } from '@abuddy/testing/vitest';
import type { AppHelper } from '@abuddy/testing';

type IsAny<T> = 0 extends 1 & T ? true : false;
export const typed: [IsAny<PluginEvent>, IsAny<Awaited<ReturnType<TestApp['nextEmit']>>>, IsAny<FlowRun>, IsAny<IsolatedDataDir>, IsAny<AppHelper>] = [false, false, false, false, false];
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
ARCHIVE="$(sed -n 's/^Pack: //p' "$WORK/release.log")"
[ -f "$ARCHIVE" ] && [ -f "$ARCHIVE.sha256" ] || fail "release did not produce an archive and checksum"
(cd "$(dirname "$ARCHIVE")" && shasum -a 256 -c "$(basename "$ARCHIVE").sha256")
[ -z "$(git status --porcelain)" ] || fail "a dry run changed the pack's files"

step "7. Install the packed archive into an isolated test data dir"
DATA="$WORK/test-data"
ABUDDY_USER_DATA_DIR="$DATA" "$ABUDDY" install "$ARCHIVE"
INSTALLED="$(find "$DATA" -path '*/demo-pack/integrity.json' | head -n 1)"
[ -n "$INSTALLED" ] || fail "the pack was not installed"
node -e '
  const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  // The version on disk: a dry run bumps nothing, so it packs what is there rather than the next version
  if (b.id !== "demo-pack" || b.version !== "0.1.0") throw new Error(`unexpected pack ${b.id}@${b.version}`);
' "$INSTALLED"
[ -f "$(dirname "$INSTALLED")/runtime/index.cjs" ] || fail "installed pack has no runtime"

step "8. abuddy test on the packed archive (the saved app)"
# PACK_ARCHIVE installs step 6's .tgz as it is, so this runs the artifact a release ships rather than
# another build of the same source — the one thing the rest of the script cannot check.
# The app's data dir is kept for step 9: the app seeded the installed demo pack into it
# `if !` so the pipeline's exit status is this script's to report: under `set -e` a failure would otherwise end it
# here, with only Playwright's own output to say why
if ! PACK_ARCHIVE="$ARCHIVE" E2E_KEEP_DATA=1 "$ABUDDY" test 2>&1 | tee "$WORK/e2e.log"; then fail "abuddy test failed"; fi
APP_DATA="$(sed -n 's/.*\[e2e\] kept test data dir: //p' "$WORK/e2e.log" | head -n 1)"
[ -d "$APP_DATA" ] || fail "abuddy test didn't report the data dir it kept"

# What shipped is what ran: the integrity.json inside the archive against the one the app installed. A log
# line saying it used the archive would only be the fixture agreeing with itself.
tar -xzOf "$ARCHIVE" demo-pack/integrity.json > "$WORK/archive-integrity.json"
diff "$WORK/archive-integrity.json" "$APP_DATA/packs/demo-pack/integrity.json" || fail "the pack the app installed is not the one in $ARCHIVE"
if [ -z "${KEEP_WORK:-}" ]; then trap 'rm -rf "$WORK" "$APP_DATA"' EXIT; fi

step "9. abuddy db on the data the app seeded (the packed CLI, offline)"
# The demo pack's entity type comes from its installed manifest
"$ABUDDY" db query "return qx(EARS.Entity.DemoPack).pickAll().map((row) => row.term)" --data-dir "$APP_DATA" -o json > "$WORK/db-query.json" 2> "$WORK/db-query.err" \
  || { cat "$WORK/db-query.err"; fail "abuddy db query failed"; }
grep -q "Database: $APP_DATA (offline)" "$WORK/db-query.err" || fail "abuddy db query didn't print its data dir"
node -e '
  const terms = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  // The glossary term, beside the example row the scaffold seeds (which has none)
  if (!terms.includes("Pack")) throw new Error("the seeded glossary: " + JSON.stringify(terms));
' "$WORK/db-query.json" || fail "abuddy db query didn't read the seeded demo pack"
"$ABUDDY" db export --data-dir "$APP_DATA" --out "$WORK/db-export" --type DemoPack --type Note
node -e '
  const fs = require("fs");
  const dir = process.argv[1];
  const rows = JSON.parse(fs.readFileSync(`${dir}/DemoPack.json`, "utf8"));
  const term = rows.find((row) => row.term === "Pack");
  if (term?.definition !== "A bundle of features.") throw new Error("DemoPack.json: " + JSON.stringify(rows));
  const notes = JSON.parse(fs.readFileSync(`${dir}/Note.json`, "utf8"));
  if (!notes.some((note) => note.title === "Demo notes")) throw new Error("Note.json has no demo note");
  const summary = JSON.parse(fs.readFileSync(`${dir}/export.json`, "utf8"));
  if (summary.counts.DemoPack !== rows.length) throw new Error("export.json: " + JSON.stringify(summary));
' "$WORK/db-export" || fail "abuddy db export didn't write the seeded data"


step "No symlinks into the monorepo"
if find "$PACK/node_modules" "$WORK/tools/node_modules" -maxdepth 2 -type l -lname "$ROOT*" | grep -q .; then
  fail "node_modules links into the monorepo"
fi

echo
echo "External pack authoring end state: OK"
