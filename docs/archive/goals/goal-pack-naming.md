> **Done** (2026-09-19) on `AS/external-pack-authoring`. All five phases landed. Open decision 1 was
> settled as A after the decision itself turned out to be mis-framed — see Corrections below.

> **Written in session** `b9ed13ae-1ac2-48e4-ae3d-6e96f091dbb1` (Claude Code, 2026-09-17), revised 2026-09-18 against the tree after `77f4c910a`, and again after `634f613f2` — every count below re-verified, two collisions added that the earlier passes could not have seen because the work that created them had not landed. Resume it with `claude -r b9ed13ae-1ac2-48e4-ae3d-6e96f091dbb1`.

```
# Goal: one word per concept in the pack vocabulary

Implement docs/goals/goal-pack-naming.md. Read Background, Rules, Decisions, Open decisions, Phases and
Constraints first. Open decisions 1 and 2 must be settled before Phases 3 and 4; if either is still marked
open when you reach its phase, stop and ask. Where another detail isn't specified, pick the conventional
option, note it in the final summary, and keep going.

This is a renaming goal: no behaviour changes, no new features, and **no backward-compatibility code**. No
pack built by anyone exists outside this repo, and no released app has shipped pack modularization, so
every name here is free to change outright. A rename that "also handles the old shape" is wrong.

Before adopting a candidate name, check what else already uses the word (`grep -rn` over packages/, docs/,
scripts/, excluding node_modules, dist/ and docs/archive). Two candidates in this goal's first draft were
already taken — see Decision 4 and Open decision 1. Moving a word onto another live word is not a fix.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard or test is mutation-checked.
- No retired name survives anywhere (code, tests, docs, scaffold templates, generated files), enforced by
  the guard in Phase 5 rather than by grepping once. Each phase also ends with its own grep, given in its
  "Done when": green tests do not show a rename is complete, because a name left in a doc, a comment, a
  spec title or a string literal still compiles and still passes.
- `source` names three things rather than five: the `@abuddy/source` condition, a log or error's origin,
  and the declaring pack inside `mergeRegistries`. An installed pack's origin is `installedFrom` and a
  dependency's is `resolvedFrom`.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`, `api:check` (ears, sdk, ui),
  `packages:build` + `packages:check`, `npm run compile`, `facade:check -w @app/default-setup`, and
  `npm run test:unit` pass.
- `npm run build`, the monorepo E2E, `npm run test:external-pack` and `npm run test:packaged-authoring`
  pass. Rebuild before E2E: `npm test` launches built output, not source (`tests/e2e/CLAUDE.md`).
- A final summary: phase → done, evidence, conventional choices.

