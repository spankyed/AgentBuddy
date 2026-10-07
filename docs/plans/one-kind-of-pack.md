# One kind of pack: retire "built-in"

Compiled 2026-10-02 on `AS/one-action-cache`, from reading the pack load, reload, seed, build and packaging
paths end to end. Every location, count and privilege below was checked against the tree on that date.
Restructured the same day, after the first version was found to be a proposal wearing a decision's clothes —
what changed and why is in **How this plan was wrong** at the end.

> **Every citation here was last checked against the tree on 2026-10-07**, and each of steps 1-3
> is still undone — `bundledLoaders`, `builtInPackLoadersModule` and `partitionPolicy` are all present.
> Ten citations had drifted in five days and are corrected in place, which is the rate to expect: six line
> numbers moved under edits to the files they name, and four of the five test sizes gained a line to one
> refactor (`bdfa88299`, reading the installed layout from `PACK_LAYOUT`). Nothing a step rests on had moved.
> A count or a line number below is as good as that date; what is held to the code is named in the step that
> needs it.
>
> **The branch also gave item 1 three more things to delete.** `abuddy build` now records what each bundling
> phase read, and that record is built-in-aware in three places — listed under item 1, each carrying a
> comment naming this document, so the work is findable from the code and not only from here.

**Six steps in one sequence.** There is no open question left and no second category: the order is forced by
two facts in the code, and the only thing the plan must not trade away is the developer experience, which
step 3 is held to by an acceptance test rather than an argument.

## The requirement, and what sorts the rest

**Full frontend and backend hot reload for every pack in the workspace, from `npm run start`, with no
separate `abuddy run` process.** That is the one requirement; everything else here is negotiable against it.
It is not a tightening — it is what *one* pack has today, and the work is to stop that depending on which
pack it is. Step 3 carries it as a test.

**What used to sort this plan was a criterion that does not hold: "collapse a duplication where it needs no
stored-data migration".** It split the work in two and deferred half of it, on the premise that a migration
is a one-way door. There is one user of this app and he is its author, so both migrations below are
conveniences — skip them and every pack re-seeds once (seeds are upsert, so nothing is lost) and the `logs`
plugin's settings and tab-visibility choice revert to defaults. `CLAUDE.md`'s carve-out for stored data is
written for users this repo does not have, and a criterion resting on it was dividing the work on a fiction.

So what orders the steps is the code: `abuddy build`'s gate blocks the generic backend watcher (step 1 before
step 3), and `loadSingleExternalPack` strips `boot.seedManifest` (step 5 before step 6).

## Three axes, not one question

"Built-in" conflates three things, and only the first is a real distinction:

| axis | real? | what it decides |
|---|---|---|
| **where the files live** — read-only in `resources/` vs the user's data dir | **yes**, irreducibly | whether a pack is installed or loaded in place |
| **how the code is loaded** — bundled into the app vs required from the pack's own directory | no | one load path or two |
| **what the pack may do** — `earlySystem`, declarative seeds, partition policy | no | whether the privileged pack is the one that proves the author-facing path works |

Axes 2 and 3 are accidental and come out cheaply, in steps 1-3. Axis 1 is legitimate and comes out in steps
4-6, which is where install-on-first-boot and the two migrations are. Nothing about that order is a hedge:
steps 1-3 are what the requirement needs, and doing them first is what makes step 6 a packaging change
rather than a devex regression.

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

**Two seed-change mechanisms, both recorded in `AppState`.** `builtInSeedHashes`
(`orchestrateDeclarativeSeed`, `seed.ts:170`) against `externalSeedHashes` + `externalSeedDeps` — a per-pack
hash and the dependency state a failed seed faced (`importPackSeeds`, `seed.ts:88`). The external one is the
more capable; the built-in one carries `seedPolicy` (`evaluateSeedPolicy`, `seed.ts:146`), which the external
path never evaluates.

