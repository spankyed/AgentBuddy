# Goal: names that state their contract, and checks that keep them doing it

> **Written in session** `23ab84ee-4c28-4dde-8ea9-641d6aa004cd` (Claude Code, 2026-09-19). Resume it with
> `claude -r 23ab84ee-4c28-4dde-8ea9-641d6aa004cd`.

```
# Goal: names that state their contract, and checks that keep them doing it

Implement docs/goals/goal-naming-conventions.md on a branch cut from master. Read Background, Decisions,
Phases and Constraints first. Decisions are final: implement them, don't reopen them or stop to ask.

Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations. Nothing here is stored user data.

Finished when:
- Phases 1-7 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- The root CLAUDE.md has a "Naming" section stating the conventions, and each convention that can be
  checked has a spec that fails on a new violation rather than on a retired word.
- No exported function named `get*` has a return type including `null` or `undefined`.
- No pair of exported functions differs only in what it does when the thing is absent: each is one
  function whose result says which case happened.
- `Context` names an XState machine's context and nothing else, and no module exports a bare `Context`.
- No exported type ends in `Info`, `Manager`, `Helper` or `Util`. `Data` ends only the payload types of a
  plugin's CLIENT_CONNECTED event, and every plugin that sends one uses it.
- `npm run typecheck`, `npm run test:unit`, `npm run schema:check -w @abuddy/sdk`, `npm run api:update`
  (and the committed `etc/`), `npm run facade:check -w @app/default-setup`, `npm run build`,
  `npm run test:external-pack`, `npm run test:packaged-authoring`.
- A final summary: phase -> done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green - not once at the end. A phase is
  landable on its own; a commit is how that stays true. Conventional message, no Co-Authored-By or
  session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- write a check that bans a retired word. Every check here is an invariant over new code (a `get*` that
  can return nothing, a bare exported `Context`), never a list of names nobody may type. The pack-naming
  goal's ban-list guards were deleted for that reason.
- rename `qx`, `tx`, `EARS`, `fe`/`be`, `sourceHandle` (Vue Flow's own term) or the `@abuddy/source`
  condition. See Deferred.
```

## Background (2026-09-19, at `c494b7d05`)

The pack-naming goal (`docs/archive/goals/goal-pack-naming.md`) removed four words that each named two
things: `registry` for a file and a wire route, `bundle` as a noun, `artifact` for a dependency's resolved
files, and `contributions` outright. It fixed instances. It produced no written convention, and the guard
that kept its words retired was deleted afterwards as a ban-list that had served its purpose
(`cf4490213`, `acf10618a`).

So the rules exist only inside an archived goal, and nothing states them for code written next. A survey of
the tree at this commit:

**No naming convention is written down anywhere.** `git grep -licE "naming convention|naming rule"` over
`*.md` outside `docs/archive` returns `docs/goals/README.md` (which is about naming goal *files*) and
`docs/reference/track-layout.md`. The root `CLAUDE.md` has sections for layering, imports, migrations and
what to run after a change, and none for naming.

**The retrieval verbs do not encode their contract.** Exported functions by prefix: `get` 75, `resolve` 19,
`load` 18, `read` 12, `find` 11, `fetch` 4, `list` 4. Of those with annotated return types, **16 of 68
`get*` return `null` or `undefined`** — for example `getDslTypeFromPath`
(`packages/abuddy-ui/src/components/monaco-config.ts:249`), `getFlowActor`
(`packages/default-setup/src/features/brain/be/flow-system.ts:30`) and two different `getHandle`s
(`.../claude-code/handle-store.ts:25`, `.../codex/handle-store.ts:29`). A caller cannot tell from `get`
whether to null-check, which is the one thing the verb could have told them.

**A name that hides what absence costs shipped this month.** `readInstalledPacks` returns `[]` for a
missing or unparseable record; `readInstalledPacksRecord` returns `null`
(`packages/abuddy-host/src/packs/installed-packs.ts:53,69`). Using the first where deletion follows
destroys an interrupted install's only copy, which is the bug fixed in `e007d8021`. The dangerous one has
the shorter name and is what autocomplete offers first. `_processIsRunning` and `_writerIsRunning`
(`packages/abuddy-sdk/src/env/process-liveness.ts:19,78`) have the same shape: picking wrong means either
two writers on the database or a refused boot, and neither name says so.

