> **Done** (master, `d3ff1a950`..`5a7717ff2`). The text below is the plan as written; the Outcome records where
> it went further — the packaged-authoring template and the last of `@apack/ears`'s third sense of the word.
> For the vocabulary as it now stands, see `docs/public-facing/content.md`, "The four stages".

> **Written in session** `bc6d43e0-1c60-4cad-8237-15508a9e6649` (Claude Code, 2026-09-24). Resume it with `claude -r bc6d43e0-1c60-4cad-8237-15508a9e6649`.

```
# Goal: one word per stage in the content pipeline

Implement docs/goals/goal-content-vocabulary.md on master, at or after d0c811c2d — the base its
Background was surveyed at.
Before Phase 1, confirm the base: `importCompiledContent` in packages/apack-sdk/src/utils/apply.ts, `ImportContext`
and `ImportCounts` beside it, and `builtInContentRevisions`/`externalContentRevisions` in packages/apack-host/src/app-state/
exist at HEAD. If they don't, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- No function or method that returns `ImportCounts` has a name beginning with `content`, and a spec fails
  if one does.
- `importCompiledContent`, `importContent`, `importPackContent`, `shouldImportAll`, `ImportCounts`, `ImportContext`, `contentPackId` and
  `Applier.content` no longer exist anywhere outside docs/archive/.
- `AppState` carries `builtInContentRevisions`, `externalContentRevisions`, `builtInContentFingerprints` and
  `externalContentDeps`, and a migration moves data written under the old names.
- docs/public-facing/content.md and packages/apack-sdk/CLAUDE.md name the four stages and say which
  vocabulary belongs to each, and separate runtime content data from the parity golden.
- `content-golden:check` and `content-golden:update` are named `content-parity:check` and `content-parity:update`.
- npm run typecheck; npm run schema:check -w @apack/sdk; npm run api:check; npm run compile;
  npm run test:unit; npm run content-golden:check -w @app/default-setup.
- npm run build, npm test (E2E), npm run test:external-pack and npm run test:packaged-authoring, since
  codegen output, the pack manifest schema and the scaffolded test template all change.
- `grep -rn "importContent\|QxStart\|importCompiledContent"` finds nothing outside docs/archive/.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/apack* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  APACK_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/apack-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- create a new migration file: 0.4.0 is the latest unreleased target and takes the new entry.
- add a guard whose only job is to name a deleted identifier (docs/goals/README.md, "Invariants and
  milestones"). Guard the property, not the old name.
```

# Goal: one word per stage in the content pipeline

`content` names four different things in this repo — authored content, a compiled artifact, the act of
applying it, and the record of having applied it. This goal gives the act its own word, makes the split
checkable, and writes the stages down.

## Background (2026-09-24, at d0c811c2d on master)

A pack ships authored content that is compiled at build time and applied to the user's database at boot
or install, with per-row tracking so a user's edits survive a re-apply. The pipeline has four stages:

**author → compile → import → record**

283 files under `packages/`, `scripts/`, `docs/` and `tests/` mention `content`. Over 40 distinct
identifiers carry it, and nothing in a name says which stage it belongs to:

| Stage | Identifiers today |
|---|---|
| author | `content.sources`, `content.formats`, `contentWriters`, `contentPolicy`, `contentDir`, `contentPath`, `ContentDependency` |
| compile | `ContentCompileContext`, `contentFile`, `ContentIndex`, `*.content.json`, `content.json` |
| import | `importCompiledContent`, `importPackContent`, `shouldImportAll`, `contentPackId`, `Applier.content`, `packContentImport` |
| record | `contentKey`, `writtenFields`, `sourceHash`, `builtInContentRevisions`, `externalContentRevisions`, `builtInContentFingerprints`, `externalContentDeps` |

### The collision

`content` is both the noun (the content) and the verb (applying it). The repo's own doc comment at
`packages/apack-sdk/src/utils/apply.ts:30` cannot avoid it:

> *"the only keys an **import** of its **content** can **content**"*

Three words for one operation in one clause.

### A second vocabulary is already half-adopted

