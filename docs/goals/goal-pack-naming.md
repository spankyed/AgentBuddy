> **Written in session** `b9ed13ae-1ac2-48e4-ae3d-6e96f091dbb1` (Claude Code, 2026-09-17). Resume it with `claude -r b9ed13ae-1ac2-48e4-ae3d-6e96f091dbb1`.

```
# Goal: one word per concept in the pack vocabulary

Implement docs/goals/goal-pack-naming.md. Read Background, Rules, Decisions, Open decisions, Phases and
Constraints first. Open decision 1 must be settled before Phase 5; if it's still marked open, stop and ask.
Where another detail isn't specified, pick the conventional option, note it in the final summary, and keep
going.

This is a renaming goal: no behaviour changes, no new features, and **no backward-compatibility code**. No
pack built by anyone exists outside this repo, and no released app has shipped pack modularization, so
every name here is free to change outright. A rename that "also handles the old shape" is wrong.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard or test is mutation-checked.
- No retired name survives anywhere (code, tests, docs, scaffold templates, generated files), enforced by the
  guard in Phase 6 rather than by grepping once.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`, `api:check` (ears, sdk, ui),
  `packages:build` + `packages:check`, `npm run compile`, `facade:check -w @app/default-setup`, and
  `npm run test:unit` pass.
- `npm run build`, the monorepo E2E, `npm run test:external-pack` and `npm run test:packaged-authoring` pass.
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

Several words in this codebase name two or three unrelated things. The collisions were found by audit, each
with evidence in the tree:

- **`registry`** — `createPackRegistry()` is the in-process collection packs register into (43 refs);
  `pack-registry.json` is the on-disk record of installed external packs (~105 refs across 7 identifiers);
  `resolveFromRegistry` is a remote package registry (unimplemented). The first two interact, so the docs have
  to disambiguate them in prose. The file also spells its install timestamp `registeredAt`.
- **`bundle`** — a noun (the verified, checksummed shippable layout: `BUNDLE_PATHS` 70 refs, `verifyBundle`,
  `stageBundle`, `bundle.json`) and a verb (run esbuild/Vite: `bundlePackFE`, `bundleFile`,
  `bundlePackRuntime`). `buildPackBundle` reads as "build the bundle" but is the shared esbuild setup.
- **`extensions`** — `packages/default-setup/src/extensions/` is the umbrella for everything the pack
  contributes (artifacts, blocks, steps, services, tiptap) *and* holds `Welcome.vue`, registered as
  `fe.appExtensions.welcome`. The umbrella wears one of its children's names. The CLI scaffold hard-codes this
  path in four places (`add/manifest.ts`, `add/service.ts`, `add/step.ts`, `init.ts`).
- **`snapshot`** — `PackSnapshot` / `snapshot.json` / `depSnapshots` hold `types`, `defs`, `manifest`,
  `sdkVersion`, `flowHelpers` and `provenance`: exactly what a dependent pack compiles against. That is
  a contract; "snapshot" describes when it was taken, not what it is. `secretsSnapshot()` and the LMDB store's
  `snapshot()` are two further senses.
- **`host`** — the app (`@abuddy/host`, `HostRuntime`, `hostVersion`, `host-packs/`) and the machine
  (`db-write.lock`'s `host: os.hostname()`, `SingletonLock`'s `<host>-<pid>`).

Two senses of `artifact` were already retired (the published build output of built-in packs, and
`PackSeedManifest.artifacts` → `seedKeys`); `artifact` now means only the first-class pack contribution. A
third survives in `resolveDepArtifacts` (`fetch-deps.ts`), which resolves a dependency's files.

**Why now:** the user is the only user, on 0.3.14, and no pack built against the modular SDK exists outside
this repo. Every name below — including files in a data directory and paths inside a pack bundle — can change
outright. That will not be true later.

## Rules

The renames follow five rules. Prefer the rule over the table when they disagree; the table is what the rules
produce today.

1. **One word per pack lifecycle stage, and no word in two stages.** A pack is authored → built → staged →
   archived → installed → loaded → registered → active. *loaded*, *registered* and *active* are already right.
2. **A word is a noun or a verb here, never both.** `bundle` is the industry verb for esbuild/Vite, so it is
   only ever that; the thing it used to name becomes the pack's layout/archive.
