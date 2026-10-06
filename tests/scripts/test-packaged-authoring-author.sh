#!/usr/bin/env bash
# The half of the packaged-authoring check that needs no app: in a temp dir outside the monorepo, using only
# the packed @abuddy/* tarballs, author a pack, build it, test it on the harness, and release it to a
# verified archive. The app half runs that archive against a built app.
#
# Its own file rather than a mode, for `test-external-pack-contract.sh`'s reason: `check:tiers` reads a
# step's scripts as text, and a branch it never takes still reads as a reach at the app.
#
# Phases, and the end state they establish for outside pack authors
# (docs/archive/goals/goal-external-pack-authoring.md):
#   1. install @abuddy/cli + @abuddy/sdk (with @abuddy/ears) from tarballs
#   2. abuddy init -> add feature -> a flow using keepAlive from default-setup -> seeds from a format with a
#      .ts compiler module, default-setup's notes format, and its library format -> an llm flow and a
#      service calling services.inference
#   3. abuddy build
#   4. unit tests on the harness, with inference mocked by mockInference
#   5. @abuddy/testing's published declarations type-check on their own (skipLibCheck off)
#   6. abuddy release --local --dry-run produces a verified archive (--skip-e2e: the app half runs that)
#   7. install that archive into an isolated test data dir
# Requires a built checkout's packages (npm run packages:build), not a built app.
# KEEP_WORK=1 is the app half's flag; this half always leaves its work dir, which is its declared output.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT/tests/scripts/lib/authoring.sh"
# This run's work dir survives it: the chain caches a step on its declared `outputs` existing, and the app
# half reads the archive out of here. What gets cleaned is the *previous* run's, named by the handoff it left.
if [ -f "$HANDOFF/work.json" ]; then
  rm -rf "$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).work)' "$HANDOFF/work.json")"
  rm -rf "$HANDOFF"
fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/abuddy-authoring-XXXXXX")"
echo "Work dir: $WORK"
useWorkDir "$WORK"

step "Pack @abuddy/ears, @abuddy/sdk, @abuddy/ui, @abuddy/cli and @abuddy/testing"
# ensure, not build: it needs the tarballs to match the sources, which is what ensure guarantees, and it
# rewrites nothing when they already do. packages:build rebuilt all five unconditionally, which deleted and
# rewrote the dist/ that anything running beside this reads.
(cd "$ROOT" && npm run packages:ensure >/dev/null)
for dir in abuddy-ears/publish abuddy-sdk/publish abuddy-ui/publish abuddy-cli/dist/package abuddy-testing/dist/package; do
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
(cd "$WORK/tools" && npm init -y >/dev/null && npm install --silent --prefer-offline --no-audit --no-fund "$EARS_TGZ" "$SDK_TGZ" "$CLI_TGZ")
ABUDDY="$WORK/tools/node_modules/.bin/abuddy"
"$ABUDDY" --version

step "2. abuddy init → add feature"
cd "$WORK"
"$ABUDDY" init demo-pack >/dev/null
PACK="$WORK/demo-pack"
cd "$PACK"
# The tarballs stand in for the npm registry
npm pkg set "dependencies.@abuddy/ears=file:$EARS_TGZ" "dependencies.@abuddy/sdk=file:$SDK_TGZ" "devDependencies.@abuddy/cli=file:$CLI_TGZ" "devDependencies.@abuddy/testing=file:$TESTING_TGZ"
npm install --silent --prefer-offline --no-audit --no-fund
# @abuddy/sdk carries the platform API only; the component library and its editors come with @abuddy/ui
for lib in @tiptap highlight.js lowlight @guolao/vue-monaco-editor; do
  [ ! -e "node_modules/$lib" ] || fail "a backend-only pack installed $lib"
done
# From here on, `abuddy` is the pack's own pinned CLI
ABUDDY="$PACK/node_modules/.bin/abuddy"
"$ABUDDY" add feature notes --label Notes >/dev/null
# @abuddy/ui's heavier components must build in a pack, not only in the monorepo
npm pkg set "dependencies.@abuddy/ui=file:$UI_TGZ"
npm install --silent --prefer-offline --no-audit --no-fund
cat > src/features/notes/fe/editors.ts <<'TS'
import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor';

export const editors = { TiptapEditor, SimpleMonacoEditor };
TS
node -e '
  const fs = require("fs");
  const file = "src/features/notes/fe/plugin.ts";
  fs.writeFileSync(file, "import { editors } from \"./editors.ts\";\nconsole.debug(Object.keys(editors));\n" + fs.readFileSync(file, "utf8"));
'
"$ABUDDY" init-tests
npm pkg set "devDependencies.@abuddy/testing=file:$TESTING_TGZ"
npm install --silent --prefer-offline --no-audit --no-fund

