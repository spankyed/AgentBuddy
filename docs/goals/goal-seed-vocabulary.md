> **Written in session** `bc6d43e0-1c60-4cad-8237-15508a9e6649` (Claude Code, 2026-09-24). Resume it with `claude -r bc6d43e0-1c60-4cad-8237-15508a9e6649`.

```
# Goal: one word per stage in the seed pipeline

Implement docs/goals/goal-seed-vocabulary.md on master, at or after d0c811c2d — the base its
Background was surveyed at.
Before Phase 1, confirm the base: `importCompiledSeeds` in packages/abuddy-sdk/src/utils/seed.ts, `ImportContext`
and `ImportCounts` beside it, and `seedHashes`/`packSeedHashes` in packages/abuddy-host/src/app-state/
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
- No function or method that returns `ImportCounts` has a name beginning with `seed`, and a spec fails
  if one does.
- `importCompiledSeeds`, `importSeeds`, `importPackSeeds`, `shouldImportAll`, `ImportCounts`, `ImportContext`, `seedPackId` and
  `Seeder.seed` no longer exist anywhere outside docs/archive/.
- `AppState` carries `builtInSeedHashes`, `externalSeedHashes`, `builtInSeedFingerprints` and
  `externalSeedDeps`, and a migration moves data written under the old names.
- docs/public-facing/seeds.md and packages/abuddy-sdk/CLAUDE.md name the four stages and say which
  vocabulary belongs to each, and separate runtime seed data from the parity golden.
- `seed-golden:check` and `seed-golden:update` are named `seed-parity:check` and `seed-parity:update`.
- npm run typecheck; npm run schema:check -w @abuddy/sdk; npm run api:check; npm run compile;
  npm run test:unit; npm run seed-golden:check -w @app/default-setup.
- npm run build, npm test (E2E), npm run test:external-pack and npm run test:packaged-authoring, since
  codegen output, the pack manifest schema and the scaffolded test template all change.
- `grep -rn "importSeeds\|QxSeed\|importCompiledSeeds"` finds nothing outside docs/archive/.
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
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- create a new migration file: 0.3.15 is the latest unreleased target and takes the new entry.
- add a guard whose only job is to name a deleted identifier (docs/goals/README.md, "Invariants and
  milestones"). Guard the property, not the old name.
```

# Goal: one word per stage in the seed pipeline

`seed` names four different things in this repo — authored content, a compiled artifact, the act of
applying it, and the record of having applied it. This goal gives the act its own word, makes the split
checkable, and writes the stages down.

## Background (2026-09-24, at d0c811c2d on master)

A pack ships authored content that is compiled at build time and applied to the user's database at boot
or install, with per-row tracking so a user's edits survive a re-apply. The pipeline has four stages:

**author → compile → import → record**

283 files under `packages/`, `scripts/`, `docs/` and `tests/` mention `seed`. Over 40 distinct
identifiers carry it, and nothing in a name says which stage it belongs to:

| Stage | Identifiers today |
|---|---|
| author | `boot.seed`, `seedFormats`, `seedHooks`, `seedPolicy`, `seedsDir`, `seedPath`, `SeedDependency` |
| compile | `SeedCompileContext`, `seedFile`, `SeedIndex`, `*.seed.json`, `seeds.json` |
| import | `importCompiledSeeds`, `importPackSeeds`, `shouldImportAll`, `seedPackId`, `Seeder.seed`, `packSeedsImport` |
| record | `seedKey`, `seededFields`, `sourceHash`, `seedHashes`, `packSeedHashes`, `seedStatFingerprints`, `packSeedDeps` |

### The collision

`seed` is both the noun (the content) and the verb (applying it). The repo's own doc comment at
`packages/abuddy-sdk/src/utils/seed.ts:30` cannot avoid it:

> *"the only keys an **import** of its **seeds** can **seed**"*

Three words for one operation in one clause.

### A second vocabulary is already half-adopted