**Narrowed on 2026-10-07** (`0a25ff990`): both hashes are content now, where the external one also hashed file
times and the built-in one kept a `builtInSeedFingerprints` record of them as a fast path. What is left is two
*records* over one question, not two answers to it — which is the half a merge can just rename.

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

**`npm start` keeps working, default-setup's frontend HMR does not change, and every other workspace pack
gains it.** Those are the three sentences that matter; the rest is why.

**Two dev loops exist and only one of them is good**, which is the whole of the problem:

| | frontend | backend |
|---|---|---|
| a pack that ships with the app, under `npm start` | **component-level HMR** — the renderer's Vite imports its entry from source, so the pack's modules are in the renderer's own graph | watch → esbuild → `POST /dev/reload` (`default-setup/dev-build.mjs`, forked by `dev-mode.js`) |
| any other pack, under `abuddy run` | **a window reload** — measured 2026-10-07, and nothing at all before `0a25ff990` fixed `compiledSource` | watch → `abuddy build` → install → `POST /dev/reload` |

Neither row is about shipping with the app. The frontend row is about whose Vite owns the modules; the
backend row is about a watcher that lives *inside* one pack because `abuddy build` refuses to build its
runtime. Steps 1 and 3 remove both reasons, and the second column is then one watcher for every pack —
which is what retires `abuddy run` for a pack in this workspace.

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
was taken on 2026-10-07, against the `external-pack` fixture with `DEBUG=vite:hmr`: an edit to a `.vue`
produces `page reload`, not a component update, because the app imports the pack's entry through `pack://` —
outside Vite's graph — so no importer is there to accept one. **That is this path's ceiling**, and the reason
step 3's dev source import is load-bearing rather than a convenience. Getting that far also took a fix:
`compiledSource` read `ctx.load().code`, which throws in a dev server, so the loop did nothing at all while
`abuddy run` printed that it was hot-reloading.

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

A hard-coded phase standing in for an edge the sort would compute. It matters only from step 6, when a
shipped pack becomes an installed one and the phase has nothing left to stand for: steps 1-5 keep it, so
nothing about ordering changes under them.

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

## The work, in order

Six steps. Steps 1-3 are what the requirement needs and touch no stored data; 4-6 remove the last axis and
move two records, each with an optional migration. The order is the code's, not a risk ranking.

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

**The pre-flight is done.** A packaged API process can `esmRequire` the pack's `dist/runtime/index.cjs` out
of `resources/` — measured 2026-10-07 by building the api bundle with `runtimeEntry` defaulted to `'only'`,
so no bundled loader existed to fall back to, and booting it: *"Loaded built-in pack (dev): default-setup"*,
then the server up. The other half cannot be tested in a checkout at all — `source-resolution.ts:73` refuses
any process that resolves `@abuddy/*` to `dist` while a `src/` sits beside it, which is every checkout and no
packaged build — and needs no test, being what every installed external pack already does in production
through the same `withHostResolution`.

**The acceptance test, which is the requirement and not a nicety.** After this step, from `npm run start`
alone, with no `abuddy run` process:

- editing a `.vue` in **any** workspace pack patches the component and keeps the app's state;
- editing that pack's backend rebuilds it and hot-reloads it in place;
- `tests/packs/external-pack` behaves the same as `packages/default-setup`, because nothing in the path reads
  which pack it is.

If the first bullet fails for a pack that is not default-setup, this step is not done, whatever else passes.

---

Steps 1-3 leave one difference: default-setup's directory ships read-only in `resources/` and is loaded in
place, where every other pack is installed into the user's data dir. These three remove it.

**The ordering is forced by one line.** `loadSingleExternalPack` deletes `registration.boot.seedManifest` for
external packs (`loader.ts:244-249`), and `evaluateSeedPolicy` is called only from the declarative path
(`seed.ts:184`). So installing default-setup before step 5 gives it `importPackSeeds`, which evaluates no
`seedPolicy` — and default-setup declares `skipAtBoot: ['settings']` and `skipAfterOnboarding: ['notes']`, so
its settings would be reset at every boot and its notes would come back after onboarding. Step 5 before step
6 is not a preference.