**`Context` names at least three unrelated concepts.** 36 exported `*Context` types. An XState machine's
context (`FlowsContext`, `BrainContext`, `ThreadsContext`, …), a bundle of arguments passed to a function
(`SeedCompileContext` `abuddy-sdk/src/build/seeds/records.ts:33`, `StepCompileContext` and
`StepValidationContext` `abuddy-sdk/src/steps/types.ts:14,37`, `SeederContext`
`abuddy-sdk/src/utils/seed.ts:18`, `CompilationContext` `abuddy-sdk/src/build/seed-compiler.ts:20`,
`ExecutionContext` `abuddy-sdk/src/steps/types.ts:142`, `DescriptorContext`
`abuddy-ui/src/components/node-dimensions.ts:27`, `DbScriptContext`
`abuddy-cli/src/commands/db/script.ts:44`, two `ConsumerContext`s), the app's environment (`AppContext`,
from `resolveAppContext`), and Playwright's `BrowserContext`.

**`Context` is exported bare from 15 modules** — 14 in default-setup's `code` feature (`be/system.ts:67`,
`be/features/*.ts`, `fe/state.ts:74`, `fe/features/*/state.ts`) and one in the API router
(`packages/api/src/core/router/context.ts:7`). `import type { Context } from './state'` carries no
information, and two of them cannot be discussed in the same sentence.

**`Info` does no work; `Data` is a convention kept 60% of the time.** 26 exported `*Info` types and 25
`*Data`. `FileInfo`, `SessionInfo`, `TaskInfo`, `SkillInfo`, `TerminalInfo`, `AgentInfo`, `ChunkInfo`,
`SecretInfo` and `PersonalInfo` would lose nothing by dropping the suffix. Meanwhile `<Feature>ConnectedData`
is a real pattern for the payload of a plugin's `CLIENT_CONNECTED` — `ThreadConnectedData`,
`FlowsConnectedData`, `NotesConnectedData`, `PromptsConnectedData`, `AgentConnectedData`,
`CodeConnectedData` — but only six exist for the ten features whose systems send one. A pattern followed
six times in ten is unreliable in both directions.

**Four types describe a pack at four lifecycle stages and three of them say `Info`.**
`BuiltInPackBuildInfo` (`abuddy-host/src/build/discover.ts:4`), `BuiltInPackInfo`
(`abuddy-host/src/packs/pack-discovery.ts:14`), `PackInfo`
(`abuddy-host/src/packs/pack-registration.ts:63`) and `LoadedPack`
(`abuddy-host/src/packs/runtime/loaded-packs.ts:12`). The stages are real and useful; the names hide them
behind a filler word, and only the last one names its stage.

