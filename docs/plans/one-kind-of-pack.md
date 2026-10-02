# One kind of pack: retire "built-in"

Compiled 2026-10-02 on `AS/one-action-cache`, from reading the pack load, reload, seed, build and packaging
paths end to end. Every location, count and privilege below was checked against the tree on that date.

The question this answers: does the built-in/external distinction earn the duplication it costs, given that
the concern is developer experience (HMR, type resolution) and the guarantees the built-in pack relies on
(running before other packs, running at boot)?

**It does not, and both concerns are already answered by machinery in the tree.** What follows is what the
distinction buys, what it costs, and the four pieces of work that remove it.

---

## What the distinction buys

Exactly three privileges. `loadSingleExternalPack` strips each one from an external pack
(`abuddy-host/src/packs/runtime/loader.ts:235-257`), with a warning:

| privilege | declared | who uses it |
|---|---|---|
| `earlySystem` — the system starts before EARS hydration, outside the bus | `manifest-schema.ts:173`, refused for external packs at `:259` | **one feature in the repo**: default-setup's `logs` (`packages/default-setup/abuddy.json:238`) |
| `boot.seedManifest` — the declarative seed path, with `seedPolicy` | `pack-registration.ts:20`, `manifest-schema.ts:122` | default-setup's seven seed sources |
| `ears.partitionPolicy.excludedEntityTypes` | `loader.ts:250-257`, consumed at `database/schema.ts:174` | **nobody** — default-setup's is `{"excludedEntityTypes": []}` |

So one privilege is vacuous today, one is used by a single feature, and one is real.

## What it costs

Five mechanisms that exist twice, once per pack kind.

**Two load paths.** `loadBuiltInPacks` with its `runtimeEntry: 'prefer' | 'only' | 'never'` and
`bundledLoaders` options (~105 lines of `loader.ts`, plus `loadBuiltInRuntime`, `packRegistration`,
`refreshBuiltInPackInfo`) beside `loadSingleExternalPack`.

**Two reload paths.** `reloadBuiltInPack` (`reload.ts:133-177`) and `reloadExternalPack`, near-identical
wrappers over one `reloadPack`.

**Two seed-change mechanisms, both recorded in `AppState`.** `builtInSeedHashes` +
`builtInSeedFingerprints` (a stat fingerprint and a global hash, `seed.ts:179-207`) against
`externalSeedHashes` + `externalSeedDeps` (a per-pack hash and dependency state, `seed.ts:105-134`). The
external one is the more capable of the two; the built-in one carries `seedPolicy`
(`evaluateSeedPolicy`, `seed.ts:152-162`), which the external path never evaluates.

**Three build paths for one pack's code.** The renderer's `builtInPacksPlugin` (46 lines,
`renderer/vite.config.ts`: `virtual:built-in-packs` plus `@<pack-id>/` aliases into `src/`); the api's
tsup generating a loaders module and bundling default-setup's backend into the api bundle
(`api/tsup.config.ts:5,11`); and default-setup's own `abuddy build`.

**Two discovery sources in the schema reader.** `database/schema.ts` reads published built-in snapshots
from `hostPacksDir` (`:67-72`, `:147`) *and* installed external manifests, with a `degraded` fallback at
`:156` for when the first is empty — a branch that exists only because a built-in pack's snapshot can be
missing from the data dir while the pack itself is fine.

Beside those: `publishHostPackOutput` and `pruneHostPackOutputs` (a built-in-only publish into
`<userData>/host-packs` so dependents can resolve types, where external packs use `fetch-deps`'
`resolveDepFiles`); `builtIn: boolean` on every origin with `builtInPacks()`/`externalPacks()`
(`registry.ts:99,135,565-566`); `shippedWithApp` and `toBuiltInPackInfoList`
(`features/packs/be/system.ts:109-116`); and the manifest schema's `builtIn` field plus its refinement.

**Roughly 500 lines of source**, and the branch appears in about a dozen more places. On the test side
`abuddy-cli/tests/packs/host-output.spec.ts` (356 lines) largely goes, `loader.spec.ts` (857) and
`reload.spec.ts` (381) each lose a near-duplicate half, `discovery.spec.ts` (128) shrinks, and
`api/tests/runtime/packaged-boot.spec.ts` (102) changes shape.

---

## Developer experience: the machinery already exists

This was expected to be the blocker. It is not.