### 4. Move `logs` into the host pack

`earlySystem` exists for one feature, and a system that must run
before the data layer is up is app infrastructure — which is what `@abuddy/host/features/` already holds.
Moving it deletes `earlySystem` from the pack contract rather than generalising it, which matters: an
arbitrary pack's system running before hydration is a footgun, and the refinement's own reason
(*"before external packs load"*) is circular once the pack declaring it is external.
**Cost:** 11 files, 1407 lines, and the ref `default-setup/logs` → `host/logs` is a key in three stored
places — the settings row's `plugins` section, `AppState.pluginVisibility` and `AppState.lastActivePlugin`.
A migration moves them (`0.3.15.ts` is the precedent, `tests/migrations/plugin-settings-0.3.15.spec.ts` the
test to copy); skipping it costs the one user his logs settings and tab-visibility choice, which is why this
is a convenience rather than a gate.

### 5. Merge the two seed paths

Keep the external path's per-pack hashing and dependency tracking, port
`seedPolicy` onto it, and fold `builtInSeedHashes` into `externalSeedHashes` — renamed, since "external" stops
meaning anything. `0.3.15.ts` renamed *away from* `packSeedHashes` and `packSeedDeps`, so that migration is the
map for renaming back.

**Cheaper than it was, because the semantics are settled.** This used to carry a decision as well as a rename:
the two hashes disagreed about what "changed" means — the external one counted file times, so a `touch`
re-seeded and a reinstall of identical bytes did too, while the built-in one counted bytes alone behind a
`builtInSeedFingerprints` stat cache. `0a25ff990` made both content-only and deleted that field, measuring the
cache at 0.38ms over default-setup's 490KB (0.07ms to stat the same files) — so there is no shortcut left to
decide about, and the fields differ only in name. Asking for a pack's data back is `IMPORT_PACK_SEEDS`.

### 6. Install on first boot

`installPackFromLocal(source, targetPacksDir, options)` →
`installFromDirectory` (`installer.ts:216,252`) already verifies, stages and writes `integrity.json` from a
directory on disk, so the new code is a call site. `BUILT_IN_PACKS_DIR` becomes `SHIPPED_PACKS_DIR` — rename
it, so every reader is revisited. `publishHostPackOutput`/`pruneHostPackOutputs` and `hostPacksDir` go, and
`database/schema.ts`'s two discovery sources and `degraded` branch go with them. On a version bump the
shipped copy is newer than the installed one, so boot compares integrity hashes and re-installs when they
differ — which also covers a user-modified install, a state that cannot exist today.

**`shippedWithApp` is what this step replaces, and it is two questions wearing one predicate.**
`system.ts:116` feeds three refusals: two that an installed pack may not take a shipped pack's id (`:184`,
`:315`) and one that a shipped pack cannot be uninstalled (`:240`). Split them, because only the second is
about shipping:

- **may this be uninstalled?** — a pack property, `false` for whatever the app cannot run without, which the
  Packs view reads to hide the button. Defaulting a shipped pack to `false` keeps today's behaviour exactly,
  and flipping it later is a product decision rather than a refactor. Uninstallable and replaceable built-ins
  are on the roadmap, so this step moves toward that rather than against it.
- **may an install take this id?** — not about shipping at all, but about an id already being in use, which
  `installedPacks()` answers. A shipped pack is in that list once it is installed, so this half mostly
  **deletes**: it existed because nothing else knew about packs that were not installed.

**What this buys, which is the whole reason for steps 4-6:** `publishHostPackOutput` and
`pruneHostPackOutputs` go, `hostPacksDir` with them, `fetch-deps.ts:157`'s special case becomes an ordinary
`packsDir` lookup, and `database/schema.ts` loses its second discovery source and its `degraded` branch.

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

