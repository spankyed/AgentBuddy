# One kind of pack: retire "built-in"

Compiled 2026-10-02 on `AS/one-action-cache`, from reading the pack load, reload, seed, build and packaging
paths end to end. Every location, count and privilege below was checked against the tree on that date.
Restructured the same day, after the first version was found to be a proposal wearing a decision's clothes —
what changed and why is in **How this plan was wrong** at the end.

> **Every citation here was last checked against the tree on 2026-10-07**, and each of the three committed
> steps is still undone — `bundledLoaders`, `builtInPackLoadersModule` and `partitionPolicy` are all present.
> Ten citations had drifted in five days and are corrected in place, which is the rate to expect: six line
> numbers moved under edits to the files they name, and four of the five test sizes gained a line to one
> refactor (`bdfa88299`, reading the installed layout from `PACK_LAYOUT`). Nothing a step rests on had moved.
> A count or a line number below is as good as that date; what is held to the code is named in the step that
> needs it.
>
> **The branch also gave item 1 three more things to delete.** `abuddy build` now records what each bundling
> phase read, and that record is built-in-aware in three places — listed under item 1, each carrying a
> comment naming this document, so the work is findable from the code and not only from here.

**Three steps are committed; one question is left open on purpose.** The committed steps need no migration
and no packaging change. The open question is whether default-setup stops living in the app's resources and
becomes an installed pack like any other — which needs two stored-data migrations, and should be decided
with the committed steps already landed.

## The criterion

**Collapse a duplication where it needs no stored-data migration. Leave the rest to a separate decision.**

That line is what sorts the work below, and it is falsifiable: every committed step can be undone by
reverting its commit, and every deferred step cannot, because stored user data has moved. It is also what
the first version of this plan lacked — it measured the cost, announced a verdict, and had no test anything
could fail.

## Three axes, not one question

"Built-in" conflates three things, and only the first is a real distinction:

| axis | real? | what it decides |
|---|---|---|
| **where the files live** — read-only in `resources/` vs the user's data dir | **yes**, irreducibly | whether a pack is installed or loaded in place |
| **how the code is loaded** — bundled into the app vs required from the pack's own directory | no | one load path or two |
| **what the pack may do** — `earlySystem`, declarative seeds, partition policy | no | whether the privileged pack is the one that proves the author-facing path works |

Axes 2 and 3 are accidental and come out cheaply. Axis 1 is legitimate, and eliminating it is what forces
install-on-first-boot, two migrations and a packaging change. The committed work is axes 2 and 3.

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

**Four build paths for one pack's code.** The largest of them, and the first version of this plan
undercounted it:

1. the renderer's `builtInPacksPlugin` (`renderer/vite.config.ts`) — the frontend, dev and production;
2. the api's tsup generating a loaders module and bundling the backend into the api bundle
   (`api/tsup.config.ts:5,11`);