`importCompiledSeeds()` takes `mode?: ImportMode` (`utils/seed.ts:16,21`). The function is `seed*`, its mode is
`Import*`, in the same signature. `packSeedsImport` is the event name. The verb already has a second
name; the migration was started and left unfinished.

### Two fields distinguished by a word that cannot distinguish them

`packages/abuddy-host/src/app-state/index.ts`:

```ts
/** Each external pack's compiled seed data last seeded, by pack id. Kept on uninstall */
packSeedHashes: Record<string, string>;

/** Each built-in pack's boot seed last seeded, by pack id: the hash of its compiled data */
seedHashes: Record<string, string>;
```

Same type, same key, same purpose. The distinguishing axis is **external vs built-in**, encoded as the
presence of the word `pack` — but built-in packs are packs, which the root `CLAUDE.md` insists on
("built-in packs included — the app itself is the pack `host`"). Beside them, `seedStatFingerprints` is
built-in only and `packSeedDeps` is external only, neither of which its name says.

### Surface

- **Published API:** 24 exported types and 12 exported values carry the word (`packages/abuddy-sdk/etc/*.api.md`).
- **Manifest keys:** `boot.seed`, `seedFormats`, `seedHooks`, `seedPolicy`, and an entry's `seeder`
  (`packages/abuddy-sdk/src/build/manifest-schema.ts:98,122,252,254`). `abuddy.schema.json` is generated
  from that file.
- **Codegen:** `generate-entries.ts:1377` emits `import { importCompiledSeeds, type Seeder, type ImportCounts, type SeedIncludeSet }`
  into every pack's `src/__generated__/seeders.ts`, so the names reach generated pack code.
- **Pack-author doc:** `docs/public-facing/seeds.md`, 72 mentions.
- **Stored data:** the four `AppState` fields above are persisted, so renaming them needs a migration.
- **Pack-author test API:** `importSeeds({ keys?, mode? })` and `ImportOptions`
  (`packages/abuddy-testing/src/harness.ts:354,364`) are the most visible verb in the vocabulary — the
  CLI scaffolds a call to it into every new pack (`abuddy-cli/src/commands/init.ts:259,269`) and
  `docs/public-facing/testing.md` uses it seven times.
- **A homonym in another package.** `@abuddy/ears` uses `seed` for the starting set of a query chain:
  `QxSeed` (`src/query.ts:26`, published in `etc/index.api.md:602`), the parameter in
  `untypedQx(seed?: QxSeed)`, and "Seeded …" in the doc comments of `query.ts:280`, `runtime.ts:166`
  and `typed.ts:37`. Unrelated to pack seed data, in a layer that has no such concept — but it is the
  second meaning a grep for `seed` returns.

### What prompted this

