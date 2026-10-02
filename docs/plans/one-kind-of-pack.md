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

Of those 46 lines, the alias half has **no remaining user**: nothing in the tree imports
`@default-setup/…` except the virtual module's own generated import, because packs name their own modules
with `#` subpath imports now. So the renderer-side mechanism actually in play is ~25 lines, and the part of
it worth keeping is smaller still — see *Frontend HMR* below.

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

**Frontend HMR is the one open design question**, and it has its own section below. The short of it: HMR
today has nothing to do with being built-in — it works because a *static* import puts the pack's modules in
the renderer's own Vite graph — so the key can change without the concept surviving.

## Frontend HMR: re-key the plugin, do not delete it

### Why the built-in path has HMR

`builtInPacksPlugin` generates a module of **static** imports:

```js
import _pack0 from '@default-setup/__generated__/pack-entry-fe';
export default { 'default-setup': () => Promise.resolve({ default: _pack0 }) };
```

Statically analysable, so Vite compiles the pack's `.vue` and `.ts` into the renderer's module graph and
HMR is simply the renderer's own. The external path cannot get that, because the loader does
`import(/* @vite-ignore */ url)` on a `pack://` URL
(`renderer/src/adapters/pack-frontends.ts:7`) — and `@vite-ignore` is exactly *"Vite, do not own this"*.

**That capability depends on the pack's source being on disk and resolvable, not on the pack being shipped
with the app.** Those are two different facts that the `builtIn` flag currently conflates.

### What the external path already has

More than expected (`abuddy-cli/src/commands/run.ts:325-360`):

- `@vitejs/plugin-vue` — genuine SFC HMR rather than a reload.
- `packExternalsPlugin(root)` with `optimizeDeps.exclude: getSharedFeDeps(root)` — Vue, `@abuddy/sdk` and
  `@abuddy/ui` resolve to the host's copies, so **one Vue instance**.
- `hmr: { protocol: 'ws', host: 'localhost' }`, `cors: true`.
- The backend watcher **skips `.vue` and `.css`** (`run.ts:393`), which is the author saying Vite owns them.
- The proxy is a full mirror, not a whitelist: `devServerUrl` returns `http://localhost:${port}${filePath}`
  for any path (`dev-server.ts:76`), so `pack://<id>/@vite/client` resolves and Vite's root-relative update
  imports resolve back through the same origin.
- **No CSP is set anywhere** in main or the renderer, so the client's `ws://localhost:<port>` socket is not
  blocked.

So the mechanism is complete on paper. Whether component-level HMR actually lands through it is the
measurement in *Verification* below, and it is a prerequisite rather than a result.

### The design

**Re-key the plugin from `manifest.builtIn` to "this pack's source is on disk and this is a dev build."**

- `builtInPacksPlugin` becomes a **dev-only** `virtual:dev-pack-frontends`, generated from a list of local
  pack directories: in this repo the workspace packs that have an FE entry, plus any directory named by
  `ABUDDY_DEV_PACK_DIRS`, so an external author's checkout qualifies on the same terms.
- It is **absent from the production config**, so production has exactly one FE load path (`pack://`) and
  there is no runtime branch to keep honest.
- The pack frontend loader prefers the dev map when a pack id is in it, else `pack://`. One `if`, in dev.
- The alias half goes; the virtual module resolves absolute paths, since nothing imports `@<pack-id>/…`.

What this buys over simply using `abuddy run`:

- default-setup keeps instant Vue HMR from `npm start`, with no second process.
- **External pack authors in a checkout get it too**, which they do not today — so this is a devex
  improvement rather than a trade.
- The concept of built-in is still gone: nothing reads `manifest.builtIn`, the privilege is not in the
  manifest, and it cannot leak into production because the plugin is not there.

Why this is not the built-in path returning in disguise: it is keyed on a dev-time fact about where source
lives, it is available to every pack on equal terms, and it has no production counterpart. The thing being
removed is keyed on a manifest flag that also decides loading, seeding, reloading and shipping.

**The hazard to name:** with a dev source import the frontend comes from source while the backend comes
from the installed copy, so a feature added to `abuddy.json` without a rebuild shows a plugin whose system
is not registered. That hazard exists today for the same reason (renderer from source, api from
`dist/runtime/index.cjs`), and `abuddy run`'s `abuddy.json` watcher regenerating entries (`run.ts:377`) is
the mitigation to keep.

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

- `main/src/modules/api-server/config.ts:103` passes `SHIPPED_PACKS_DIR`.
- `api/src/runtime/index.ts` installs each shipped pack that is absent or out of date, then loads
  everything through the one external path. `publishHostPackOutput`/`pruneHostPackOutputs` and
  `hostPacksDir` go; `database/schema.ts` reads installed packs only, and the `degraded` branch at `:156`
  goes with them.
- Delete `builtInPackLoadersModule` from `api/tsup.config.ts`; the api bundle stops carrying a pack's
  backend.
- **Re-key** `builtInPacksPlugin` rather than deleting it, per *Frontend HMR* above: dev-only,
  `virtual:dev-pack-frontends`, generated from local pack directories, absent from the production config.
  Its `@<pack-id>/` alias half goes either way, having no remaining user.
- `abuddy build` for default-setup must now produce `dist/runtime/fe.js`, which is what production loads.
  `npm start`'s skip-the-FE-bundle shortcut stays honest, because in dev the frontend comes from source.

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

**The prerequisite measurement, before any of this is built.** Run `abuddy run` against a fixture pack with
a Vue component, edit the component, and watch what happens:

| outcome | what it means |
|---|---|
| component-level update, state preserved | the `pack://` path is a real fallback, and the dev source import is a convenience |
| full page reload | usable, but the dev source import earns its place |
| nothing | the dev source import is **required** — and check the `res.ok` fallback in `PackProtocol.ts` first, which is the likeliest cause |

**Devex, measured rather than asserted:** time one frontend edit and one backend edit through each loop —
`npm start` with the dev source import, and `abuddy run` — so the plan's claim that the backend loop is
already equivalent is a number rather than a reading of `reloadBuiltInPack`.

## Risks

**Boot depends on an install succeeding.** Today the app cannot fail to find its default pack; afterwards a
disk-full or permissions error at first launch means no packs. The mitigation that keeps one load path is
an idempotent verified install at every boot, failing loudly rather than silently packless. The mitigation
that keeps two is a read-only fallback that loads straight from resources — which is the built-in path
returning in disguise, and should be rejected unless the install proves unreliable in practice.

**The `logs` ref rename touches stored settings.** Item 2's migration is the only way a user's logs
settings survive. `0.3.15.ts` is the precedent and the test to copy
(`abuddy-host/tests/migrations/plugin-settings-0.3.15.spec.ts`).

**The `pack://` proxy masks a dev-server miss.** `PackProtocol.ts:60-69` does `if (res.ok)` and otherwise
falls through to reading the installed pack directory, so a 404 from a running dev server silently serves
the **stale built** `dist/runtime/fe.js`. That is the worst shape a devex bug can take — you edit, nothing
changes, and nothing says why. Once a marker says a dev server is running for a pack, a miss belongs as an
error naming the path. Worth fixing whichever way the HMR question lands, and it is a candidate cause if the
measurement below finds HMR not working today.

**A pack's `feStyles` arrives as a separate `<link>`** (`packFrontendIO.styles.add`), where in dev Vite
serves CSS through the JS graph. That link is either absent or stale for a pack being developed. It is
harmless today because the packs using that path are not the ones with HMR; it stops being harmless the
moment default-setup loads this way.

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