step "Configure the app the way the first-run prompt saves it (a local checkout)"
# This is what `abuddy build` resolves a dependency on a built-in pack through (fetch-deps'
# configuredAppPackagesDir), which is why it is written before step 2 adds that dependency.
# `abuddy test` deliberately does not read it — step 8 names its app on the command line with a
# usable choice sitting right here, which is what makes that step a check of the hermeticity
# rather than a restatement of it.
# Written directly, not typed at a prompt. The prompt is covered in @abuddy/cli's suite
# (tests/app/app-target.spec.ts: it asks, re-asks for an unusable path, saves, and the next run reuses the
# answer) with an injected prompt and no terminal. Driving it here took `expect`, a real tty and `env -u CI`
# — and `expect`'s `set timeout` covers a pattern match, not `wait`, so when `abuddy test --list` started a
# Playwright server that never returned, `lassign [wait]` blocked forever and hung the machine.
# The shape below is pinned by that spec ("writes the saved choice where the packaged-authoring script
# expects it"), so this literal cannot drift away from what the CLI writes.
mkdir -p "$HOME/Library/Preferences/abuddy-cli"
ROOT="$ROOT" node -e '
  const fs = require("fs"), path = require("path");
  const file = path.join(process.env.HOME, "Library", "Preferences", "abuddy-cli", "config.json");
  fs.writeFileSync(file, JSON.stringify({ app: { source: process.env.ROOT } }, null, 2) + "\n");
'
grep -q "\"source\": \"$ROOT\"" "$HOME"/Library/Preferences/abuddy-cli/config.json || fail "the app choice was not saved"

step "2. A flow using keepAlive from default-setup"
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("abuddy.json", "utf8"));
  m.dependencies = { "default-setup": "*" };
  fs.writeFileSync("abuddy.json", JSON.stringify(m, null, 2) + "\n");
'
cat > src/seeds/flows/notes-heartbeat.ts <<'EOF'
import { entry, keepAlive } from '#generated/flow-helpers.ts';

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
import { entry, keepAlive, on, llm } from '#generated/flow-helpers.ts';

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
import { services } from '#generated/services.ts';

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
npm install --silent --prefer-offline --no-audit --no-fund --save ai@^7.0.100

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
# A spec's path mirrors the source it covers, which is the layout `abuddy init` scaffolds and the one a
# pack author reads about (docs/public-facing/testing.md). These three cover the seeds, a feature's service
# and a seeded flow, so they go where those live.
mkdir -p tests/seeds/flows tests/features/notes/be/services
cat > tests/seeds/demo-notes.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { importSeeds } from '@abuddy/testing/harness';
import { findAll } from '#generated/ears.ts';
import { findRelations } from '@abuddy/ears';

describe('demo notes', () => {
  it("seeds notes with default-setup's format and hooks", async () => {
    expect(await importSeeds({ keys: ['demo-notes'] })).toEqual({ 'demo-notes': { created: 1, updated: 0, skipped: 0 } });
    const [note] = findAll('Note');
    expect(note).toMatchObject({ title: 'Demo notes', noteType: 'document', lastSeen: 0 });
    expect(note.shortCode).toMatch(/^NOTE-\d+$/);
  });

  it("seeds a library with default-setup's bundled compiler module and hooks", async () => {
    expect(await importSeeds({ keys: ['demo-library'] })).toEqual({ 'demo-library': { created: 2, updated: 0, skipped: 0 } });
    const [guides] = findAll('Collection');
    const [doc] = findAll('Document');
    expect(guides).toMatchObject({ name: 'Demo guides' });
    expect(doc).toMatchObject({ name: 'Getting started', tags: ['demo'], content: [{ type: 'text', text: 'Install demo-pack.' }] });
    expect(findRelations({ sourceEntity: guides.id, targetEntity: doc.id }).length).toBeGreaterThan(0);
  });
});
TS
cat > tests/features/notes/be/services/digest.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { mockInference } from '@abuddy/testing/harness';
import { services } from '#generated/services.ts';

describe('digest service', () => {
  it('digests a note from the structured output inference returns', async () => {
    const inference = mockInference(JSON.stringify({ summary: 'Buy milk', tags: ['errand'] }));
    expect(await services.digest.digest('Remember to buy milk')).toEqual({ summary: 'Buy milk', tags: ['errand'] });
    expect(inference.calls).toEqual([expect.objectContaining({ model: 'openai:gpt-5-mini', messages: [{ role: 'user', text: 'Digest: Remember to buy milk' }] })]);
  });
});
TS
cat > tests/seeds/flows/notes-summary.spec.ts <<'TS'
import { describe, expect, it } from 'vitest';
import { importFlows, mockInference, importSeeds, startApp } from '@abuddy/testing/harness';
import { entry, keepAlive, subflow } from '#generated/flow-helpers.ts';

describe('notes summary flow', () => {
  it("runs on default-setup's brain and llm step with inference mocked", async () => {
    await importSeeds({ keys: ['prompts', 'flows'] });
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
# file (config) or anywhere else fail.
# Don't widen these two prefixes to cover src/: a dependency's facade is inlined at
# src/__generated__/deps/<packId>.d.ts, and that path being outside the tolerance is what makes this step the proof
# that a peer its facade imports — zod today, through default-setup — resolves for a pack installed outside this
# monorepo. Forgiving src/ would swallow exactly that (abuddy-cli's facade-gate.ts says what rests on it).
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


# What the app half needs, and nothing it can derive for itself. The archive's digest is in here so that
# half's cache key moves when the artifact does: a re-authored pack is a different thing to test.
step "Hand the archive to the app half"
mkdir -p "$HANDOFF"
node -e '
  const fs = require("fs");
  const [work, archive, pack, out] = process.argv.slice(1);
  const sha = require("crypto").createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  fs.writeFileSync(`${out}/work.json`, JSON.stringify({ work, archive, pack, sha }, null, 2) + "\n");
' "$WORK" "$ARCHIVE" "$PACK" "$HANDOFF"

_step_report
echo
echo "External pack authoring, author half: OK (${SECONDS}s)"