Never:
- commit, stage, push or tag unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows.
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; run bare tsc on packages/preload; edit version/release metadata.
- add backward-compat shims, migrations, or "read either name" fallbacks.
- change behaviour while renaming. If a rename exposes a bug, note it and leave it; it isn't this goal's work.
```

## Background

Several words name two or more unrelated things. Counts are grep line-counts over `packages/`, `docs/` and
`scripts/`, excluding `node_modules`, `dist/` and `docs/archive`, verified 2026-09-18.

They are an inventory, not a measurement: this file is inside that scope and discusses every name it counts,
so each revision inflates its own numbers by a few. Use them to judge scale and to find call sites — not to
detect drift, and never as a phase's completion check. The completion check is the grep in each "Done when",
which reads zero or does not.

- **`registry` — four senses.**
  1. `createPackRegistry()` / `PackRegistry` / `PackRegistryView`: the in-process collection packs register
     into (71 / 46 / 27 refs), `packs/pack-registration.ts`.
  2. `pack-registry.json`: the on-disk record of installed external packs — `PackRegistryEntry` (15),
     `readPackRegistry` (30), `writePackRegistry` (15), `modifyRegistry` (21), `addToRegistry` (14),
     `removeFromRegistry` (4), `reconcileExternalRegistry` (12), `AppContext.registryFile` (17), and the
     entry field `registeredAt` (21). Owned by `packs/pack-registry.ts` — except `reconcileExternalRegistry`,
     which lives in `packs/pack-discovery.ts:86`.
  3. `packs.registry`: the tRPC route serving the **loaded-packs list over the wire**
     (`api/src/core/router/packs-router.ts`, from `getPackBundleEntries()`), with `registryError` (8) and the
     renderer's `registryQuery`.
  4. `resolveFromRegistry`: a remote package registry (`cli/src/commands/install.ts:17`, still the
     always-throws stub), 2 refs in code.

  Senses 1 and 2 interact, so the docs disambiguate them in prose; sense 4 is the industry meaning that
  sense 2 fights.
- **`bundle` — a noun and a verb.** Noun: the verified, checksummed shippable layout — `BUNDLE_PATHS` (64
  lines / 74 occurrences), `verifyBundle` (28), `stageBundle` (24), `extractBundleArchive` (16),
  `createBundleArchive` (14), `BUNDLE_FORMAT_VERSION` (13), `bundle.json`. Verb: run esbuild/Vite —
  `bundleFile`, `bundlePackFE`, `bundlePackRuntime`, `bundlePackStepBuild`, `bundlePackSeedCompilers`,
  `bundlePackFlowHelpers(Module)`, `bundlePackSeedRuntime`, `bundlePackTypes`, `bundleDeclarations`,
  `bundleDslDefs`, and the `fe.bundleUi` flag. `buildPackBundle` (`cli/src/build/be-bundler.ts:22`) reads as
  "build the bundle" but is the shared esbuild setup.
- **`snapshot` — one misnomer among correct uses.** `PackSnapshot` (59) / `snapshot.json` (67) /
  `depSnapshots` (62) hold `types`, `defs`, `manifest`, `sdkVersion`, `typesFormat`, `provenance` and
  `flowHelpers`: what a dependent compiles against, which is not a point in time. Every other use *is*
  point-in-time and correct — xstate's `getSnapshot`, `_threadSnapshot`, `secretsSnapshot` (14), and the LMDB
  store's `snapshot(partition, targetDir)` added 2026-09-17.
- **`host` — the app vs the machine.** The app: `@abuddy/host`, `HostRuntime`, `hostVersion`, `host-packs/`.
  The machine: `db-write.lock`'s `host: os.hostname()` (`database/write-lock.ts:73`, read at `:49` and
  `database/running.ts:39`), and `SingletonLock`'s `<host>-<pid>`.
- **`artifact` — one build-sense survivor.** Two senses were retired on 2026-09-17 (the published build
  output of built-in packs, and `PackSeedManifest.artifacts` → `seedKeys`). What remains is
  `resolveDepArtifacts` (`cli/src/commands/fetch-deps.ts:392`, 25 refs) with `DepArtifacts` (17) and
  `findDepArtifacts` (7): a dependency's resolved files, not a pack's first-class artifacts.

- **`source` — five senses, and the newest is four days old.** This is now the largest collision in the
  tree and the only one this goal had not recorded.
  1. The `@abuddy/source` export condition — 176 refs across host tsconfigs, Vite/Vitest configs, esbuild
     and `node --conditions`. A published resolution contract; effectively immovable.
  2. A pack's install origin: `InstalledPack.source` (`github:owner/repo@tag`), read by the updater.
  3. A log or error's origin: `createLogger(source)`, `reportError({ source })`.
  4. The declaring pack, in `mergeRegistries`' `{ value, source }` registry entries and `valueSources`.
  5. Where a dependency resolved from: `DepArtifacts.source` (`workspace`, `file:…`, `installed app (env)`,
     `github:…`), added 2026-09-18 in `516487a5d` to give a facade failure an actionable remedy.

  Bare `source` is 1020 occurrences. Senses 1 and 3 are conventional and stay; 2 and 5 are small, and each
  sits inside a rename this goal already makes, so they are qualified there rather than in a phase of their
  own (Phases 1 and 4). Sense 4 is local to one function and reads correctly in place.
- **`diagnostic` — checked, and accepted.** `severity: 'diagnostic'` on a `SYSTEM_ERROR` (7 refs, added
  2026-09-18 in `4311bf8ef`) sits beside TypeScript's `Diagnostic`/`getSemanticDiagnostics` in the build
  scripts (35 refs). Both are qualified by context — one is a severity value on a runtime event, the other a
  compiler type in tooling — and rule 5 asks for qualification, not a unique word. Recorded here as a worked
  example for the naming doc rather than renamed.

  It is also the second name added *while this goal sat open* that its own "check the word first" rule would
  have caught. That is the argument for landing the phases sooner rather than widening them.

**Two words that look free and are not** — checked 2026-09-18, and the reason this goal's prompt now carries
a "check the word first" instruction:

- **`contract` already has five senses**, one added this month: the typed-EARS change-controlled contract;
  the host-service contract types in `@abuddy/sdk/services`; the pack entry contract; the black-box specs in
  `abuddy-ears/tests/contract/`; and, since `70c30d4e2`/`ee18e48d4`, a **Vue component's public API report**
  (`scripts/component-contracts.ts`, `componentContracts()`, `abuddy-ui/etc/*.component.md`, described in
  `abuddy-ui/CLAUDE.md` as "component contract reports"). Bare `contract` is 155 occurrences.
- **`contributions` and `extensions` are both live umbrella words.** `@abuddy/sdk/fe/contributions` is a
  published export and `PackContributionsView` the runtime type; meanwhile `docs/public-facing/extensions.md`
  is titled *"Extensions — Steps, Artifacts, Blocks & FE Extension Points"* and is the user-facing umbrella.
  Swapping the directory from one to the other trades synonyms rather than removing a collision.

**Why now:** the user is the only user, on 0.3.14, and no pack built against the modular SDK exists outside
this repo. Every name below — files in a data directory and paths inside a pack bundle included — can change
outright. That will not be true later.

## Rules

The renames follow five rules. Prefer the rule over the table when they disagree.

1. **One word per pack lifecycle stage, and no word in two stages.** A pack is authored → built → staged →
   archived → installed → loaded → registered → active. *loaded*, *registered* and *active* are already right.
2. **A word is a noun or a verb here, never both.** `bundle` is the industry verb for esbuild/Vite, so it is
   only ever that; the thing it used to name becomes the pack's layout/archive.
3. **`registry` is a live in-process collection things register into — never a file, never a wire route.**
   The remote sense is qualified (`resolveFromRemoteRegistry`). `stepRegistry`, `artifactRegistry`,
   `blockRegistry`, `seedHookRegistry` and `tiptapPluginRegistry` keep the word; the docs stop calling them
   "lookups" so prose and code agree.
4. **`host` is the app; `machine` is the computer.**
5. **A borrowed generic word is qualified by what it is *of*; if it describes *when* rather than *what*, it is
   the wrong word.** This is why `PackSnapshot` is a misnomer — and, given no free replacement was found,
   also why it stays for now (Decision 4).

## Decisions

Final.

**Decision 1 — every name below changes outright, with no compatibility handling.** No pack built against the
modular SDK exists outside this repo and no released app has shipped pack modularization, so there is no old
shape to read, no file to migrate and no alias to keep.

**Decision 2 — the pack's integrity file follows the layout rename.** `bundle.json` becomes `integrity.json`,
and the release asset the updater reads (`.bundle.json`, written at `cli/src/commands/release.ts:196`, read at
`packs/pack-updater.ts:64`) becomes `.integrity.json`. No published release carries the old asset.

**Decision 3 — the in-process registry keeps the word.** `createPackRegistry`, `PackRegistry`,
`PackRegistryView`, `registerPack` and the per-kind `*Registry` lookups are unchanged; the on-disk record, the
wire route and the remote sense move (rule 3).

**Decision 4 — `PackSnapshot` is not renamed in this goal.** It is a misnomer by rule 5, but `contract` is
taken five times over and `descriptor` is taken too (50 refs), and no candidate was found that is clearly
better than the name it would replace. Its cost is also the highest here — every pack's `dist/`, every
dependent's resolution path, and the published `@abuddy/sdk/build` API. Renaming `store.snapshot` → `copyTo`
(Phase 4) leaves `snapshot` meaning point-in-time everywhere except this one type, which is a tolerable end
state. Reopen only with a replacement word checked against the tree first.

## Open decisions (settle with the user)

**1. The umbrella word for a pack's contributions — before Phase 3.** `packages/default-setup/src/extensions/`
holds `artifacts/`, `blocks/`, `steps/` and `tiptap/` (there is no `services/`; that is only what the CLI
scaffolds), plus `Welcome.vue` at its root, registered as `fe.appExtensions.welcome`. Both candidate words are
live: `extensions` is the public-facing umbrella, `contributions` the internal one.
- **A.** Keep `src/extensions/` and fix only the odd one out: move `Welcome.vue` to `src/extensions/app/`, so
  the directory's root holds kind-folders and nothing else. Smallest change; leaves two umbrella words in the
  codebase, each dominant in its own audience.
- **B.** Pick one umbrella word repo-wide and move everything to it — the directory, the public doc's title,
  `@abuddy/sdk/fe/contributions`, `PackContributionsView`, the CLI scaffold and the tsconfig path aliases.
  Removes the synonym pair; much larger, and changes a published SDK export.
— *open*

**2. The `seedKeys` rebuild guard — before Phase 4.** `orchestrateDeclarativeSeed` throws `Pack "<id>" was
built with an older @abuddy/cli (its seed manifest has no seedKeys): rebuild it with the current one` when a
seed manifest lacks `seedKeys`. No bundle predating that field exists outside this repo, so by Decision 1 it
is compatibility code.
- **A.** Remove it and its spec (`abuddy-host/tests/packs/runtime/seed.spec.ts`).
- **B.** Keep it, reworded as a stale-build check that doesn't mention an older CLI.

  *Evidence against B, from the one real staleness incident (2026-09-17):* the guard did **not** fire, because
  the stale half was the API bundle *reading* the field, not the manifest carrying it. Old code cannot contain
  a new guard, so it only covers the direction that didn't happen.
— *open*

## Phases

Each phase is landable on its own and leaves every check green.

### Phase 1 — installed packs are not a registry
- `packs/pack-registry.ts` → `packs/installed-packs.ts`. `PackRegistryEntry` → `InstalledPack`;
  `readPackRegistry` → `readInstalledPacks`; `writePackRegistry` → `writeInstalledPacks`; `modifyRegistry` →
  `updateInstalledPacks`; `addToRegistry` → `addInstalledPack`; `removeFromRegistry` → `removeInstalledPack`;
  the entry's `registeredAt` → `installedAt`, and its `source` → `installedFrom` (one of the five senses of
  `source`; the field names where the pack came from, and `InstalledPack.installedFrom` says so without the
  word). Callers: `pack-updater.ts`, `packs-system.ts`, `pack-installer.ts` and their specs.
- `reconcileExternalRegistry` → `reconcileInstalledPacks`, **in `packs/pack-discovery.ts`** — it does not live
  in the module being renamed, so this is a cross-file change.
- `AppContext.registryFile` → `installedPacksFile` (`@abuddy/sdk/env`, published — `api:update`), and the file
  `pack-registry.json` → `installed-packs.json`.
- The wire route (sense 3): `packs.registry` → `packs.loaded`, with `registryError` → `loadedPacksError` and
  the renderer's `registryQuery` following. It serves `getPackBundleEntries()`, which is the loaded packs, not
  any registry.
- Unchanged by Decision 3: `createPackRegistry`, `PackRegistry`, `PackRegistryView`, `registerPack`, and the
  per-kind `*Registry` lookups.
- **No migration.** A development data dir holding the old file simply has no installed-packs record;
  `reconcileInstalledPacks` re-adds the packs it finds in `packs/` as enabled at the next boot, which is what
  it already does for a pack it has never seen. Each entry's `source` and update-check cache is lost.

**Done when:** `registry` names only the in-process collection and the remote stub; a temp-data-dir test shows
a data dir with no `installed-packs.json` coming up with its packs enabled. Mechanically:
`grep -rn 'PackRegistryEntry\|readPackRegistry\|writePackRegistry\|modifyRegistry\|addToRegistry\|removeFromRegistry\|reconcileExternalRegistry\|registryFile\|registeredAt' packages/ scripts/ docs/`
returns nothing outside `docs/archive`.

### Phase 2 — `bundle` becomes only a verb
- `BUNDLE_PATHS` → `PACK_LAYOUT`; `BUNDLE_FORMAT_VERSION` → `PACK_LAYOUT_VERSION`; `stageBundle` →
  `stagePack`; `verifyBundle` → `verifyPack`; `createBundleArchive` → `createPackArchive`;
  `extractBundleArchive` → `extractPackArchive`; `bundleArchiveName` → `packArchiveName`.
- `bundle.json` → `integrity.json` (Decision 2), `PACK_LAYOUT.info` → `PACK_LAYOUT.integrity`, and
  `readBundleInfo`/`BundleInfo` → `readPackIntegrity`/`PackIntegrity`.
- The ambiguous verb: `buildPackBundle` → `bundlePackSource`.
- Noun leftovers to follow: `isBundleDir`, `hasBuiltBundleSections`, `getPackBundleEntries`, `PackBundleEntry`,
  `bundleDir`. (`PackBundleEntry` is the payload of the route Phase 1 renames, so the two phases meet here;
  either order works.)
- Everything else keeps `bundle` as a verb, including `bundleDeclarations`, `bundleDslDefs` and the manifest
  key `fe.bundleUi`.

**Done when:** `bundle` appears only as a verb or in a bundler's own vocabulary; `abuddy pack` still produces
an archive that `abuddy install` verifies, proven by the existing round-trip tests. Mechanically: every
`grep -rn` for a retired noun (`BUNDLE_PATHS`, `BUNDLE_FORMAT_VERSION`, `verifyBundle`, `stageBundle`,
`readBundleInfo`, `BundleInfo`, `isBundleDir`, `hasBuiltBundleSections`, `getPackBundleEntries`,
`PackBundleEntry`, `buildPackBundle`, `bundleArchiveName`, `createBundleArchive`, `extractBundleArchive`)
returns nothing outside `docs/archive`.

### Phase 3 — the umbrella's odd one out
Scope depends on Open decision 1. Under **A** (the smaller path):
- Move `packages/default-setup/src/extensions/Welcome.vue` → `src/extensions/app/Welcome.vue`, with
  `abuddy.json`'s `fe.appExtensions.welcome` path and the regenerated `pack-entry-fe.ts` import following.
- Leave the directory, the public doc and the SDK export alone; record in `default-setup/CLAUDE.md` that the
  root of `src/extensions/` holds kind-folders only.

Under **B**, add: the directory rename; the four CLI scaffold sites (`cli/src/commands/init.ts:23`,
`add/manifest.ts:21`, `add/step.ts:159`, `add/service.ts:53`); the tsconfig path aliases `@/extensions/*`
(`default-setup/tsconfig.json:19`, `tsconfig.test.json:7`); the CLI specs that hard-code the path
(`tests/cli/add-extensions.spec.ts`, ~15 lines; `tests/cli/scaffold.spec.ts:90`;
`tests/build/trigger-track-helpers.spec.ts:22`; `tests/build/import-specifiers.spec.ts:281`); the external
pack fixture's generated flow helpers; and the public docs (`extensions.md` including its title, `cli.md`,
`manifest.md`, `seeds.md`, `services-and-data.md`).

**Done when:** the root of the umbrella directory holds only kind-folders, and `abuddy init` followed by
`abuddy add step`/`add artifact`/`add service` scaffolds and builds.

### Phase 4 — the remaining single-sense fixes
- `resolveDepArtifacts` → `resolveDepFiles`, with `DepArtifacts` → `DepFiles`, **`ResolvedDepArtifacts` →
  `ResolvedDepFiles`** and `findDepArtifacts` → `findDepFiles` (`cli/src/commands/fetch-deps.ts`; callers in
  `commands/build.ts`, `commands/generate.ts` and `tests/packs/host-output.spec.ts`). `ResolvedDepArtifacts`
  postdates this goal's first pass — it was added in `516487a5d` — and a `grep` for `DepArtifacts` finds it,
  so leaving it out would leave the rename half-done while the greps read clean.
- `DepFiles.source` → `resolvedFrom`, the fifth sense of `source`: the field records where a dependency
  resolved from, and only `generate-entries.ts`'s `facadeRemedy` reads it. Renamed here because the type it
  sits on is already changing.
- `store.snapshot(partition, targetDir)` → `store.copyTo(partition, targetDir)` (`@abuddy/ears/lmdb`,
  published — `api:update`; call site `abuddy-host/src/backup/index.ts:71`, and the ears store spec).
- `db-write.lock`'s `host` field → `machine`, with `findDatabaseWriter`'s "on <host>" message, the reader in
  `database/running.ts:39`, and the `SingletonLock` `<host>-<pid>` comments (rule 4).
- `resolveFromRegistry` → `resolveFromRemoteRegistry` (`cli/src/commands/install.ts`).
- The docs stop calling `stepRegistry` and friends "lookups" (rule 3).
- Open decision 2's outcome for the `seedKeys` guard.

**Done when:** each renamed symbol has one meaning in the tree, and the write-lock and database specs pass
unchanged apart from the field name. Mechanically: `grep -rn 'DepArtifacts\|findDepArtifacts\|resolveDepArtifacts'`
returns nothing outside `docs/archive`, and `source` no longer names a dependency's origin or an installed
pack's.

### Phase 5 — keep the retired names retired
- Extend `packages/abuddy-host/tests/removed-names-in-docs.spec.ts` — which already has exactly this shape, a
  `REMOVED` list of word regexes plus a per-file `ALLOWED` table with reasons — with every name retired here,
  checked across docs, CLI scaffold templates and pack sources.
- Update the docs describing these areas: root `CLAUDE.md`, `abuddy-host/CLAUDE.md`,
  `abuddy-host/src/packs/runtime/CLAUDE.md`, `abuddy-cli/CLAUDE.md`, `abuddy-sdk/CLAUDE.md`,
  `default-setup/CLAUDE.md`, `api/CLAUDE.md`, `docs/public-facing/architecture.md`, `cli.md`, `manifest.md`,
  `seeds.md` and `extensions.md`.
- Record the five rules, and the "check the word first" instruction, in `docs/reference/naming.md` (new), so
  the next name is chosen by the rule rather than by precedent. Both words this goal had to reject —
  `contract`, and the `contributions`/`extensions` pair — belong in it as worked examples.

**Done when:** the guard fails if a retired name comes back, mutation-checked by reintroducing one.

## Outcome (2026-09-19)

All five phases landed. `registry` names only the in-process collection and the remote stub, `bundle` is
only a verb, the last build-sense `artifact` is gone, and `source` names three things instead of five. The
guard in Phase 5 caught a real regression the moment it was written, which is recorded below because it is
the argument for the guard.

### Per phase
| Phase | Status | Evidence |
|---|---|---|
| 1 — installed packs are not a registry | done | `packs/installed-packs.ts`, `InstalledPack`, `installedAt`, `installedFrom`, `installed-packs.json`, and the route `packs.loaded` with `loadedPacksError`. Phase grep reads zero |
| 2 — `bundle` becomes only a verb | done, after a follow-up | `PACK_LAYOUT`, `PACK_LAYOUT_VERSION`, `stagePack`, `verifyPack`, `PackIntegrity`, `integrity.json`, `isPackLayout`, `getLoadedPackEntries`, `LoadedPackEntry`, `bundlePackSource`, `buildPackArchive`; module renamed `packs/pack-layout.ts`. Phase grep reads zero — but it greps names, and three noun leftovers had none of them; see *What the phase greps missed* |
| 3 — the umbrella's odd one out | done | `src/extensions/app/Welcome.vue` with the manifest path and regenerated entry following; then the second pass: `features[].contributions` → `references` (manifest key, `@abuddy/sdk/fe/references`, `ReferenceTypeConfig`, `ReferenceItem`, `REFERENCE_TYPES`, generated `references.ts`), and `contributions` retired in favour of `extensions` everywhere else. `grep -rn contribution` over `packages/` and `docs/public-facing/` reads zero — but that scope left `docs/goals/` and `docs/plans/`, where eight uses survived; see *What the phase greps missed* |
| 4 — the remaining single-sense fixes | done | `resolveDepFiles`/`DepFiles`/`ResolvedDepFiles`, `resolvedFrom`, `store.copyTo`, the write-lock's `machine`, `resolveFromRemoteRegistry`, the `seedKeys` guard removed (Open decision 2 A), and the docs calling the per-kind registries "registries" |
| 5 — keep the retired names retired | done, after a follow-up | `removed-names-in-docs.spec.ts` extended with 28 names and 4 paths, plus a case per rename asserting the replacement is *not* caught. It covered `registry`, `bundle` and `artifact` but not `contributions`, the goal's largest rename, and read no app source; both closed in review |

### Corrections to the Decisions
- **Open decision 1 was mis-framed, and answering it took two passes.** It asked which of `extensions` and
  `contributions` should be the single umbrella word. That was the wrong axis: there were three concepts,
  and *both* words named two of them.

  | Concept | Was | Is |
  |---|---|---|
  | Step/artifact/block definitions a pack registers | `src/extensions/` **and** `PackContributionsView` | extensions |
  | Vue components filling named app-shell slots | `fe.appExtensions` | app extensions |
  | Which of a feature's things are linkable from an editor | `features[].contributions`, `@abuddy/sdk/fe/contributions` | references |

  The third was the mis-named one. `ContributionTypeConfig` is `{ protocol, category, plugin, icon,
  svgElements, navigate }` — typing `#` in an editor opens a picker, and choosing an item inserts a
  `note://ab12` link that `navigate()` opens. Its only consumers are `reference-config.ts`,
  `reference-node.ts` and `referenceSuggestionPlugin`, and the inserted node is literally `name: 'reference'`.
  The manifest key was the odd one out, not the code.

  Renaming it to `references` freed `contributions` to mean one thing — and that one thing was what
  `src/extensions/` already held, so `contributions` was retired entirely: `PackContributionsView` →
  `PackExtensionsView`, `getPackContributions` → `getPackExtensions`, `packs/contributions.ts` →
  `packs/extensions.ts`, and the word is now absent from code and live docs.

  The first pass took option A alone (moving the loose `Welcome.vue` out of the kind-folders' root) and
  recorded the three concepts as a reason not to converge. That was half an answer: the concepts *are*
  distinct, but two of them were sharing a word in both directions, which is the collision this goal
  exists to remove.
- **`ResolvedDepArtifacts` was missing from Phase 4's list** and was added; it postdates the goal's first
  draft, and a grep for `DepArtifacts` finds it, so omitting it would have left the rename half-done while
  the greps read clean.

### Conventional choices
- **`packs/bundle.ts` → `packs/pack-layout.ts`** (and its spec). Phase 2 renamed every symbol in the module
  but not the module; leaving `bundle.ts` holding `PACK_LAYOUT` would have kept the noun in the one place a
  reader looks first.
- **`.abuddy/bundle/<id>` → `.abuddy/staged/<id>`.** The staging directory is the noun sense, and `staged`
  is the lifecycle stage rule 1 already names.
- **`packBundle` → `buildPackArchive`** (`abuddy pack`'s own function), checked free first.
- **`InstallResult.bundle` → `integrity`**, and `bundleDir` → `layoutDir`, the noun leftovers inside
  `pack-installer.ts`.
- **The per-kind registries are called registries in prose**, not "lookups", per rule 3 — across the root
  `CLAUDE.md` and the sdk, ui, api and renderer ones.

### What the phase greps missed

The greps in each phase look for the retired *names*. Three leftovers carried none of those names, so every
grep read zero and the suite stayed green while the rename was incomplete. A PR review found them; they are
fixed, and Phase 5's guard was widened so the next one fails a test instead.

| Leftover | Why no grep caught it |
|---|---|
| `PACK_LAYOUT.info`, which Phase 2 named explicitly | The key, not the value: `integrity.json` and `PackIntegrity` had landed, so `bundle.json` and `BundleInfo` both read zero while `info` — the last of `BundleInfo` — sat in `PACK_LAYOUT` and nine call sites |
| `packFrontendFiles(bundleDir)` | The Conventional-choices note scoped `bundleDir` → `layoutDir` to `pack-installer.ts`. The parameter in `pack-layout.ts` was a second site, and `bundleDir` is not a retired *name* |
| `bundle` as a noun in `pack-layout.ts`'s header, its doc comments and three error strings (`Not a pack bundle: …`) | The word alone is not a retired name, and it is legitimate in the bundler sense elsewhere, so no grep could be written for it without false positives |
| `contributions` in `docs/plans/codegen-staleness.md` and `docs/goals/deferred/goal-pack-frontend-isolation.md` (8 uses) | The phase-3 grep was scoped to `packages/` and `docs/public-facing/`. The deferred goal was the costly one: its whole purpose is to be picked up later, and it used the retired word as its umbrella throughout |

Phase 5's guard read only docs, CLI templates and pack sources — never the app's own source — and its name
list covered `registry`, `bundle` and `artifact` but not `contributions`, so none of the four survived by
accident: the guard could not have caught any of them. `isAppSource` now covers `packages/*/src` for host, SDK, ears, UI, CLI, testing, api,
renderer, main and preload, mutation-checked by reintroducing `readBundleInfo` into a host source file. The
`contributions` names are listed too, the bare words among them: the leftovers were prose and a manifest key,
so a symbol-only list would have missed every one. `tests/e2e/CLAUDE.md` has an allowance — it names the
commit `fix(packs): list a pack before registering its contributions`, and a commit subject is history.

Two doc references also pointed at `packs/bundle.ts` and one at `packs/pack-registry.ts`, modules this goal
renamed; `installed-packs.json`'s `installedFrom` was still called `source` in three places in
`abuddy-host/CLAUDE.md`. Neither class is a retired name either.

### Open items
- **`source` still names three things** by design: the `@abuddy/source` condition, a log or error's origin,
  and the declaring pack inside `mergeRegistries`. The condition is a resolution contract in every host
  config; the other two are conventional and read correctly. See Deferred.
- **The install *request* parameter is still `source`** (`INSTALL_PACK`'s `source`, `installPackFromLocal`,
  `handleProtocolInstall`), as is the bundle's git provenance (`PackIntegrity.source`). Both are distinct
  from the stored origin this goal renamed, and neither was in the doc's inventory; recorded here rather
  than renamed, since a fourth and fifth sense of `source` were outside what was decided.

### Final verification
| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm run test:unit` | passes |
| `npm run test:external-pack` | passes |
| `npm run compile` | passes; `pack-entry-fe.ts` regenerated with the new Welcome path |
| `api:update` | `@abuddy/sdk` (`installedPacksFile`), `@abuddy/ears` (`copyTo`) |
| Phase greps | every retired name reads zero outside `docs/archive` |