`importCompiledContent()` takes `mode?: ImportMode` (`utils/apply.ts:16,21`). The function is `content*`, its mode is
`Import*`, in the same signature. `packContentImport` is the event name. The verb already has a second
name; the migration was started and left unfinished.

### Two fields distinguished by a word that cannot distinguish them

`packages/apack-host/src/app-state/index.ts`:

```ts
/** Each external pack's compiled content data last written, by pack id. Kept on uninstall */
externalContentRevisions: Record<string, string>;

/** Each built-in pack's boot apply last written, by pack id: the hash of its compiled data */
builtInContentRevisions: Record<string, string>;
```

Same type, same key, same purpose. The distinguishing axis is **external vs built-in**, encoded as the
presence of the word `pack` — but built-in packs are packs, which the root `CLAUDE.md` insists on
("built-in packs included — the app itself is the pack `host`"). Beside them, `builtInContentFingerprints` is
built-in only and `externalContentDeps` is external only, neither of which its name says.

### Surface

- **Published API:** 24 exported types and 12 exported values carry the word (`packages/apack-sdk/etc/*.api.md`).
- **Manifest keys:** `content.sources`, `content.formats`, `contentWriters`, `contentPolicy`, and an entry's `applier`
  (`packages/apack-sdk/src/build/manifest-schema.ts:98,122,252,254`). `apack.schema.json` is generated
  from that file.
- **Codegen:** `generate-entries.ts:1377` emits `import { importCompiledContent, type Applier, type ImportCounts, type ContentSelectionSet }`
  into every pack's `src/__generated__/appliers.ts`, so the names reach generated pack code.
- **Pack-author doc:** `docs/public-facing/content.md`, 72 mentions.
- **Stored data:** the four `AppState` fields above are persisted, so renaming them needs a migration.
- **Pack-author test API:** `importContent({ keys?, mode? })` and `ImportOptions`
  (`packages/apack-testing/src/harness.ts:354,364`) are the most visible verb in the vocabulary — the
  CLI scaffolds a call to it into every new pack (`apack-cli/src/commands/init.ts:259,269`) and
  `docs/public-facing/testing.md` uses it seven times.
- **A homonym in another package.** `@apack/ears` uses `content` for the starting set of a query chain:
  `QxStart` (`src/query.ts:26`, published in `etc/index.api.md:602`), the parameter in
  `untypedQx(content?: QxStart)`, and "Written …" in the doc comments of `query.ts:280`, `runtime.ts:166`
  and `typed.ts:37`. Unrelated to pack content data, in a layer that has no such concept — but it is the
  second meaning a grep for `content` returns.

### What prompted this