**HMR.** `abuddy run` already runs a real Vite dev server per pack, which the app's `pack://` handler
proxies to through a marker in the data dir (`abuddy-host/src/packs/dev-server.ts`;
`abuddy-cli/src/commands/run.ts:352-418`, which ends by printing *"FE changes hot-reload via Vite HMR"*).
The same command watches the backend and does rebuild → install → hot-reload (`run.ts:390-393`), with a
`watchRebuildFallback` for a pack with no FE entry.

**The built-in backend loop is already no better.** `reloadBuiltInPack` throws unless
`dist/runtime/index.cjs` exists, so a backend change to default-setup already means `abuddy build` and
then a reload — the same shape `abuddy run` gives an external pack.

**Type resolution improves.** `packages/default-setup/tsconfig.json` declares no `@abuddy/source`
condition, so the editor already type-checks it against `dist` — the pack-author layout. The fork today is
that the *renderer's* Vite compiles its frontend from source with the condition, so the editor and the
running dev app resolve differently. One kind of pack removes that fork.

**The one real loss** is instant frontend HMR with no extra process: today `npm start` alone hot-reloads
default-setup's frontend from source. Afterwards it needs the pack's dev server running too. That is a
workflow change rather than a capability loss, and it is the workflow every other pack author has — which
makes the change dogfooding as well as deletion.

## "Runs first" is already derived

`packSeedOrder` (`abuddy-host/src/packs/discovery.ts:147`) is a cycle-tolerant topological sort over
declared `dependencies`, already covered by `tests/packs/dependencies.spec.ts`. Its own doc names the
special case it is bypassed by:

> *"A dependency on a built-in pack is already satisfied — the built-in packs' boot seeds run before any
> external pack's"*

That is a hard-coded phase standing in for an edge the sort would compute. Declare the dependency and the
order is derived — the same move `goal-one-action-cache` made when the chain's hand-written ordering
became a function of declared inputs and outputs.

---

## How default-setup ships today

Five steps, which are the entry point this plan changes:

1. **`electron-builder.mjs:119-166`** — `files` takes `packages/**/*`, minus `!packages/*/src/**`, plus
   `packages/*/dist/**`, with `asar: false` (`:171`). default-setup lands as a real directory at
   `<resourcesPath>/app/packages/default-setup/`: `abuddy.json` and `dist/` (the seven `*.seed.json`,
   `snapshot.json`, `types/`, `defs/`, `build/`, `runtime/index.cjs`).
2. **`main/src/modules/api-server/config.ts:103`** — Electron main passes
   `BUILT_IN_PACKS_DIR = <resourcesPath>/app/packages` when packaged, `<appPath>/packages` otherwise, and
   `NODE_ENV: app.isPackaged ? 'production' : 'development'` in the same object.
3. **`api/src/runtime/index.ts:143`** — the API process reads it and calls `loadAppPacks(packs, {
   builtInDir, bundledLoaders: () => import('virtual:built-in-pack-loaders') })`.
4. **The renderer** gets the frontend separately, statically imported from source by
   `builtInPacksPlugin`.
5. **`publishHostPackOutput`** (`api/src/runtime/index.ts:152-165`) then copies the pack's types and build
   output to `<userData>/host-packs/<id>` for dependents, and prunes outputs this release no longer ships.

**The backend ships twice.** `runtimeEntry` defaults to `'never'` when `NODE_ENV !== 'development'`
(`loader.ts:105`), so a packaged app loads the registration from the loader bundled into the api bundle —
and the `dist/runtime/index.cjs` in resources is shipped and never read. The frontend ships once, inside
the renderer bundle; `dist/runtime/fe.js` is not built for a built-in pack at all, which is why plain
`npm start` can skip the FE bundle.

## How it ships afterwards

One artifact: the same directory in resources, now authoritative — `abuddy.json` plus `dist/` including
both `runtime/index.cjs` **and** `runtime/fe.js`. `virtual:built-in-pack-loaders` and
`virtual:built-in-packs` are deleted; the api bundle loses default-setup's backend and the renderer bundle
loses its frontend, which reappears as `dist/runtime/fe.js`, so net shipped bytes are roughly a wash minus
the duplicated backend.