3. **`registry` is a live in-process collection things register into — never a file.** The remote sense is
   qualified (`resolveFromRemoteRegistry`). `stepRegistry`, `artifactRegistry`, `blockRegistry`,
   `_seedHookRegistry` and `tiptapPluginRegistry` keep the word; the docs stop calling them "lookups" so prose
   and code agree.
4. **`host` is the app; `machine` is the computer.**
5. **A borrowed generic word is qualified by what it is *of*; if it describes *when* rather than *what*, it is
   the wrong word.** Hence `PackSnapshot` → `PackContract`, and `snapshot` freed for point-in-time meanings.

## Decisions

Final.

**Decision 1 — every name in the Rules table changes outright, with no compatibility handling.** No pack built
against the modular SDK exists outside this repo and no released app has shipped pack modularization, so there
is no old shape to read, no file to migrate and no alias to keep.

**Decision 2 — the pack's integrity file follows the layout rename.** `bundle.json` becomes `integrity.json`,
and the release asset the updater reads (`*.bundle.json`, `findLatestRelease` in `packs/github.ts`) becomes
`*.integrity.json`. No published release carries the old asset.

**Decision 3 — the in-process registry keeps the word.** `createPackRegistry`, `PackRegistry`,
`PackRegistryView`, `registerPack` and the per-kind `*Registry` lookups are unchanged; only the on-disk record
and the remote sense move (rule 3).

## Open decisions (settle with the user before Phase 5)

**1. The `seedKeys` rebuild guard.** `orchestrateDeclarativeSeed` throws `Pack "<id>" was built with an older
@abuddy/cli (its seed manifest has no seedKeys): rebuild it with the current one` when a seed manifest lacks
`seedKeys`. No bundle predating that field exists outside this repo, so by Decision 1 it is compatibility code
and should go. Against that: it also catches a stale `dist/` inside the monorepo, where the failure is
otherwise a pack that silently seeds nothing.
- **A.** Remove it and its spec (`packages/abuddy-host/tests/packs/runtime/seed.spec.ts`).
- **B.** Keep it, reworded as a stale-build check that doesn't mention an older CLI.
— *open*

## Phases

Each phase is landable on its own and leaves every check green. Rename in this order: the phases get
progressively deeper into files that packs and data directories carry.

### Phase 1 — installed packs are not a registry
- `pack-registry.ts` → `installed-packs.ts`. `PackRegistryEntry` → `InstalledPack`; `readPackRegistry` →
  `readInstalledPacks`; `writePackRegistry` → `writeInstalledPacks`; `modifyRegistry` →
  `updateInstalledPacks`; `reconcileExternalRegistry` → `reconcileInstalledPacks`.
- The entry's `registeredAt` → `installedAt`.
- `AppContext.registryFile` → `installedPacksFile` (`@abuddy/sdk/env`, published — `api:update`), and the file
  itself `pack-registry.json` → `installed-packs.json`.
- `createPackRegistry()`, `PackRegistry`, `PackRegistryView` and `registerPack` keep their names: they are the
  in-process registry, which is what rule 3 reserves the word for.
- **No migration.** A development data dir holding the old file simply has no installed-packs record;
  `reconcileInstalledPacks` re-adds the packs it finds in `packs/` as enabled at the next boot, which is what
  it already does for a pack it has never seen. What is lost is each entry's `source` and update-check cache.
  Delete the stale file by hand if it bothers you.

**Done when:** no identifier or path outside `createPackRegistry`'s own module calls the on-disk record a
registry; a temp-data-dir test shows a data dir with no `installed-packs.json` coming up with its packs enabled.

### Phase 2 — `bundle` becomes only a verb
- `BUNDLE_PATHS` → `PACK_LAYOUT`; `BUNDLE_FORMAT_VERSION` → `PACK_LAYOUT_VERSION`; `stageBundle` →
  `stagePack`; `verifyBundle` → `verifyPack`; `createBundleArchive` → `createPackArchive`;
  `extractBundleArchive` → `extractPackArchive`.
- `bundle.json` → `integrity.json` (Decision 2), and `PACK_LAYOUT.info` → `PACK_LAYOUT.integrity`.
- The one ambiguous verb: `buildPackBundle` → `bundlePackSource`.
- Everything else keeps `bundle` as a verb: `bundlePackFE`, `bundlePackRuntime`, `bundlePackTypes`,
  `bundlePackSeedRuntime`, `bundlePackStepBuild`, `bundleFile`, `bundle-package.ts`, and the manifest key
  `fe.bundleUi`.
- `packs/github.ts` reads `*.integrity.json` as the release asset.