In the session that wrote this doc, "re-record the content golden" (a test fixture of the *import* stage's
output, changing no user data) and "re-apply 47 rows" (a consequence of the *compile* stage's hash moving)
were conflated twice, by the author of both. They are two different stages sharing one word.

### Not a constraint

There are no external packs and no users. Manifest keys, published types and generated output are all
freely renameable; nothing below is shaped by compatibility.

## Decisions

Final.

**0. The noun stays `content`; only the verb moves.**
Renaming the noun (to `fixture`, `content`, …) was considered and rejected on evidence, not taste:
`fixture` is already this repo's word for test input, in `tests/fixtures/`, `tests/e2e/fixtures/` and
`packages/default-setup/tests/fixtures/content-parity/` — the last of which sits in the same tree as the
code being renamed, and would become fixtures-of-fixtures. `content` is also correct for what it names:
content a pack ships to start a user's database. The collision this goal removes is noun-vs-verb, which
Decisions 1 and 3 close completely, so renaming the noun would be ~220 further files spent on a problem
already solved.

**1. `content` is a noun. The verb is `import`, and each importer's name says its scope.**
Three functions import content, in a caller relationship, and they must not collapse onto one name:

| Name | Package | What it does |
|---|---|---|
| `importCompiledContent({ compiledDir, … })` | `@apack/sdk/utils` | runs the registered appliers over one already-compiled directory |
| `importPackContent(packs, …)` | `@apack/host` | orchestrates that across packs at boot |
| `importContent({ keys?, mode? })` | `@apack/testing/harness` | compiles the pack's content entries, then imports them |

The harness takes the plain name: it is the one pack authors call, `apack init` scaffolds it, and it
sits beside the harness's existing `importFlows`. The SDK primitive says `Compiled` because that is the
precondition distinguishing it — its first parameter is `compiledDir`, and only the harness function
compiles (`harness.ts:389` calls the primitive).

Otherwise: an identifier that names the content, its identity, its shape or its configuration keeps
`content`. One that names the act, what it needs, or what it produces, uses `import`.
This finishes the migration `ImportMode` began.

**2. The manifest keys stay, on merit.**
`content.sources`, `content.formats`, `contentWriters` and `contentPolicy` are all nouns and all correct under Decision 1.
They are not being kept for compatibility — there is none to keep — but because renaming a correct name
is churn. The entry-level `applier` field stays for the same reason; only its description changes, to
name the method Decision 4 renames.

**3. A guard makes the split checkable.**
A rule people must remember is not a guard. Add a spec: **no function or method whose return type is
`ImportCounts` has a name beginning with `content`.** That is exactly the collision this goal removes, it
needs no exception list, and it permits both `importContent()` and `Applier.apply()`. It guards the
property, not any deleted identifier.

**4. `Applier.apply(ctx)` becomes `Applier.apply(ctx)`.**
A `Applier` is the mechanism and stays a noun. Its method performs the import. `import` is legal as a
method name but is a keyword elsewhere and confuses some tooling; `apply` is the conventional name for
running a mechanism and satisfies Decision 3.

**5. Name the axis that distinguishes.**
`builtInContentRevisions` → `builtInContentRevisions`, `externalContentRevisions` → `externalContentRevisions`,
`builtInContentFingerprints` → `builtInContentFingerprints`, `externalContentDeps` → `externalContentDeps`. These are
persisted, so the rename travels with a migration.

**6. The stages are documented where pack authors and agents read.**
`docs/public-facing/content.md` and `packages/apack-sdk/CLAUDE.md` gain a paragraph naming
author → compile → import → record and which vocabulary belongs to each, including the sentence that
separates the two things this session conflated: re-recording the content golden is a fixture of the import
stage's output and changes no user data; what changes user data is a new `sourceHash`, from compile.

**7. The parity golden is not content data, and its scripts stop implying it is.**
Three things carry the word today, and only two of them are content:

| | What | Where |
|---|---|---|
| A. Runtime content data | the pack's shipped content | `packages/default-setup/src/content/` → `dist/*.content.json` → the user's database |
| B. Fixture content data | synthetic sources giving the parity test stable input | `packages/default-setup/tests/fixtures/content-parity/`, `dependent-pack/` |
| C. The parity golden | a recording of what importing A and B produces | `tests/unit/content-parity/__golden__/default-setup.json` |

A and B are the same kind of thing and both keep `content`. C is a test expectation, not content data, and
`content-golden:*` names it as though it were a kind of content. Rename to `content-parity:check` and
`content-parity:update`: the artifact is the parity golden, and matching the test directory means the
failing spec (`tests/unit/content-parity/content-parity.spec.ts`) names its own fix.

This is also the distinction the docs in Decision 6 have to draw. Re-recording the golden rewrites a
test expectation and changes no user data; what changes user data is a new `sourceHash`, from compile.

**8. The `@apack/ears` homonym goes too.**
`QxStart` names the starting set of a query — a real and separate meaning, in a package that sits below
the SDK and has no pack-content concept. "It is a different package" is exactly the reasoning that let
`content` mean four things, so it is not a reason to keep a second meaning after this goal. Rename to
`QxStart`, which says what it is; the parameter `untypedQx(content?)` becomes `start`, and the three
"Written …" doc comments follow. `runtime.ts` and `typed.ts` are change-controlled
(`packages/apack-sdk/TYPED-EARS.md`), but these are comment-only edits there.

## Phases

### Phase 1 — Give the act its own word

- Rename, across `packages/`, `scripts/`, `tests/` and `docs/` (not `docs/archive/`):
  `importCompiledContent` → `importCompiledContent`, `importPackContent` → `importPackContent`, `shouldImportAll` → `shouldImportAll`,
  `ImportCounts` → `ImportCounts`, `ImportContext` → `ImportContext`, `contentPackId` → `contentPackId`
  (it reads a pack id *from* the content; the `-ing` was the verb leaking in).
- `Applier.apply(ctx)` → `Applier.apply(ctx)` (Decision 4): the interface in `utils/apply.ts:27`, the two
  implementations (`content/applier.ts:109`, `content/flow-applier.ts:70`), the call site (`utils/apply.ts:73`),
  default-setup's hand-written settings applier (`src/content/settings/applier.ts:9`), and the `Applier`
  object literals in the host and SDK specs.
- `manifest-schema.ts:100`: the `applier` field's description names `apply(ctx)`, not `apply(ctx)`. Run
  `npm run schema:update -w @apack/sdk`.
- `generate-entries.ts:1377,1386-1388`: the emitted import and re-exports in `appliers.ts` follow the new
  names. Run `npm run compile` to regenerate default-setup.
- `@apack/testing`: `importContent()` → `importContent()` (Decision 1), `ImportOptions` → `ImportOptions`
  (`src/harness.ts:354,364`), the CLI's `init` template (`commands/init.ts:259,269`),
  `docs/public-facing/testing.md` and `packages/apack-testing/CLAUDE.md`. This is the name pack authors
  see first, so it moves with the rest rather than later.
- `@apack/host`: `PackImportFailure` → `PackImportFailure` and `importErrors()` → `importErrors()`
  (`src/packs/runtime/apply.ts:49,54`, re-exported from `runtime/index.ts:14`); the `content` parameter of
  `importPackContent(packs, content)` becomes `importCompiledContent`.
- Test-local verb forms follow the rule rather than being left as the one place it does not hold:
  `writeAll` → `importAll`, `wipeContent` → `wipeImport`, `applyFn` → `applyFn`, `unwritable` → `failsImport`.
- User-visible strings: `logger.info('Applying data for pack: …')`
  (`apack-host/src/packs/runtime/apply.ts:119`) reads "Importing content for pack: …".
- `npm run api:update` and commit `etc/`.

**Done when:** `npm run typecheck`; `npm test -w @apack/sdk`, `-w @apack/host`, `-w @app/default-setup`;
`npm run schema:check -w @apack/sdk` and `npm run api:check` clean; `grep -rn` finds none of the six
renamed identifiers or `Applier.content` outside `docs/archive/`.

### Phase 2 — Make the split checkable

- Add a spec (beside the SDK's other boundary specs, e.g. `packages/apack-sdk/tests/`) implementing
  Decision 3: walk the SDK's and host's sources, find every function and method whose declared return
  type is `ImportCounts`, and fail if any name begins with `content`.
- Give it a doc comment saying what property it holds and why — the noun/verb collision, not the old
  names.

**Done when:** the spec passes. **Mutation:** renaming `importContent` back to `importCompiledContent` fails it; adding
a new `writeFoo(): ImportCounts` fails it.

### Phase 3 — Name the axis in `AppState`

- Rename the four fields per Decision 5 in `packages/apack-host/src/app-state/`, its `APP_STATE_FIELDS`
  list, and every reader (the host's applying, the pack installer, the migrations runner, specs).
- Add the field moves to `packages/apack-host/src/migrations/app/0.4.0.ts` — the latest unreleased
  target, which already has entries. Do **not** create a new version file. Guard each move so it is
  idempotent: the migration runs again on every development boot, on each beta of its release, and after
  a reset.

**Done when:** `npm test -w @apack/host` and `-w @app/api` pass; a row written with the old field names
is moved by the migration and reads back under the new ones; running the migration twice changes nothing
the second time. **Mutation:** dropping the guard makes the idempotence case fail.

### Phase 4 — Write the stages down

- `docs/public-facing/content.md`: the four-stage paragraph from Decision 6, near the top, before the
  entry fields.
- `packages/apack-sdk/CLAUDE.md`: the same split in its `content/` and `utils/` entries, so an agent
  reading the package map sees which vocabulary is which.
- Root `CLAUDE.md`: one line in the apply-source row of "What to run after a change" pointing at the
  stage split, since that row is where the golden-vs-user-data confusion surfaces.

- Rename the scripts per Decision 7: `content-golden:check`/`content-golden:update` become
  `content-parity:check`/`content-parity:update` in `packages/default-setup/package.json`, and every reference
  follows — root `CLAUDE.md` (the commands block and the apply-source row of "What to run after a
  change"), `packages/default-setup/CLAUDE.md`, and the header comment of
  `tests/unit/content-parity/content-parity.spec.ts`.

**Done when:** all three docs name author → compile → import → record and say which words belong to each;
the sentence separating the parity golden from user data appears in `content.md`; `npm run
content-parity:check -w @app/default-setup` runs and `grep -rn content-golden` finds nothing outside
`docs/archive/`.

### Phase 5 — The query content in `@apack/ears`

- Per Decision 8: `QxStart` → `QxStart` (`src/query.ts:26`), exported from `src/index.ts:11`; the
  parameter of `untypedQx(content?: QxStart)` becomes `start`; the "Written …" doc comments in
  `query.ts:280`, `runtime.ts:166` and `typed.ts:37` say "Starting from …".
- `npm run api:update -w @apack/ears` and commit `etc/index.api.md`.

Lands independently of Phases 1–4: it is a different package and shares no file with them.

**Done when:** `npm run typecheck:ears`; `npm test -w @apack/ears`; `npm run api:check -w @apack/ears`
clean; `grep -rn QxStart` finds nothing outside `docs/archive/`; the typed-EARS completions checklist in
`packages/apack-sdk/TYPED-EARS.md` is run, since `runtime.ts` and `typed.ts` were touched.

## Outcome (2026-09-24)

All five phases landed on master as nine commits, `d3ff1a950`..`5a7717ff2`. No phase was dropped and no decision had
to be corrected. Two things came up that the plan did not list, both found by sweeping rather than by a failing
check, and both are folded in below. The Deferred section's two remaining items are still open and still out of
scope; a third bullet there, deferring the `content-golden` rename, was stale when this was archived — Decision 7 was
rewritten mid-plan to do that rename and Phase 4 did it — so it was removed rather than left to contradict them.

### Per phase

| Phase | Status | Evidence |
|---|---|---|
| 1 — give the act its own word | done `9ce986ad0` | 68 files; `importCompiledContent`/`importPackContent`/`importContent`, `ImportCounts`, `ImportContext`, `ImportOptions`, `PackImportFailure`, `Applier.apply`; `schema:update`, `compile`, `api:update` |
| 2 — make the split checkable | done `27573c9e9` | `apack-sdk/tests/utils/import-is-the-verb.spec.ts`; finds 5 importers; both mutations fail it |
| 3 — name the axis in `AppState` | done `bfe2a34e1` | four fields renamed, move added to `migrations/app/0.4.0.ts`; 39 migration specs; idempotence mutation-checked |
| 4 — write the stages down | done `847fa0799` | "The four stages" in `content.md`; the split in `apack-sdk/CLAUDE.md` and the root table; `content-parity:check`/`:update` |
| 5 — the query content in `@apack/ears` | done `74654df72`, `5a7717ff2` | `QxStart` → `QxStart`, `qx(start)`; TYPED-EARS checklist run |

### Conventional choices

- **Phase 1** — `Applier.apply` over `Applier.import`: `import` is legal as a method name but is a keyword elsewhere and
  confuses some tooling. The guard is worded so either passes, since what it forbids is `content*`.
- **Phase 1** — `writingPackId` became `contentPackId`: it reads a pack id *from* the content, so the `-ing` was the verb
  leaking into a noun.
- **Phase 3** — the migration addresses the `AppState` row by the literal `'AppState-app'`, as the file already does
  for `SETTINGS_ID`. Importing `APP_STATE_ENTITY` instead broke an api spec that mocks `@apack/host/app-state`.
- **Phase 5** — the three "Written …" doc comments read "Started from …".

### What the plan did not list

- **The packaged-authoring template** (`1a8f0e856`). `tests/scripts/test-packaged-authoring.sh` writes the example
  pack's specs itself, so they were the last callers of `applyPack`, and `test:packaged-authoring` was the check that
  found them. They are what a pack author copies, which is the reason the harness took the plain name.
- **`hydrateRelationMetadata`** (then `seedRelationMetadata`) (`5a7717ff2`). A third sense of the word, in `@apack/ears`'s sharded router: not content
  and not a query's start, but what hydration tells the router about a relation it has just read off disk. Renamed
  `hydrateRelationMetadata`, the word this repo already uses for loading persisted data into memory, and the last
  `content` mentions in `query.ts` and `typed.ts` prose went with it. `@apack/ears/src` now holds one occurrence of the
  word, `index.ts:33`'s "a applier", which is the pack-applier noun and correct.

### Invariants and milestones

One invariant, and it has a guard:

- **Nothing that performs an import is named `content*`** — `apack-sdk/tests/utils/import-is-the-verb.spec.ts`, which
  reads the declared return type rather than a list of names, so a `writeFoo(): ImportCounts` written next year fails
  it. Mutation-checked both ways.

The rest of the "Finished when" list is milestones: the identifiers that no longer exist, the `AppState` fields, the
docs. They were true when this landed, and a later rename making one false is not a regression. Per
[the README](../../goals/README.md#invariants-and-milestones), no guard names a deleted identifier — the guard holds the property
that made the old shape wrong.

### Two things worth knowing if you touch this again

- **Codegen names the applier method on both sides.** The emitted `{ key, apply: … }` literal and the matching
  `import { apply as __applier_x }` are written in different places in `generate-entries.ts`; changing one alone fails
  `compile` with an esbuild "No matching export" error.
- **`untypedTx(...).drop(k)` clears an attribute rather than removing the key** — it reads back as `null`, not
  `undefined`. The migration's "already moved" check is `== null` for that reason, and getting it wrong made the
  migration non-idempotent.

### Final verification

`typecheck` ✅ · `schema:check` ✅ · `api:check` (2 + 28 + 101 reports) ✅ · `compile` ✅ · `test:unit` 3,025 tests
across 8 suites ✅ · `content-parity:check` ✅ · `build` ✅ · `npm test` (E2E) 21 ✅ · `test:external-pack` ✅ ·
`test:packaged-authoring` ✅

`contentData`, `applyPack`, `applyPackContent`, `shouldWriteAll`, `ContentCounts`, `ContentApplierContext`, `writingPackId`, `QxStart` and
`Applier.content` appear nowhere outside `docs/archive/` and `CHANGELOG.md`, which is release-owned history.

## Deferred

- **Merging `builtInContentRevisions` and `externalContentRevisions` into one field.** They have identical type and
  purpose and differ only in retention — the external one is kept when a pack is uninstalled. Merging
  needs that retention rule re-expressed and is a data change, not a naming one. Out of scope.
- **`sourceHash`'s scope.** It hashes the compiled bundle, which is why editing an inlined `_helpers/`
  file re-hashed 47 of 62 golden rows in this session. Whether the golden should assert hash *values* at
  all is a test-design question, not a vocabulary one. **Nothing tracks it.**
  [`goal-test-cleanup.md`](goal-test-cleanup.md) item 6 is the nearest thing and is not it: that one
  asks whether to re-record the goldens with notes included, to retire `NOTES_INTENDED_DIFFERENCES`, and is
  deferred there too.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request;
- no publishing, releases or triggered workflows;
- no real data dirs, no broad pkill, E2E in the `apack-test` namespace;
- preload, example pack and release metadata rules;
- typed EARS types are change-controlled (`packages/apack-sdk/TYPED-EARS.md`);
- published packages: no `any`, the TypeScript floor, `api:update` after export changes with `etc/`
  committed;
- build order: `packages:build` before the CLI suite, `npm run compile` before the api suites and E2E;
- migrations follow `packages/apack-host/src/migrations/CLAUDE.md`, and 0.4.0 is the target;
- investigate failing tests, mutation-check new guards;
- run the narrowest check that could fail during the work, and the full chain once per phase at its end.