First boot installs it with a function that already exists: `installPackFromLocal(source, targetPacksDir,
options)` → `installFromDirectory` (`installer.ts:216,252`) verifies, stages and writes `integrity.json`
from a directory on disk. The new code is a call site at boot, not a mechanism. `installer.ts` already
reads `BUILT_IN_PACKS_DIR` in `getBuiltInPackIds` (`:156-170`) — for dependency checks today, for *what do
we ship* afterwards.

`BUILT_IN_PACKS_DIR` changes meaning, from *where built-in packs are discovered and loaded from* to *where
the packs we ship live, to be installed from*. **Rename it `SHIPPED_PACKS_DIR`**, so the rename is what
forces every reader to be revisited rather than leaving a name that no longer describes its job.

---

## The work, in order

Each item lands independently. Only the last cannot be trivially reverted.

### 1. Drop `partitionPolicy`'s built-in restriction — free

Nothing uses it: the only pack allowed one declares `{"excludedEntityTypes": []}`. Either make it general
(delete the strip at `loader.ts:250-257` and the warning) or delete the field from the manifest schema,
`PackRegistration` and `registry.ts:228-232`. Deleting is the smaller change and a field with no user and
no test fixture is not a capability. `database/schema.ts:174`'s `excluded` then comes from every pack, or
from `SDK_EXCLUDED_ENTITY_TYPES` alone.

**Files:** `loader.ts`, `manifest-schema.ts`, `registry.ts`, `database/schema.ts`.

### 2. Move the `logs` feature into the host pack

`earlySystem` exists for one feature, and a system that must run before the data layer is up is app
infrastructure rather than pack content — which is what `@abuddy/host/features/` already holds
(`application`, `packs`, `settings`, beside `bus`). Moving it deletes `earlySystem` from the pack contract
rather than generalising it.

**Size:** 11 files, 1407 lines (`src/features/logs/{be,fe}` plus `settings.ts`) — mostly relocation, but
every reference to the ref `default-setup/logs` becomes `host/logs`, including stored plugin settings,
which needs a migration (`abuddy-host/src/migrations/app/`; `0.3.15.ts` already moved plugin settings onto
feature refs and is the worked example).

**The alternative, with its cost.** Generalise `early` so any pack may declare it. That is less work, and
it cannot be done as stated: the refinement's own reason is that *"an early system starts before EARS
hydration, before external packs load"*, which is circular once the pack declaring it is external. It would
need the boot phases reordered to load every pack, then start early systems, then hydrate — and boot logs
emitted during pack loading would no longer be captured, which is the thing `early` was added for.

**Files:** `abuddy-host/src/features/logs/**` (new), `default-setup/src/features/logs/**` (deleted),
`default-setup/abuddy.json`, a new app migration, `manifest-schema.ts`, `registry.ts:48-55,555-561`,
`bus/app.ts:28-65`, `api/src/runtime/index.ts`'s `startEarlySystems` call.

### 3. Ship and install, instead of discover and bundle

- `main/.../config.ts:103` passes `SHIPPED_PACKS_DIR`.
- `api/src/runtime/index.ts` installs each shipped pack that is absent or out of date, then loads
  everything through the one external path. `publishHostPackOutput`/`pruneHostPackOutputs` and
  `hostPacksDir` go; `database/schema.ts` reads installed packs only, and the `degraded` branch at `:156`
  goes with them.
- Delete `builtInPackLoadersModule` from `api/tsup.config.ts` and `builtInPacksPlugin` from
  `renderer/vite.config.ts`. Keep the `@<pack-id>/` alias question in mind: it is how the renderer resolves
  a built-in pack's `src/`, and nothing needs it once the frontend is loaded over `pack://`.
- `abuddy build` for default-setup must now produce `dist/runtime/fe.js`. `npm start`'s skip-the-FE-bundle
  shortcut either goes or becomes "start the pack's dev server instead".

**The upgrade rule, which is new.** On a version bump the shipped copy is newer than the installed one, so
boot must compare and re-install. Cheapest honest version: compare the shipped pack's integrity hash
against the installed one's on every boot and re-install when they differ — one hash read, and it covers a
user-modified install too, which is a state that cannot exist today.

**Files:** `main/src/modules/api-server/config.ts`, `api/src/runtime/index.ts`, `api/tsup.config.ts`,
`renderer/vite.config.ts`, `abuddy-host/src/packs/{installer,staging,discovery}.ts`,
`abuddy-host/src/database/schema.ts`, `abuddy-host/src/build/discover.ts` (deleted),
`electron-builder.mjs` (only if the shipped set changes).