**Done when:** `bundle` appears only as a verb or in a bundler's own vocabulary; `abuddy pack` still produces
an archive that `abuddy install` verifies, proven by the existing round-trip tests.

### Phase 3 — the umbrella is contributions
- `packages/default-setup/src/extensions/` → `src/contributions/`, with `abuddy.json`'s paths and the
  regenerated entries following. `Welcome.vue` moves with it and stays registered as `fe.appExtensions.welcome`.
- The CLI scaffold writes `src/contributions/...`: `add/manifest.ts`, `add/service.ts`, `add/step.ts`,
  `init.ts`, and any fixture pack under `tests/fixtures/`.
- The contribution *kinds* keep their names (`artifacts`, `blocks`, `steps`, `services`, `tiptapPlugins`,
  `fe.appExtensions`). Only the umbrella changes, matching the SDK's existing `PackContributionsView`.

**Done when:** `abuddy init` followed by `abuddy add step`/`add artifact`/`add service` scaffolds under
`src/contributions/` and builds; `npm run compile` regenerates default-setup with the new paths.

### Phase 4 — a pack's contract is not a snapshot
- `PackSnapshot` → `PackContract`; `snapshot.json` → `contract.json` (both `dist/contract.json` and
  `PACK_LAYOUT.contract` = `types/contract.json`); `depSnapshots` → `depContracts`.
- The CLI's dependency resolution follows: `resolveDeps`, `fetch-deps.ts`, `.abuddy/deps`, the stale-deps
  warning, and `resolveDepArtifacts` → `resolveDepFiles` (the last surviving build-sense `artifact`).
- `snapshot` is then free for point-in-time meanings only.

**Done when:** a dependent pack resolves and compiles against a dependency's `contract.json` end to end —
`npm run test:external-pack` and `npm run test:packaged-authoring` cover this path.

### Phase 5 — the remaining single-sense fixes
- `store.snapshot(partition, targetDir)` → `store.copyTo(partition, targetDir)` (`@abuddy/ears/lmdb`,
  published — `api:update`), so `snapshot` keeps one meaning per package.
- `db-write.lock`'s `host` field → `machine`, and `findDatabaseWriter`'s "on <host>" message with it; the
  `SingletonLock` `<host>-<pid>` reader says machine too (rule 4).
- `resolveFromRegistry` → `resolveFromRemoteRegistry`.
- The docs stop calling `stepRegistry` and friends "lookups" (rule 3).
- The open decision's outcome for the `seedKeys` guard.

**Done when:** each renamed symbol has one meaning in the tree, and the write-lock and database specs still
pass unchanged apart from the field name.

### Phase 6 — keep the retired names retired
- Extend `packages/abuddy-host/tests/removed-names-in-docs.spec.ts` (which already guards the names the
  package-boundaries goal removed) with every name retired here, checked across docs, CLI scaffold templates
  and pack sources, with the same per-file allowance-and-reason table.
- Update the docs that describe these areas: root `CLAUDE.md`, `packages/abuddy-host/CLAUDE.md`,
  `packages/abuddy-host/src/packs/runtime/CLAUDE.md`, `packages/abuddy-cli/CLAUDE.md`,
  `packages/abuddy-sdk/CLAUDE.md`, `packages/default-setup/CLAUDE.md`, `docs/public-facing/architecture.md`,
  `cli.md`, `manifest.md` and `seeds.md`.
- Record the five rules in `packages/abuddy-sdk/CLAUDE.md` (or a short `docs/reference/naming.md`) so the next
  name is chosen by the rule rather than by precedent.

**Done when:** the guard fails if a retired name comes back, mutation-checked by reintroducing one.

## Constraints

- **Renames only.** Behaviour, file contents beyond names, and test assertions other than the names must not
  change. A phase whose diff shows a logic change has gone wrong.
- **Published surfaces need their reports regenerated**, not hand-edited: `api:update` in `@abuddy/ears`
  (Phase 5), `@abuddy/sdk` (Phases 1 and 4), and `schema:check` after any manifest-schema touch.
- **Generated files are regenerated, never edited**: `npm run compile` (or `abuddy generate-entries --force`)
  after Phases 3 and 4.
- **No compatibility handling of any kind** — no reading the old filename, no accepting the old field, no
  deprecation alias. If something would break for a hypothetical existing install, that is acceptable and
  should be stated in the phase's notes rather than coded around.
- Work on temp `ABUDDY_USER_DATA_DIR`s only.