## Deferred

- **The `@abuddy/source` condition and the logger's `source`** (senses 1 and 3 of `source`). The condition is
  named in every host tsconfig, Vite/Vitest config, esbuild config and `node --conditions` invocation, and in
  the published `exports` maps of three packages — 176 refs, and a resolution contract rather than a word
  choice. The logger's `source` is the conventional name for the field and reads correctly. Qualifying the
  two small senses (Phases 1 and 4) takes `source` from five senses to three, which is where the cost curve
  turns.
- **Renaming `PackSnapshot`** (Decision 4). Revisit only with a replacement word checked against the tree.
- **The `qx`/`tx` name-or-id overload.** `qx('Memo')` for a name no pack declares silently returns `[]`,
  because the dash is the only thing separating a name from an id. Recorded, with two failed fix attempts and
  the design that would work (`qx(name)` checked plus a separate `qx.byId(id)`), in
  `packages/abuddy-sdk/TYPED-EARS.md`. It is an API change across every call site, not a naming fix.

## Constraints

- **Renames only.** Behaviour, file contents beyond names, and test assertions other than the names must not
  change. A phase whose diff shows a logic change has gone wrong.
- **Check a candidate word against the tree before adopting it** (`grep -rn`, excluding `node_modules`,
  `dist/` and `docs/archive`). Decision 4 and Open decision 1 exist because two candidates were already taken.