3. `abuddy build`, which **returns early for a built-in pack** (`abuddy-cli/src/commands/build.ts:305-310`,
   *"Built-in packs' FE is compiled into the renderer … and their backend into the API bundle, never loaded
   from dist/"*) — so it produces seeds, types, defs and a snapshot and then stops, skipping
   `bundlePackRuntime` and `bundlePackFE`;
4. **`packages/default-setup/dev-build.mjs`, 164 lines of bespoke esbuild** reimplementing
   `bundlePackRuntime` for one pack, because of (3). `dev-mode.js:27` forks it with `--watch` and waits for
   its first compile before booting the API (`:52`), so it is also the backend watch loop.

The code that replaces (4) already exists, switched off by the four lines of (3).

**Two load paths.** `loadBuiltInPacks` with its `runtimeEntry: 'prefer' | 'only' | 'never'` and
`bundledLoaders` options (~105 lines of `loader.ts`, plus `loadBuiltInRuntime`, `packRegistration`,
`refreshBuiltInPackInfo`) beside `loadSingleExternalPack`.

**Two reload paths.** `reloadBuiltInPack` (`reload.ts:133-177`) and `reloadExternalPack`, near-identical
wrappers over one `reloadPack`.

**Two seed-change mechanisms, both recorded in `AppState`.** `builtInSeedHashes` +
`builtInSeedFingerprints` (a stat fingerprint and a global hash, `seed.ts:179-207`) against
`externalSeedHashes` + `externalSeedDeps` (a per-pack hash and dependency state, `seed.ts:105-134`). The
external one is the more capable; the built-in one carries `seedPolicy` (`evaluateSeedPolicy`,
`seed.ts:152-162`), which the external path never evaluates.

**Two discovery sources in the schema reader.** `database/schema.ts` reads published built-in snapshots from
`hostPacksDir` (`:67-72`, `:147`) *and* installed external manifests, with a `degraded` fallback at `:156`
for when the first is empty — a branch that exists only because a built-in pack's snapshot can be missing
from the data dir while the pack itself is fine.

Beside those: `publishHostPackOutput` and `pruneHostPackOutputs`; `builtIn: boolean` on every origin with
`builtInPacks()`/`externalPacks()` (`registry.ts:99,135,565-566`); `shippedWithApp` and
`toBuiltInPackInfoList` (`features/packs/be/system.ts:109-116`); and the manifest schema's `builtIn` field
plus its refinement.

**Roughly 500 lines of source** plus `dev-build.mjs`'s 164. **Nineteen files read the flag**, and about
eleven are named by no step below, because most are axis 1 and stay: `BUILT_IN_PACKS_DIR` in
`main/src/modules/api-server/config.ts`, `pack.ts` refusing to pack a built-in, `installer.ts` skipping
built-in ids while resolving dependencies, `discovery.ts` filtering manifests. One must not be touched at all —
`abuddy-host/src/migrations/app/0.3.15.ts`, which is history and describes the tree as it was. On the test side `abuddy-cli/tests/packs/host-output.spec.ts` (357 lines) is mostly about the
built-in-only publish, `loader.spec.ts` (858) and `reload.spec.ts` (382) each carry a near-duplicate half,
`discovery.spec.ts` (128) shrinks, and `api/tests/runtime/packaged-boot.spec.ts` (103) changes shape.

---

## Developer experience

**`npm start` keeps working, and default-setup's frontend HMR does not change.** Those two sentences are the
point of this section; the rest is why.

**Frontend HMR has nothing to do with being built-in.** `builtInPacksPlugin` generates a module of **static**
imports:

```js
import _pack0 from '@default-setup/__generated__/pack-entry-fe';
export default { 'default-setup': () => Promise.resolve({ default: _pack0 }) };
```

Statically analysable, so Vite compiles the pack's `.vue` and `.ts` into the renderer's own module graph and
HMR is simply the renderer's. The external path cannot get that, because the loader does
`import(/* @vite-ignore */ url)` on a `pack://` URL (`renderer/src/adapters/pack-frontends.ts:7`), and
`@vite-ignore` is exactly *"Vite, do not own this"*.

So the capability depends on **the pack's source being on disk and resolvable**, not on the pack shipping
with the app. Those are two facts `manifest.builtIn` currently conflates, and re-keying the plugin to the
first keeps the capability while dropping the concept — see step 3.

Of the plugin's 46 lines, the `@<pack-id>/` alias half has **no remaining user**: nothing imports
`@default-setup/…` except the virtual module's own generated import, because packs name their own modules
with `#` subpath imports now.

**The external path is already wired for HMR**, which matters as the fallback and as the path every author
uses (`abuddy-cli/src/commands/run.ts:325-360`):

- `@vitejs/plugin-vue` — genuine SFC HMR rather than a reload.
- `packExternalsPlugin(root)` with `optimizeDeps.exclude: getSharedFeDeps(root)` — Vue, `@abuddy/sdk` and
  `@abuddy/ui` resolve to the host's copies, so **one Vue instance**.
- `hmr: { protocol: 'ws', host: 'localhost' }`, `cors: true`.
- The backend watcher **skips `.vue` and `.css`** (`run.ts:394`), which is the author saying Vite owns them.
- The proxy is a full mirror, not a whitelist: `devServerUrl` returns `http://localhost:${port}${filePath}`
  for any path (`dev-server.ts:77`), so `pack://<id>/@vite/client` resolves and Vite's root-relative update
  imports resolve back through the same origin.
- **No CSP is set anywhere** in main or the renderer, so the client's `ws://localhost:<port>` socket is not
  blocked.

Complete on paper; whether component-level HMR lands through it is the measurement in *Verification*, and it
is needed only for the open question, not for the committed steps.

**Type resolution improves.** `packages/default-setup/tsconfig.json` declares no `@abuddy/source` condition,
so the editor already type-checks it against `dist` — the pack-author layout. The fork today is that the
renderer's Vite compiles its frontend from source with the condition, so the editor and the running dev app
resolve differently.

**The hazard to keep in mind:** with a dev source import the frontend comes from source while the backend
comes from the built runtime, so a feature added to `abuddy.json` without a rebuild shows a plugin whose
system is not registered. That is true today for the same reason, and `abuddy run`'s `abuddy.json` watcher
regenerating entries (`run.ts:377`) is the mitigation to keep.

## "Runs first" is already derived

`packSeedOrder` (`abuddy-host/src/packs/discovery.ts:147`) is a cycle-tolerant topological sort over
declared `dependencies`, already covered by `tests/packs/dependencies.spec.ts`. Its own doc names the
special case it is bypassed by:

> *"A dependency on a built-in pack is already satisfied — the built-in packs' boot seeds run before any
> external pack's"*

A hard-coded phase standing in for an edge the sort would compute. This matters only for the open question:
the committed steps keep the phase, so nothing about ordering changes under them.

---

## How default-setup ships today

The entry point, in five steps:

1. **`electron-builder.mjs:119-171`** — `files` takes `packages/**/*`, minus `!packages/*/src/**`, plus
   `packages/*/dist/**`, with `asar: false` (`:176`). Since 2026-10-02 it also drops
   `!packages/*/.abuddy/**`: a pack's working directory, which that recursive include had been carrying into
   the installer. Worth knowing here because this plan makes a shipped directory authoritative — it holds the
   pack, not the build's leftovers, and nothing in the steps below has to arrange that. default-setup lands
   as a real directory at
   `<resourcesPath>/app/packages/default-setup/`: `abuddy.json` and `dist/` (the seven `*.seed.json`,
   `snapshot.json`, `types/`, `defs/`, `build/`, `runtime/index.cjs`).
2. **`main/src/modules/api-server/config.ts:103`** — Electron main passes
   `BUILT_IN_PACKS_DIR = <resourcesPath>/app/packages` when packaged, `<appPath>/packages` otherwise, and
   `NODE_ENV: app.isPackaged ? 'production' : 'development'` in the same object.
3. **`api/src/runtime/index.ts:151`** — the API process reads it and calls `loadAppPacks(packs, {
   builtInDir, bundledLoaders: () => import('virtual:built-in-pack-loaders') })`.
4. **The renderer** gets the frontend separately, statically imported from source by `builtInPacksPlugin`.
5. **`publishHostPackOutput`** (`api/src/runtime/index.ts:156-170`) copies the pack's types and build output
   to `<userData>/host-packs/<id>` for dependents, and prunes outputs this release no longer ships.

**The backend ships twice.** `runtimeEntry` defaults to `'never'` when `NODE_ENV !== 'development'`
(`loader.ts:106`), so a packaged app loads the registration from the loader bundled into the api bundle, and
the `dist/runtime/index.cjs` in resources is shipped and never read. The frontend ships once, inside the
renderer bundle; `dist/runtime/fe.js` is not built for a built-in pack at all.

---

## The committed work

Three steps, each revertible by reverting its commit. None touches stored user data.

### 1. Delete the `if (!external)` gate in `abuddy build`

`build.ts:305-310` returns early for a built-in pack. Remove it and `abuddy build` produces
`dist/runtime/index.cjs` and `dist/runtime/fe.js` for default-setup with the same bundlers every other pack
uses. Unify the snapshot filename while here: `build.ts:147` writes `BUILT_IN_SNAPSHOT` where every other
pack writes `PACK_LAYOUT.snapshot`.

Then **delete `dev-build.mjs`'s own esbuild** — 164 lines reimplementing `bundlePackRuntime`.

**This is not free for the dev loop, which the first version of this plan got wrong.** `dev-build.mjs` is
also the backend watcher: `dev-mode.js:27` forks it with `--watch` and `:52` waits for its first compile
before the API boots. Keep a thin `--watch` wrapper that calls `bundlePackRuntime` instead of its own
bundler, so `npm start` behaves exactly as it does now. Switching the dev loop to `abuddy run`'s watcher is
the alternative, and it costs the single-command start.

**And it retires three built-in-aware pieces of the build record**, since removing that gate is exactly what
makes default-setup record the `runtime` and `fe` phases like any other pack. Each site names this document:

- `isBuiltIn`, and one branch of `rebuildCommand`, in `scripts/lib/build-reads.ts` — they exist only to name
  the command that rebuilds a pack's record, and with one kind of pack the path answers that, as it already
  does for a fixture pack.
- the two-kind evidence guard in `repo-checks/tests/dep-files.integration.spec.ts` — the nine bundling phases
  take a built-in pack *and* an external one to observe between them, precisely because a built-in pack
  records neither of those two. Afterwards one record carries all nine and the guard collapses into the case
  above it, which asks only whether a record exists.
- the first of the two reasons that record is keyed by phase (`abuddy-cli/src/build/build-reads.ts`): that a
  built-in pack stops before those bundles. The keying stays — `--skip-fe` and `--skip-generate` still skip
  phases — and only that sentence goes.

**The chain's gate gets stronger by the same move**, which is the part worth knowing before starting:
`compile` is observed across seven of nine phases today, because `runtime` and `fe` are reachable only
through the fixture packs, whose step shares no edge with the pool that reads their records. Build
default-setup like any pack and the step on the chain's critical path is observed across all nine.

**Two more pieces come out with `dev-build.mjs`, and one bites before the other.** It writes *two* files:
`dist/runtime/index.cjs` and `dist/runtime/seeds-index.sha256`, the sha256 of the compiled seeds index its
runtime was built beside. `publishHostPackOutput` (`abuddy-host/src/packs/layout.ts:307-310`) **throws** when
those two disagree, so a `--watch` wrapper that drops the hash leaves a packaged app unable to publish its own
build output. Then the guard itself goes: it exists only because seeds and runtime are built by *different
commands* — its own comment says so, and the throw reads *"seeds compiled again without rebuilding the
runtime"* — and one command doing both removes the cause. `BUILT_IN_RUNTIME_SEEDS_HASH`, the file and the throw
are then a check that cannot fail, so they are deleted, or the throw stays as an assertion with a comment
naming the edit that would fire it, which is this repo's rule for one.

**The chain declaration moves too.** `compile` gains the Vite frontend bundle, so its declared `seconds` needs
a deliberate `chain --all --record --forget --step compile`, on the machine the cost table was measured on.
`PACK_OUTPUTS` needs nothing: it declares `packages/default-setup/dist` whole.

**Files:** `abuddy-cli/src/commands/build.ts`, `packages/default-setup/dev-build.mjs`,
`packages/dev-mode.js`, `packages/default-setup/package.json`, `scripts/lib/build-reads.ts`,
`abuddy-cli/src/build/build-reads.ts`, `abuddy-host/src/packs/layout.ts`, `scripts/lib/chain-steps.ts`,
`repo-checks/tests/dep-files.integration.spec.ts`.

**Why first:** it is what makes a shipped pack a *complete* pack on disk, which every later step assumes, and
it is the only step that deletes a mechanism no other pack has.

### 2. Delete `partitionPolicy`

Nothing uses it — the only pack allowed one declares `{"excludedEntityTypes": []}`, so deleting the field
changes no partition behaviour. Remove it from the manifest schema, `PackRegistration`,
`registry.ts:228-232`, the strip at `loader.ts:250-257` and its warning. `database/schema.ts:174`'s
`excluded` then comes from `SDK_EXCLUDED_ENTITY_TYPES` alone.

A field with no user, no fixture and a restriction that has never bound anything is not a capability.

**Files:** `manifest-schema.ts`, `pack-registration.ts`, `loader.ts`, `registry.ts`,
`database/schema.ts`; `npm run schema:update` and `npm run api:update` after.

### 3. Collapse loading

Production loads `dist/runtime/index.cjs` from the pack's own directory, exactly as development already
does, and the frontend loads over `pack://` for every pack.

- Default `runtimeEntry` to loading from disk regardless of `NODE_ENV`; delete `bundledLoaders`,
  `BundledPackLoaders`, the `runtimeEntry` option itself, and `builtInPackLoadersModule` from
  `api/tsup.config.ts`. The api bundle stops carrying a pack's backend.
- Teach the `pack://` handler to resolve against the shipped root as well as `packsDir`
  (`PackProtocol.ts:71-75` is the single `path.resolve` and its prefix check).
- **Re-key `builtInPacksPlugin` rather than deleting it**: dev-only `virtual:dev-pack-frontends`, generated
  from local pack directories (this repo's workspace packs with an FE entry, plus anything named by
  `ABUDDY_DEV_PACK_DIRS`), absent from the production config. The loader prefers the dev map when a pack id
  is in it, else `pack://`. Its alias half goes, having no user.
- `reloadBuiltInPack` and `reloadExternalPack` become one function, both now being "re-require the built
  runtime from the pack's directory".

**What this step does not touch, and the two config files are why it is worth saying:** the generated entries
those virtual modules import. `pack-entry.ts` and `pack-entry-fe.ts` stay on disk, written by `abuddy
generate-entries` on the triggers and under the stamp
[`codegen-staleness.md`](../archive/plans/codegen-staleness.md) records — a pack's own typecheck reads them through
`#generated/*`, so they could not be synthesised by a plugin even if this step wanted them to be. What changes
is only who imports them: after this, each pack's own `abuddy build` rather than the renderer's and the api's.

After this, `manifest.builtIn` decides **nothing about behaviour**: one load path, one reload path, one build
path, one frontend path, no privileges. What survives is axis 1 — the directory a pack lives in.

**Four more things go with those two virtual modules.**

- **Their type declarations.** `api/src/env.d.ts` declares `virtual:built-in-pack-loaders` and
  `renderer/env.d.ts` declares `virtual:built-in-packs`. Delete the plugins without them and the typecheck
  fails on a module nothing provides.
- **The dev-reload wire.** `api/src/transport/websocket.ts:59,72` takes `{ packId, builtIn }` out of the
  `POST /dev/reload` body and branches to the two reload functions this step merges, so the body shape changes
  and `abuddy run`, which posts it, changes with it. Narrowing it is available on its own: the server can
  derive the kind from its registry rather than trust the caller, which is the better shape either way and
  shrinks this step.
- **`build:app` stops reading the pack's sources, which closes a defect that exists today.** The renderer
  bundle carries default-setup's frontend compiled from `src/` — a notes field, `hideCompletedChildren`, is in
  `packages/renderer/dist/assets/index-*.js` — and `build:app` declares neither that tree nor anything that
  moves with it: `PACK_OUTPUTS` is the pack's `dist`, which holds no frontend bundle for a built-in pack, plus
  `src/__generated__`, whose only file that moves on a `.vue` edit is the dot-prefixed `.inputs-hash`, which
  `inputFiles` skips (`abuddy-host/src/build/packages-built.ts:286`). Measured 2026-10-07: edit a `.vue`, run
  `compile`, and `chain --dry` reports `build:app` **cached**, and `test:smoke` with it — a green chain over an
  app that never held the change. **It is fixable today** by declaring `packages/default-setup/src` on that
  step, and waits on nothing here; after this step the edge is gone and that declaration comes back out.
- **What stays, and has to be said because this step claims `manifest.builtIn` decides nothing about
  behaviour:** the Packs plugin reports it (`abuddy-host/src/features/packs/be/system.ts:70,88,97`). That is
  axis 1 — which directory a pack lives in — and it is the one behaviour the claim excepts.

**Files:** `abuddy-host/src/packs/runtime/{loader,reload}.ts`, `api/tsup.config.ts`,
`api/src/runtime/index.ts`, `api/src/env.d.ts`, `api/src/transport/websocket.ts`, `renderer/vite.config.ts`,
`renderer/env.d.ts`, `main/src/modules/pack-protocol/PackProtocol.ts`,
`abuddy-host/src/fe/pack-frontends.ts`, `abuddy-cli/src/commands/run.ts`, `scripts/lib/chain-steps.ts`.

**Verify before starting:** that a packaged API process can `esmRequire` the pack's `dist/runtime/index.cjs`
out of `resources/`. Development already does precisely this through `runtimeEntry: 'prefer'`; the packaged
difference is the path and `NODE_ENV`, and `asar: false` means the file is really there. If it fails, this
step is off and the duplication stays.

---

## The open question: should default-setup be installed?

Everything above leaves one difference: default-setup's directory ships read-only in `resources/` and is
loaded in place, where every other pack is installed into the user's data dir. Removing *that* costs three
further steps, each needing a migration, and they have a dependency order the first version of this plan got
backwards.

**The ordering, and the defect that fixes it.** `loadSingleExternalPack` deletes
`registration.boot.seedManifest` for external packs (`loader.ts:244-249`). So installing default-setup
*before* the seed paths are merged ships a default pack that seeds nothing at all. The seed merge is a
prerequisite for the install, not a revertible tail — which inverts the risk the first version described.

In order:

**A. Move `logs` into the host pack.** `earlySystem` exists for one feature, and a system that must run
before the data layer is up is app infrastructure — which is what `@abuddy/host/features/` already holds.
Moving it deletes `earlySystem` from the pack contract rather than generalising it, which matters: an
arbitrary pack's system running before hydration is a footgun, and the refinement's own reason
(*"before external packs load"*) is circular once the pack declaring it is external.
**Cost:** 11 files, 1407 lines, and the ref `default-setup/logs` → `host/logs` renames stored plugin
settings, so it needs an app migration. `0.3.15.ts` is the precedent and
`tests/migrations/plugin-settings-0.3.15.spec.ts` the test to copy.

**B. Merge the two seed paths.** Keep the external path's per-pack hashing and dependency tracking, port
`seedPolicy` onto it, and fold `builtInSeedHashes`/`builtInSeedFingerprints` into one pair of fields —
renamed, since "external" stops meaning anything. `0.3.15.ts:83-86` renamed *away from* `packSeedHashes` and
`packSeedDeps`, so that migration is the map for renaming back. Measure whether dropping the built-in path's
stat-fingerprint shortcut costs anything at boot before keeping it for every pack.

**C. Install on first boot.** `installPackFromLocal(source, targetPacksDir, options)` →
`installFromDirectory` (`installer.ts:216,252`) already verifies, stages and writes `integrity.json` from a
directory on disk, so the new code is a call site. `BUILT_IN_PACKS_DIR` becomes `SHIPPED_PACKS_DIR` — rename
it, so every reader is revisited. `publishHostPackOutput`/`pruneHostPackOutputs` and `hostPacksDir` go, and
`database/schema.ts`'s two discovery sources and `degraded` branch go with them. On a version bump the
shipped copy is newer than the installed one, so boot compares integrity hashes and re-installs when they
differ — which also covers a user-modified install, a state that cannot exist today.

**What decides it.** With steps 1-3 landed you will know how uniform the paths really are, and the HMR
measurement will have been taken. The questions to answer then: is `publishHostPackOutput` still earning its
keep for external tools, and is `database/schema.ts`'s second source worth a migration to remove? If the
answer to both is no, this stays undone and the remaining "built-in" is one read-only directory — an honest
distinction rather than a privilege.

---

## Verification

**Per step:** `npm run chain`, which routes the suites each change touches. Read the specs whose subject is
the distinction first — `abuddy-host/tests/packs/runtime/{loader,reload}.spec.ts`,
`tests/packs/discovery.spec.ts`, `abuddy-cli/tests/packs/host-output.spec.ts`,
`api/tests/runtime/packaged-boot.spec.ts`. A case deleted because its subject is gone is correct; a case
deleted because it became awkward is the failure mode, so each deletion says which it was in the commit
message.

**Step 1:** `npm start`, edit a backend file, confirm the API hot-reloads as it does today; edit a Vue file,
confirm HMR is unchanged. Then `npm run compile` and confirm `dist/runtime/{index.cjs,fe.js}` both exist.

**Step 3, and the thing that proves it:** a packaged build (`npm run build-prod`) that boots with the api
bundle no longer containing default-setup's backend. `DEBUG_E2E=1 npm test -- smoke` covers the four things
every other check assumes.

**The HMR measurement, needed only for the open question.** Run `abuddy run` against a fixture pack with a
Vue component, edit the component:

| outcome | what it means |
|---|---|
| component-level update, state preserved | the `pack://` path is a real fallback; the dev source import is a convenience |
| full page reload | usable, but the dev source import earns its place |
| nothing | the dev source import is **required** — and check the `res.ok` fallback in `PackProtocol.ts` first, the likeliest cause |

**Mutation checks** for the open question, if it is taken: ship a pack directory with no `integrity.json`
(the install refuses, naming it); leave the installed copy older than the shipped one (boot re-installs);
give a pack a `seedPolicy` and boot twice (the second seeds nothing, and `skipAtBoot` keys are absent both
times); drop a `packSeedOrder` edge (the dependent seeds before its dependency).

## Risks

**The `pack://` proxy masks a dev-server miss.** `PackProtocol.ts:60-69` does `if (res.ok)` and otherwise
falls through to reading the installed pack directory, so a 404 from a running dev server silently serves the
**stale built** `fe.js`. You edit, nothing changes, and nothing says why. Once a marker says a dev server is
running for a pack, a miss belongs as an error naming the path. Worth fixing regardless, and a candidate
cause if the HMR measurement finds nothing happening today.

**A pack's `feStyles` arrives as a separate `<link>`** (`packFrontendIO.styles.add`), where in dev Vite
serves CSS through the JS graph. Stale or absent for a pack being developed. Harmless today because the packs
using that path are not the ones with HMR; it stops being harmless under step 3.

**Step 1 touches the dev loop.** `dev-build.mjs` is the backend watcher, not just a build. Replacing it badly
makes `npm start` slower or stops the API hot-reloading, which is the most-used path in the repo.

**Step 3 changes what a release loads.** The api bundle stops carrying a pack's backend, so a packaging
mistake becomes "the app boots with no default pack" rather than a build error. The pre-flight check above is
what stands between the plan and that outcome.

**`dist/runtime/fe.js` becomes load-bearing for the app's own frontend** under step 3. A pack FE bundle that
fails to build currently costs an external pack its UI; afterwards it costs the app its UI in production.
`compile` runs in the chain, so it is caught before a release, but it is a new way for a green typecheck to
ship a broken app.

## What this is not

- Not making packs installable from a registry: `resolveFromRemoteRegistry` still throws for every name.
- Not a performance change. The win is four build paths becoming one and two load paths becoming one.
- Not a change to `@abuddy/sdk`'s published surface, except that `partitionPolicy` leaves the manifest schema
  in step 2 (and `earlySystem` would in open-question step A), which needs `schema:update` and `api:update`.

## How this plan was wrong

Recorded so the same shape is recognisable next time, and because the corrections are why the structure
changed.

| the claim | what was wrong |
|---|---|
| "four pieces of work that remove it", sequenced 1-4 | `boot.seedManifest` is stripped from external packs, so installing default-setup before merging the seed paths ships a pack that seeds nothing. The order was wrong, and the migration was a prerequisite rather than the revertible tail |
| "three build paths" | Four. `abuddy build` returns early for a built-in pack, so `dev-build.mjs` exists — 164 lines no other pack has |
| "item 1 is free" | Deleting `dev-build.mjs` removes the backend watcher `npm start` depends on |
| "worth doing" | A measurement with a verdict attached. No criterion was stated, so nothing could have failed it |
| "the one real loss is frontend HMR" | HMR is keyed on a static import, not on being built-in. Re-keying keeps it, and extends it to any pack author in a checkout |