In the session that wrote this doc, "re-record the seed golden" (a test fixture of the *import* stage's
output, changing no user data) and "reseed 47 rows" (a consequence of the *compile* stage's hash moving)
were conflated twice, by the author of both. They are two different stages sharing one word.

### Not a constraint

There are no external packs and no users. Manifest keys, published types and generated output are all
freely renameable; nothing below is shaped by compatibility.

## Decisions

Final.

**0. The noun stays `seed`; only the verb moves.**
Renaming the noun (to `fixture`, `content`, …) was considered and rejected on evidence, not taste:
`fixture` is already this repo's word for test input, in `tests/fixtures/`, `tests/e2e/fixtures/` and
`packages/default-setup/tests/fixtures/seed-parity/` — the last of which sits in the same tree as the
code being renamed, and would become fixtures-of-fixtures. `seed` is also correct for what it names:
content a pack ships to start a user's database. The collision this goal removes is noun-vs-verb, which
Decisions 1 and 3 close completely, so renaming the noun would be ~220 further files spent on a problem
already solved.

**1. `seed` is a noun. The verb is `import`, and each importer's name says its scope.**
Three functions import seeds, in a caller relationship, and they must not collapse onto one name:

| Name | Package | What it does |
|---|---|---|
| `importCompiledSeeds({ compiledDir, … })` | `@abuddy/sdk/utils` | runs the registered seeders over one already-compiled directory |
| `importPackSeeds(packs, …)` | `@abuddy/host` | orchestrates that across packs at boot |
| `importSeeds({ keys?, mode? })` | `@abuddy/testing/harness` | compiles the pack's seed entries, then imports them |

The harness takes the plain name: it is the one pack authors call, `abuddy init` scaffolds it, and it
sits beside the harness's existing `importFlows`. The SDK primitive says `Compiled` because that is the
precondition distinguishing it — its first parameter is `compiledDir`, and only the harness function
compiles (`harness.ts:389` calls the primitive).

Otherwise: an identifier that names the content, its identity, its shape or its configuration keeps
`seed`. One that names the act, what it needs, or what it produces, uses `import`.
This finishes the migration `ImportMode` began.

**2. The manifest keys stay, on merit.**
`boot.seed`, `seedFormats`, `seedHooks` and `seedPolicy` are all nouns and all correct under Decision 1.
They are not being kept for compatibility — there is none to keep — but because renaming a correct name
is churn. The entry-level `seeder` field stays for the same reason; only its description changes, to
name the method Decision 4 renames.

**3. A guard makes the split checkable.**
A rule people must remember is not a guard. Add a spec: **no function or method whose return type is
`ImportCounts` has a name beginning with `seed`.** That is exactly the collision this goal removes, it
needs no exception list, and it permits both `importSeeds()` and `Seeder.apply()`. It guards the
property, not any deleted identifier.

**4. `Seeder.seed(ctx)` becomes `Seeder.apply(ctx)`.**
A `Seeder` is the mechanism and stays a noun. Its method performs the import. `import` is legal as a
method name but is a keyword elsewhere and confuses some tooling; `apply` is the conventional name for
running a mechanism and satisfies Decision 3.

**5. Name the axis that distinguishes.**
`seedHashes` → `builtInSeedHashes`, `packSeedHashes` → `externalSeedHashes`,
`seedStatFingerprints` → `builtInSeedFingerprints`, `packSeedDeps` → `externalSeedDeps`. These are
persisted, so the rename travels with a migration.

**6. The stages are documented where pack authors and agents read.**
`docs/public-facing/seeds.md` and `packages/abuddy-sdk/CLAUDE.md` gain a paragraph naming
author → compile → import → record and which vocabulary belongs to each, including the sentence that
separates the two things this session conflated: re-recording the seed golden is a fixture of the import
stage's output and changes no user data; what changes user data is a new `sourceHash`, from compile.

**7. The parity golden is not seed data, and its scripts stop implying it is.**
Three things carry the word today, and only two of them are seeds:

| | What | Where |
|---|---|---|
| A. Runtime seed data | the pack's shipped content | `packages/default-setup/src/seeds/` → `dist/*.seed.json` → the user's database |
| B. Fixture seed data | synthetic sources giving the parity test stable input | `packages/default-setup/tests/fixtures/seed-parity/`, `dependent-pack/` |
| C. The parity golden | a recording of what importing A and B produces | `tests/unit/seed-parity/__golden__/default-setup.json` |

A and B are the same kind of thing and both keep `seed`. C is a test expectation, not seed data, and
`seed-golden:*` names it as though it were a kind of seed. Rename to `seed-parity:check` and
`seed-parity:update`: the artifact is the parity golden, and matching the test directory means the
failing spec (`tests/unit/seed-parity/seed-parity.spec.ts`) names its own fix.

This is also the distinction the docs in Decision 6 have to draw. Re-recording the golden rewrites a
test expectation and changes no user data; what changes user data is a new `sourceHash`, from compile.

**8. The `@abuddy/ears` homonym goes too.**
`QxSeed` names the starting set of a query — a real and separate meaning, in a package that sits below
the SDK and has no pack-seed concept. "It is a different package" is exactly the reasoning that let
`seed` mean four things, so it is not a reason to keep a second meaning after this goal. Rename to
`QxStart`, which says what it is; the parameter `untypedQx(seed?)` becomes `start`, and the three
"Seeded …" doc comments follow. `runtime.ts` and `typed.ts` are change-controlled
(`packages/abuddy-sdk/TYPED-EARS.md`), but these are comment-only edits there.

## Phases

### Phase 1 — Give the act its own word

- Rename, across `packages/`, `scripts/`, `tests/` and `docs/` (not `docs/archive/`):
  `importCompiledSeeds` → `importCompiledSeeds`, `importPackSeeds` → `importPackSeeds`, `shouldImportAll` → `shouldImportAll`,
  `ImportCounts` → `ImportCounts`, `ImportContext` → `ImportContext`, `seedPackId` → `seedPackId`
  (it reads a pack id *from* the seeds; the `-ing` was the verb leaking in).
- `Seeder.seed(ctx)` → `Seeder.apply(ctx)` (Decision 4): the interface in `utils/seed.ts:27`, the two
  implementations (`seed/seeder.ts:109`, `seed/flow-seeder.ts:70`), the call site (`utils/seed.ts:73`),
  default-setup's hand-written settings seeder (`src/seeds/settings/seeder.ts:9`), and the `Seeder`
  object literals in the host and SDK specs.
- `manifest-schema.ts:100`: the `seeder` field's description names `apply(ctx)`, not `seed(ctx)`. Run
  `npm run schema:update -w @abuddy/sdk`.
- `generate-entries.ts:1377,1386-1388`: the emitted import and re-exports in `seeders.ts` follow the new
  names. Run `npm run compile` to regenerate default-setup.
- `@abuddy/testing`: `importSeeds()` → `importSeeds()` (Decision 1), `ImportOptions` → `ImportOptions`
  (`src/harness.ts:354,364`), the CLI's `init` template (`commands/init.ts:259,269`),
  `docs/public-facing/testing.md` and `packages/abuddy-testing/CLAUDE.md`. This is the name pack authors
  see first, so it moves with the rest rather than later.
- `@abuddy/host`: `PackImportFailure` → `PackImportFailure` and `importErrors()` → `importErrors()`
  (`src/packs/runtime/seed.ts:49,54`, re-exported from `runtime/index.ts:14`); the `seed` parameter of
  `importPackSeeds(packs, seed)` becomes `importCompiledSeeds`.
- Test-local verb forms follow the rule rather than being left as the one place it does not hold:
  `seedAll` → `importAll`, `wipeSeed` → `wipeImport`, `seedFn` → `applyFn`, `unseedable` → `failsImport`.
- User-visible strings: `logger.info('Seeding data for pack: …')`
  (`abuddy-host/src/packs/runtime/seed.ts:119`) reads "Importing seeds for pack: …".
- `npm run api:update` and commit `etc/`.

**Done when:** `npm run typecheck`; `npm test -w @abuddy/sdk`, `-w @abuddy/host`, `-w @app/default-setup`;
`npm run schema:check -w @abuddy/sdk` and `npm run api:check` clean; `grep -rn` finds none of the six
renamed identifiers or `Seeder.seed` outside `docs/archive/`.

### Phase 2 — Make the split checkable

- Add a spec (beside the SDK's other boundary specs, e.g. `packages/abuddy-sdk/tests/`) implementing
  Decision 3: walk the SDK's and host's sources, find every function and method whose declared return
  type is `ImportCounts`, and fail if any name begins with `seed`.
- Give it a doc comment saying what property it holds and why — the noun/verb collision, not the old
  names.

**Done when:** the spec passes. **Mutation:** renaming `importSeeds` back to `importCompiledSeeds` fails it; adding
a new `seedFoo(): ImportCounts` fails it.

### Phase 3 — Name the axis in `AppState`

- Rename the four fields per Decision 5 in `packages/abuddy-host/src/app-state/`, its `APP_STATE_FIELDS`
  list, and every reader (the host's seeding, the pack installer, the migrations runner, specs).
- Add the field moves to `packages/abuddy-host/src/migrations/app/0.3.15.ts` — the latest unreleased
  target, which already has entries. Do **not** create a new version file. Guard each move so it is
  idempotent: the migration runs again on every development boot, on each beta of its release, and after
  a reset.

**Done when:** `npm test -w @abuddy/host` and `-w @app/api` pass; a row written with the old field names
is moved by the migration and reads back under the new ones; running the migration twice changes nothing
the second time. **Mutation:** dropping the guard makes the idempotence case fail.

### Phase 4 — Write the stages down

- `docs/public-facing/seeds.md`: the four-stage paragraph from Decision 6, near the top, before the
  entry fields.
- `packages/abuddy-sdk/CLAUDE.md`: the same split in its `seed/` and `utils/` entries, so an agent
  reading the package map sees which vocabulary is which.
- Root `CLAUDE.md`: one line in the seed-source row of "What to run after a change" pointing at the
  stage split, since that row is where the golden-vs-user-data confusion surfaces.

- Rename the scripts per Decision 7: `seed-golden:check`/`seed-golden:update` become
  `seed-parity:check`/`seed-parity:update` in `packages/default-setup/package.json`, and every reference
  follows — root `CLAUDE.md` (the commands block and the seed-source row of "What to run after a
  change"), `packages/default-setup/CLAUDE.md`, and the header comment of
  `tests/unit/seed-parity/seed-parity.spec.ts`.

**Done when:** all three docs name author → compile → import → record and say which words belong to each;
the sentence separating the parity golden from user data appears in `seeds.md`; `npm run
seed-parity:check -w @app/default-setup` runs and `grep -rn seed-golden` finds nothing outside
`docs/archive/`.

### Phase 5 — The query seed in `@abuddy/ears`

- Per Decision 8: `QxSeed` → `QxStart` (`src/query.ts:26`), exported from `src/index.ts:11`; the
  parameter of `untypedQx(seed?: QxSeed)` becomes `start`; the "Seeded …" doc comments in
  `query.ts:280`, `runtime.ts:166` and `typed.ts:37` say "Starting from …".
- `npm run api:update -w @abuddy/ears` and commit `etc/index.api.md`.

Lands independently of Phases 1–4: it is a different package and shares no file with them.

**Done when:** `npm run typecheck:ears`; `npm test -w @abuddy/ears`; `npm run api:check -w @abuddy/ears`
clean; `grep -rn QxSeed` finds nothing outside `docs/archive/`; the typed-EARS completions checklist in
`packages/abuddy-sdk/TYPED-EARS.md` is run, since `runtime.ts` and `typed.ts` were touched.

## Deferred

- **Merging `builtInSeedHashes` and `externalSeedHashes` into one field.** They have identical type and
  purpose and differ only in retention — the external one is kept when a pack is uninstalled. Merging
  needs that retention rule re-expressed and is a data change, not a naming one. Out of scope.
- **Renaming `seed-parity`/`seed-golden`** (Decision 7).
- **`sourceHash`'s scope.** It hashes the compiled bundle, which is why editing an inlined `_helpers/`
  file re-hashed 47 of 62 golden rows in this session. Whether the golden should assert hash *values* at
  all is a test-design question, tracked separately, not a vocabulary one.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request;
- no publishing, releases or triggered workflows;
- no real data dirs, no broad pkill, E2E in the `abuddy-test` namespace;
- preload, example pack and release metadata rules;
- typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`);
- published packages: no `any`, the TypeScript floor, `api:update` after export changes with `etc/`
  committed;
- build order: `packages:build` before the CLI suite, `npm run compile` before the api suites and E2E;
- migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`, and 0.3.15 is the target;
- investigate failing tests, mutation-check new guards;
- run the narrowest check that could fail during the work, and the full chain once per phase at its end.