**Step 3 is held to the requirement, and this is the test.** From `npm run start` alone, with no
`abuddy run` process: edit a `.vue` in `tests/packs/external-pack` and in `packages/default-setup`, and both
patch the component with the app's state intact; edit each one's backend and both rebuild and reload in
place. The fixture pack behaving differently from default-setup is the failure, whatever else passes.

**The `pack://` ceiling is measured and needs no re-taking**: `page reload`, 2026-10-07, with `DEBUG=vite:hmr`
naming it. That is the fallback for an author working against a packaged or beta app, where there is no
renderer Vite to own the modules — which is what a dev server is rather than a divergence anyone chose.

**Mutation checks for steps 4-6:** ship a pack directory with no `integrity.json` (the install refuses,
naming it); leave the installed copy older than the shipped one (boot re-installs); give a pack a
`seedPolicy` and boot twice (the second seeds nothing, and `skipAtBoot` keys are absent both times); drop a
`packSeedOrder` edge (the dependent seeds before its dependency); set a shipped pack's uninstall property
true and watch the Packs view offer the button.

## Risks

**The `pack://` proxy masks a dev-server miss.** `PackProtocol.ts:60-69` does `if (res.ok)` and otherwise
falls through to reading the installed pack directory, so a 404 from a running dev server silently serves the
**stale built** `fe.js`. You edit, nothing changes, and nothing says why. Once a marker says a dev server is
running for a pack, a miss belongs as an error naming the path. Worth fixing regardless; it was not the cause
of the dead loop (`ctx.load().code` was), which is why it is still here to find.

**A pack's `feStyles` arrives as a separate `<link>`** (`packFrontendIO.styles.add`), where in dev Vite
serves CSS through the JS graph. Stale or absent for a pack being developed. Harmless today because the packs
using that path are not the ones with HMR; it stops being harmless under step 3.

**Step 1 touches the dev loop.** `dev-build.mjs` is the backend watcher, not just a build. Replacing it badly
makes `npm start` slower or stops the API hot-reloading, which is the most-used path in the repo.

**Step 3 changes what a release loads.** The api bundle stops carrying a pack's backend, so a packaging
mistake becomes "the app boots with no default pack" rather than a build error. The pre-flight above was
taken and passed, so what stands between the plan and that outcome is a `build-prod` smoke run per release
rather than an argument.

**Step 6 makes first boot able to fail, which is the one real behaviour change here.** Today the app cannot
fail to find its default pack; afterwards a disk-full or permissions error at first launch means no packs.
Decided rather than mitigated away: the install is idempotent and verified at every boot, and a failure is
loud — fatal with a message naming the pack and the path — rather than a silently packless app. The
alternative, a read-only fallback that loads straight from `resources/`, is the built-in load path returning
in disguise and should be rejected unless the install proves unreliable in practice.

**What the install costs the backend edit loop: ~10ms**, which is the objection that did not survive
measurement. default-setup's `dist` is 4.2MB over 20 files; `placePack`'s copy is 7ms (median of 5, 6-9ms)
and the sha256 of every file that `stagePack` does for `integrity.json` is 3ms — both 2026-10-07, against an
esbuild rebuild of hundreds of milliseconds. Installing a pack per backend edit is not a devex cost.

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
| **the criterion itself**: "collapse a duplication where it needs no stored-data migration" | It split the work in two and deferred half on the premise that a migration is a one-way door. There is one user and he wrote the app, so both migrations are conveniences — `CLAUDE.md`'s carve-out for stored data is written for users this repo does not have. The order the steps actually have is the code's: one gate, one strip |
| three reasons step 6 was "a question" | A migration that costs nothing is not a reason; "it renames back to what 0.3.15 renamed away from" was an observation, not an objection; and the seed record's uninstall lifetime is answered by letting shipped packs be uninstallable, with a property deciding whether the button shows — which is on the roadmap anyway |