- **Published surfaces need their reports regenerated**, not hand-edited: `api:update` in `@abuddy/ears`
  (Phase 4), `@abuddy/sdk` (Phase 1), and `schema:check` after any manifest-schema touch.
- **Generated files are regenerated, never edited**: `npm run compile` (or `abuddy generate-entries --force`)
  after Phase 3. Checked 2026-09-18: no name this goal retires appears in any committed generated file
  (`src/__generated__/`, the fixtures' generated trees) or in any CLI scaffold template, so regeneration is
  a Phase 3 concern only and the other phases cannot leave a stale name in generated output.
- **Finish each phase with its grep, not with its tests.** A rename is complete when the old name returns
  nothing, and green tests do not show that: a name surviving in a doc, a comment, a spec title or a string
  literal compiles and passes. Each phase's "Done when" carries the exact command; run it before moving on.
- **Rebuild before E2E.** `npm test` launches built output, not source, so a backend rename is not in the run
  until `npm run build` has run (`tests/e2e/CLAUDE.md`). Renaming across the codegen boundary and running only
  `npm run compile` leaves the API bundle reading the old name, which fails as a crash, not a type error.
- **No compatibility handling of any kind.** If something would break for a hypothetical existing install,
  that is acceptable and should be stated in the phase's notes rather than coded around.
- Work on temp `ABUDDY_USER_DATA_DIR`s only.