### 4. Merge the two seed paths — last, and the only one with a migration

Keep the external path's per-pack hashing and dependency tracking, and port `seedPolicy`
(`skipAtBoot`, `skipAfterOnboarding`) onto it. `builtInSeedHashes` and `builtInSeedFingerprints` fold into
`externalSeedHashes`/`externalSeedDeps` — renamed, since "external" stops meaning anything: `packSeedHashes`
and `packSeedDeps`, which is what `0.3.15.ts:83-86` renamed *away from*, so that migration is the map for
renaming back.

This is where the risk sits: the fields are stored user data, so it needs a migration
(`abuddy-host/src/migrations/CLAUDE.md`), and the stat-fingerprint shortcut the built-in path uses has no
counterpart on the external side — measure whether dropping it costs anything at boot before deciding to
keep it for every pack.

**Files:** `abuddy-host/src/packs/runtime/seed.ts`, `abuddy-host/src/app-state/**`, a new app migration,
`abuddy-sdk/src/framework/pack-registration.ts`, `manifest-schema.ts`.

---

## Verification

Per item, and then once at the end.

**Each item:** `npm run chain`, which routes the suites the change touches. The specs whose subject is the
distinction are the ones to read first — `abuddy-host/tests/packs/runtime/{loader,reload}.spec.ts`,
`tests/packs/discovery.spec.ts`, `tests/packs/dependencies.spec.ts`,
`abuddy-cli/tests/packs/host-output.spec.ts`, `api/tests/runtime/packaged-boot.spec.ts`. A case deleted
because its subject is gone is correct; a case deleted because it became awkward is the failure mode, so
each deletion says which it was in the commit message.

**Mutation checks**, the repo's discipline, each restored after:

| mutation | expected single failure |
|---|---|
| ship a pack directory with no `integrity.json` | the first-boot install refuses, naming the pack |
| leave the installed copy at an older version than the shipped one | boot re-installs; a case asserts it, not the log line |
| give a pack a `seedPolicy` and boot twice | the second boot seeds nothing, and `skipAtBoot` keys are absent both times |
| drop the `packSeedOrder` edge for a declared dependency | the dependent seeds before its dependency |

**End to end, and the thing that proves item 3 worked:** a packaged build
(`npm run build-prod`) launched against an empty data dir, then again against the populated one. First run
installs and seeds; second run installs nothing and seeds nothing. `DEBUG_E2E=1 npm test -- smoke` covers
the four things every other check assumes, and `tests/e2e/CLAUDE.md` has the instrumentation method.

**Devex, measured rather than asserted:** time `abuddy run` against default-setup for one frontend edit and
one backend edit, and compare with today's `npm start` loop. If the frontend edit is materially slower than
today's source HMR, that number decides whether the renderer keeps a dev-only alias for a pack it is
developing — which would be one kind of pack with a dev convenience, not two kinds.

## Risks

**Boot depends on an install succeeding.** Today the app cannot fail to find its default pack; afterwards a
disk-full or permissions error at first launch means no packs. The mitigation that keeps one load path is
an idempotent verified install at every boot, failing loudly rather than silently packless. The mitigation
that keeps two is a read-only fallback that loads straight from resources — which is the built-in path
returning in disguise, and should be rejected unless the install proves unreliable in practice.

**The `logs` ref rename touches stored settings.** Item 2's migration is the only way a user's logs
settings survive. `0.3.15.ts` is the precedent and the test to copy
(`abuddy-host/tests/migrations/plugin-settings-0.3.15.spec.ts`).

**`dist/runtime/fe.js` becomes load-bearing for the app's own frontend.** A pack FE bundle that fails to
build currently costs an external pack its UI; afterwards it costs the app its UI. `compile` already runs
in the chain, so the failure is caught before a release — but it is a new way for a green typecheck to ship
a broken app, and belongs in `CLAUDE.md`'s list of what the chain cannot work out for you if it survives
review.

## What this is not

- Not making packs hot-pluggable or installable from a registry: `resolveFromRemoteRegistry` still throws
  for every name, and this plan does not change that.
- Not a change to `@abuddy/sdk`'s published surface, except that `earlySystem` and possibly
  `partitionPolicy` leave the manifest schema — which needs `npm run schema:update` and `api:update`.
- Not a performance change. The win is five mechanisms becoming one each, and the only pack exercising the
  privileged path becoming the pack that proves the author-facing path works.