**`source` is one sense in compounds and three senses bare.** ~707 occurrences. The compounds are
consistent — `sourceHandle` (146, Vue Flow's edge endpoint), `sourceId` (56, an EARS relation's origin),
`sourceEntity` (49), `sourceHash` (93, the text a seed record compiled from), `sourcePath` (42, a backup
copy's origin), `sourceTab` (70), `sourceThreadId` (34) — each naming the origin of the thing the compound
names. The bare fields are not: in the pack install path alone, `installPack(slug, source?)`
(`abuddy-host/src/packs/pack-installer.ts:324`) takes a kind, `installPackFromLocal(source)`
(`:228`) takes a path, and `PackIntegrity.source` (`abuddy-host/src/packs/pack-layout.ts:49`) is git
provenance. The pack-naming goal's Open items recorded the last two as senses it did not reach.

## Decisions

Final.

1. **The verb states the contract.** `find` may return nothing and its return type says so. `get` returns
   the thing or throws. `read` reads from disk, `load` imports or executes, `resolve` computes an answer
   from inputs, `fetch` crosses the network, `list` returns a collection. A `get*` that can come back empty
   is renamed `find*`; it is never fixed by widening the return type.

2. **Two functions that differ only in what absence means become one.** Where the choice between them is
   the difference between correct behaviour and data loss, the caller must not be able to express it by
   picking a shorter name. One function returns a result that says which case happened
   (`{ found: true; … } | { found: false }`), and every caller handles both.

3. **`Context` belongs to XState.** A machine's context keeps the name. A bundle of arguments passed to a
   function is `*Args`. A resolved environment is `*Env`. A set of ambient values a subsystem reads is
   `*Scope`.

4. **No module exports a bare `Context`.** A type's name is qualified by what owns it
   (`CodeSearchContext`, `CodeTerminalContext`), so two of them can appear in one file and one sentence.

5. **`Info`, `Manager`, `Helper` and `Util` are banned as type-name suffixes.** Name the thing, or name its
   stage. The four pack types become stage names: `DiscoveredBuiltInPack` (build-time discovery),
   `BuiltInPack` (boot discovery), `RegisteredPack` (in the registry) and `LoadedPack` (runtime, unchanged).

6. **`Data` has exactly one meaning and is complete.** It ends the payload type of a plugin's
   `CLIENT_CONNECTED` event, named `<Feature>ConnectedData`, and every feature whose system sends one has
   it. Any other `*Data` type is renamed for what it holds.

7. **Every convention that can be checked is checked, and every check is an invariant.** A check states a
   property of code written next year ("no exported `get*` returns a nullable type"), never a list of words
   nobody may type. Ban-lists expire when a rename lands; invariants do not. Checks live with the suites
   that already police shape, not in a new top-level guard.

8. **Pack-facing types are renamed like everything else.** `StepCompileContext`, `StepValidationContext`,
   `StepDecompileContext`, `ExecutionContext`, `SeedHookContext`, `SeederContext` and `CompilationContext`
   are exported from `@abuddy/sdk` and appear in `etc/*.api.md` and default-setup's facade. No release has
   shipped them to anyone, so there is no surface to preserve: rename them, run `api:update` and
   `facade:update`, and follow the rename into the CLI's scaffold templates and the fixture packs. Carving
   out the published surface would leave `Context` meaning two things, which is the defect this goal
   exists to remove.

9. **`source` keeps its compounds and loses its bare fields.** Every compound names the same abstract
   sense, "the origin of X", disambiguated by what follows: `sourceHandle` and `sourceId` are a directed
   edge's origin, `sourcePath` a copy's, `sourceHash` the text a record compiled from, `sourceTab` and
   `sourceThreadId` a UI or thread origin. Those are correct and stay. What is not correct is a bare
   `source` field, which names the sense without saying of what — and the pack install path has three of
   them meaning different things: `installPack(slug, source?)` is a *kind* (`local` | `url` | a GitHub
   slug), `installPackFromLocal(source)` is a *path or archive*, and `PackIntegrity.source` is *git
   provenance* (`{ repo, commit }`). Those three get names; the compounds are left alone.

10. **The conventions are written in the root `CLAUDE.md`,** in a `## Naming` section, because that is the
   file every agent loads before writing code. The section states each rule in one line and names its check
   where one exists.

## Phases

### Phase 1 — write the conventions down

- Add `## Naming` to the root `CLAUDE.md`: Decisions 1-6 as one line each, with the check named beside any
  rule that has one (the checks arrive in later phases; the line says which spec will hold it).
- Say in that section what a naming check is and is not (Decision 7), citing the pack-naming ban-lists as
  the thing not to build again.

**Done when:** the section exists and each of Decisions 1-6 appears in it; `npm run test:unit` passes
unchanged. No code moves in this phase.

### Phase 2 — names that hide what absence costs

- Collapse `readInstalledPacks` / `readInstalledPacksRecord`
  (`packages/abuddy-host/src/packs/installed-packs.ts`) into one function returning a result that
  distinguishes "no readable record" from "the record lists nothing" (Decision 2). Migrate every caller;
  `packs/staging.ts` and `packs/pack-discovery.ts` are the two that must not conflate them.
- Do the same for `_processIsRunning` / `_writerIsRunning`
  (`packages/abuddy-sdk/src/env/process-liveness.ts`): one call whose argument names the policy, so the
  call site states which failure it is choosing rather than encoding it in which of two similar names was
  typed. Migrate `write-lock.ts`, `running.ts`, `staging.ts` and `readApiEndpoint`.
- `recoverStagingDirs(dir, installedIds?)` (`packages/abuddy-host/src/packs/staging.ts:54`) takes an
  explicit "known / not known" argument instead of an optional set, so an empty collection can no longer
  mean "nothing is installed" by accident. That optional parameter is the shape of the bug fixed in
  `e007d8021`, and it is still expressible.

**Done when:** no two exported functions in `packages/abuddy-host` or `packages/abuddy-sdk` differ only in
their absent-case behaviour; `packages/abuddy-host/tests/packs/staging.spec.ts`,
`tests/database/write-lock.spec.ts`, `tests/database/running-app.spec.ts` and
`packages/api/tests/unit/boot-recovery.spec.ts` pass; `npm run api:update` committed. Mutation: making the
new staging argument default to "known, empty" fails the two `boot-recovery` tests.

### Phase 3 — the verb states the contract

- Rename every exported `get*` whose return type includes `null` or `undefined` to `find*` (Decision 1),
  starting from the 16 the survey found, and migrate callers.
- Add the invariant to an existing shape suite (`packages/abuddy-host/tests/boundaries.spec.ts` or a
  sibling in the SDK): no exported function named `get*` has a nullable annotated return type, across
  `packages/*/src`.

**Done when:** the invariant spec passes over the whole tree; `npm run typecheck` and `npm run test:unit`
pass. Mutation: renaming one `find*` back to `get*` fails the spec, naming the file and the symbol.

### Phase 4 — `Context` names one thing

- Reclassify the non-XState `*Context` types per Decision 3, the published ones included (Decision 8).
- Qualify the 15 bare `Context` exports per Decision 4 — 14 in `packages/default-setup/src/features/code/`
  and `packages/api/src/core/router/context.ts:7`.
- Add the invariant: no module exports a type named exactly `Context`.

**Done when:** `Context` appears only as an XState machine's context or qualified by its owner; the
invariant spec passes; `npm run api:update` and `npm run facade:check -w @app/default-setup` are green. Mutation: exporting a bare `Context` from any module fails the spec.

### Phase 5 — `Info` goes, stages get named

- Remove the `Info`, `Manager`, `Helper` and `Util` suffixes (Decision 5), renaming the four pack lifecycle
  types to their stages.
- Add the invariant: no exported type name ends in `Info`, `Manager`, `Helper` or `Util`.

**Done when:** the invariant passes; the four pack types name their stage; `npm run api:update` committed.
Mutation: adding an `export interface FooInfo` anywhere under `packages/*/src` fails the spec.

### Phase 6 — `Data` means one thing, everywhere

- Give every feature whose system sends `CLIENT_CONNECTED` a `<Feature>ConnectedData` payload type
  (Decision 6); there are ten such systems and six such types today.
- Rename every other `*Data` type for what it holds.
- Add the invariant: an exported type ending in `Data` is named `<Feature>ConnectedData` and that feature's
  system sends a connected payload.

**Done when:** the invariant passes; `npm run test:unit` passes. Mutation: renaming one
`<Feature>ConnectedData` to `<Feature>Startup` fails the spec.

### Phase 7 — the bare `source` fields in the pack install path

- Name the three bare `source` fields per Decision 9, leaving every compound alone:
  - `installPack(packSlug, source?)` (`packages/abuddy-host/src/packs/pack-installer.ts:324`) and
    `INSTALL_PACK`'s `source` (`packages/abuddy-host/src/packs/runtime/packs-system.ts:20`) take a kind,
    not a location;
  - `installPackFromLocal(source, …)` (`pack-installer.ts:228`) takes a path or an archive;
  - `PackIntegrity.source` (`packages/abuddy-host/src/packs/pack-layout.ts:49`) is the git provenance
    `abuddy release` records, and is written into every pack's `integrity.json`.
- `PackIntegrity` is read by the installer, the updater and `abuddy release`; the field appears in the
  `.integrity.json` release asset, so rename it in the writer and every reader in the same change.
- Add the invariant: no exported interface has a field named exactly `source`.

**Done when:** the three fields are named for what they hold; the invariant passes; `npm run build`,
`npm run test:external-pack` and `npm run test:packaged-authoring` are green, the last two because they
build and install a pack through the path this phase renames. Mutation: adding a bare `source` field to an
exported interface fails the spec.

## Deferred

- **`qx`, `tx`, `EARS`, `fe`/`be`.** Established domain terms with documented meanings; the cost of
  changing them is every file and every pack author's memory, against no ambiguity.
- **`sourceHandle`.** Vue Flow's own API term. Renaming it would make our code disagree with the library's
  documentation.
- **The `@abuddy/source` condition.** A resolution contract named in every host config, in `package.json`
  exports maps, in `node --conditions` flags and in the CLI's resolve hooks. Out of scope here and recorded
  as deferred by the pack-naming goal.
- **Replacing the database write lock with an OS advisory lock.** A design change, not a naming one, and
  the reason most of `process-liveness.ts` exists. Tracked in that module's doc comment.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows.
- No real data dirs, no broad pkill, E2E in the `abuddy-test` namespace.
- Preload, example pack and release metadata rules.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any`, the TypeScript floor, `api:update` after export changes, and
  `facade:update` when default-setup's facade moves.
- Build order: `packages:build` before the CLI suite, default-setup's runtime before the api suites and
  E2E.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: keep the fixture packs, the example pack and `test:packaged-authoring`
  passing. A rename that reaches the CLI's scaffold templates must reach the fixtures too.
- Every check added here is an invariant over new code, never a ban-list of retired words (Decision 7).
