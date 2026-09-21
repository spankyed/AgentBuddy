# Architecture

This chapter covers how packs work under the hood: loading, dependency sharing, generated files, and the build pipeline. You don't need this to write a pack, but it helps when debugging or doing advanced work.

## App environment and data directory

Every process resolves its environment and data paths through `resolveAppContext()` (`@abuddy/sdk/env`).

- **Environment:** `production`, `beta`, `development` or `test`. The Electron main process decides it once: Playwright runs are `test`, packaged builds use the channel stamped at build time, and source runs use `ABUDDY_ENV` or default to `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process. A process that gets neither, and isn't given `{ env }`, throws; nothing falls back to production.
- **Data directory:** `ABUDDY_USER_DATA_DIR` if set, otherwise the platform's app data dir for the environment's app name (`abuddy`, `abuddy-beta`, `abuddy-dev`, `abuddy-test`). On macOS that is `~/Library/Application Support/<appName>`.

| Path under the data dir | Contents |
|---|---|
| `packs/` | Installed external packs, one directory per pack id |
| `host-packs/` | Build artifacts of the app's built-in packs, published at boot for pack authors' dependency resolution |
| `installed-packs.json` | Installed external packs and their `enabled` state |
| `ears-db/` | Primary LMDB database |
| `ears-trace/` | Volatile LMDB database (flow execution records) |
| `secrets.json` | API keys: metadata plain, values encrypted |
| `media/` | Media assets |
| `api-port` | The API's port (development only) |
| `api-token` | The token the API requires, for local tools (development only, readable only by you) |

CLI commands pass `{ env }` explicitly: `abuddy install`/`uninstall`/`list` target production unless given `-d` (development) or `-b` (beta).

## Layers

The app is built from packages whose imports point down only (`npm run check:specifiers` fails on an upward import):

| Package | Holds | Imports |
|---|---|---|
| `@abuddy/ears` | The EARS engine (`createEarsEngine`), its types, the persistence port; `@abuddy/ears/lmdb`, the LMDB store | No `@abuddy/*` package |
| `@abuddy/sdk` | The pack contract and pack runtime: the lookups of what packs registered, service contracts, event sends, logging and error reports over the bound bus, the SDK entities and their repositories, the `HostRuntime` port | `@abuddy/ears` |
| `@abuddy/host` (private) | The app runtime: the five app services (`/services`), the app's own state (`/app-state`), the registered packs and pack runtime (`/packs`, `/packs/runtime`), the bus (`/bus`), migrations (`/migrations`), API keys (`/secrets`) | `@abuddy/sdk`, `@abuddy/ears` |
| `packages/api` | Transport (`node:http`, `ws`, tRPC routers, the log stream), process boot and composition | All of the above |
| `packages/renderer` | The frontend composition: binds the frontend port | |

Packs import `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/ui`, never `@abuddy/host`. What an app owns is an instance its composition root creates and binds: the engine, the registered packs (`createPackRegistry()`, and in the renderer `createFePackRegistry()`) and the host services. No SDK, EARS or host module keeps them at module scope.

## Pack loading lifecycle

### Install

`abuddy install` (or the Packs view) installs into the data dir's `packs/<id>/`. An installed pack has the pack layout, the same layout as `abuddy build`'s `dist/` and the release archive:

```
<id>/
  abuddy.json          # The pack's manifest, as written
  integrity.json          # Format version, versions, source, sha256 of every file
  runtime/
    index.cjs          # Backend: exports `registration` and `setCompiledDir`
    fe.js              # Frontend entry
    fe.css             # Extracted styles
    seeds/             # Compiled seed data
  build/               # Build-time code dependents load (step build facets, seed runtime)
  types/
    snapshot.json      # Types, manifest, SDK version, flow helpers for dependents' codegen
```

Installing is stage, verify, place:

1. **Stage:** a built pack source is copied into a temporary staging directory (`runtime/`, `build/`, `types/` from `dist/`, without source maps), with the resolved `abuddy.json` and a `integrity.json` listing each file's sha256. An archive — `.tgz` or `.zip` — is checked against its sha256 before anything is unpacked. A GitHub install takes that checksum from the release's `<archive>.sha256` asset and refuses a release that publishes none; a URL install has one only if the caller passes it, and warns when it doesn't. Downloads carry a two-minute timeout, so a stalled one fails instead of hanging the install.
2. **Verify:** the pack's format version must match the host's, and the files on disk must be exactly the ones `integrity.json` lists, with matching checksums.
3. **Place:** the staged pack is copied into a hidden `.<id>.installing-<pid>-…` dir in `packs/`, the current copy (if any) is renamed aside to `.<id>.previous-…`, the new copy is renamed into place, and the previous one is removed. At boot, `prepareHostDataDirs` restores a pack whose install crashed between those renames, unless the pack was uninstalled since, and removes stale staging dirs (a dir whose process is gone, or which predates the boot).

The source directory must be built first: installing a directory with neither a `integrity.json` nor a `dist/runtime/index.cjs` beside `dist/types/snapshot.json` fails and asks you to run `abuddy build`. A directory in `packs/` that isn't a pack layout is skipped at boot with a warning.

### Backend boot

`setupBackend()` in `packages/api/src/setup/backend.ts` runs, in order. The API holds only transport, process boot and this composition: the app runtime it calls lives in `@abuddy/host` (pack loading, lifecycle, reload and seeding in `@abuddy/host/packs/runtime`, the migrations runners in `@abuddy/host/migrations`, the bus in `@abuddy/host/bus`).

0. Opens the app's data and binds the app (`openAppStore()`): it creates the app's registered packs (`createPackRegistry()` from `@abuddy/host/packs`), which the SDK's lookups read once bound, and the rest of the steps register into it.
1. Registers the host `packs` system.
2. `prepareHostDataDirs`: records the app version in the data dir (for `abuddy install`) and recovers staging dirs in `packs/` and `host-packs/`.
3. `forwardSecretsChanges` (`@abuddy/host/secrets`): the settings system hears of API key changes.
4. Loads packs. Built-in packs load asynchronously while external packs load and register:
   - **Built-in:** discovered from `BUILT_IN_PACKS_DIR` (`abuddy.json` with `builtIn: true`). In development each pack's `dist/runtime/index.cjs` is loaded when it exists, falling back to the loaders bundled into the API, which `setup/backend.ts` passes to `loadBuiltInPacks` as `bundledLoaders` (the API build generates them as `virtual:built-in-pack-loaders`); otherwise the bundled loader is used.
   - **External:** discovered in `packs/` and reconciled with `installed-packs.json` (new packs added enabled, missing ones removed). For each enabled pack: `hostVersion` check, pack layout format check, a warning on an SDK major version mismatch, `runtime/index.cjs` loaded through the module bridge, and `earlySystem`, `seedManifest` and `partitionPolicy` stripped. Each pack's systems register as `<packId>.<featureId>`.
   - The registry's `registerPack()` stores each registration (see [Collision detection](#collision-detection)). A pack contributes only through its registration: nothing registers when its modules are imported.
5. Publishes each built-in pack's build output into `host-packs/<id>/`.
6. Starts the `earlySystem` (default-setup's logs system).
7. Wires each pack's `onShutdown` hook, keyed by pack id.
8. Hydrates the app's engine from LMDB. Every pack's entity types are registered by now, so the partition policy sees them all.
9. Runs every pack's `onInit`.
10. Runs app migrations (`runAppMigrations`: the host's own, then the built-in packs', against the app version), then external pack migrations (`runPackMigrations`, each against its own pack version).
11. Seeds: each built-in pack's declarative `boot.seed`, then external packs' compiled seeds, skipped when a pack's seed hash hasn't changed.
12. Starts the bus actor (`createAppBus(registry)` from `@abuddy/host/bus`), which spawns every registered system.

### Frontend boot

Built-in packs' frontends are compiled into the renderer (`virtual:built-in-packs` imports each pack's `__generated__/pack-entry-fe.ts`). External packs load at runtime:

1. Each time this window's bus subscription is established, the application actor queries the loaded packs (`trpc.packs.loaded`), which lists each loaded external pack's `feEntry` and `feStyles` — the pack's `runtime/fe.js` and `runtime/fe.css`, when it has them. It loads only the packs it hasn't loaded yet, so a query that fails leaves them to the next connection and a pack is never loaded twice.
2. For each external pack, `loadPackFrontend(pack)`:
   - loads `pack://<id>/runtime/fe.css` as a `<link>` when the pack has styles;
   - imports `pack://<id>/runtime/fe.js` and registers its default export, a `PackFERegistration`, in the renderer's frontend registry (`createFePackRegistry()` from `@abuddy/host/fe`, bound with `bindFeHost`);
   - returns the plugins it exports, `[]` when the load failed, or `null` for a pack without frontend code.
3. When it returns plugins (even none), the loader reports `PACK_FRONTEND_LOADED` to the application actor, which spawns the plugins whose ids aren't taken and calls `trpc.bus.packClientReady({ packId })`.
4. `packClientReady` sends the pack's systems `CLIENT_CONNECTED`, so they send their startup data once the plugin actors exist.

A connection's own `CLIENT_CONNECTED` skips the systems of external packs with frontend code (the bus asks `getPacksWithClientLoadedFrontends()`). When the renderer's bus subscription (re)connects, `BUS_SUBSCRIBED` calls `packClientReady` again for every pack whose frontend it loaded. Systems of packs without frontend code get the connection's `CLIENT_CONNECTED` directly.

### Activation, teardown and reload

The `packs` system handles install, uninstall, enable/disable and update from the Packs view:

- **Activate** (after install or update, or on enable): reads the pack's manifest, loads and registers it, registers `onShutdown`, runs `onInit`, then the pack's pending migrations and its seeds (skipped when its compiled seeds are unchanged), sends the bus `PACK_CHANGED` so running systems refresh what they read from packs, then `ACTIVATE_PACK` to spawn its systems. The renderer hears `PACK_ACTIVATED` and asks the application actor to load the frontends it hasn't, the new pack's included. The bus sends `CLIENT_CONNECTED` right away only for a pack without frontend code; otherwise it waits for `packClientReady`. An install or update that activated but failed to seed reports the seed error.
- **Teardown** (before uninstall or update, or on disable): runs the pack's shutdown hooks, unregisters it (registration keeps the event types `bus.send` accepts current), clears its modules from the require cache, and sends the bus `TEARDOWN_PACK` to stop its systems. The renderer hears `PACK_DEACTIVATED`, unregisters the pack's FE extensions, removes its stylesheets and unloads its plugins.
- **Reload** (development, `POST /dev/reload` on the API from `abuddy dev` or a built-in pack's watch build; a development or test app takes it only with the API token, handled by `reloadExternalPack`/`reloadBuiltInPack` in `@abuddy/host/packs/runtime`): loads and registers the rebuilt runtime before shutting the running one down. If the fresh runtime fails to load or register, the running pack is re-registered and stays as it was. Otherwise the old shutdown hooks run, the new `onShutdown` registers, `onInit` runs, external packs run their pending migrations and re-seed, and the bus `RELOAD_PACK` stops the old and new system ids and starts those still registered, then sends them `CLIENT_CONNECTED`; `PACK_CHANGED` follows for every running system. Teardown (disable, uninstall) sends it too, after stopping the pack's systems.

An external pack's migrations run at boot, on activation and on reload, each against the pack's own version; the app's run at boot and after a reset or backup import.

## Entry contracts

### Backend entry (`PackRegistration`)

Your `__generated__/pack-entry.ts` exports a registration object (`@abuddy/sdk/framework`):

```typescript
export const registration: PackRegistration = {
  id: string;
  systems: PackSystemDef[];        // { id, machine, events, designation? }
  services?: Record<string, unknown>;
  ears?: PackEARS;                 // entities, relKinds, partitionPolicy?
  boot?: PackBootHooks;            // earlySystem (features[].earlySystem), onInit/onShutdown (boot.hooks), seedManifest (boot.seed, stripped from external packs)
  migrations?: PackMigration[];    // { target, description, up }
  repositories?: Record<string, unknown>;  // features[].repositories, registered with the app's engine
  steps?: StepDefinition[];
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  seedHooks?: Record<string, SeedHooks>;  // abuddy.json `seedHooks`, keyed by entity type
  seeders?: Seeder[];              // one per seeded boot.seed key, which seeding the pack's compiled seeds runs
  commands?: PackCommand[];        // abuddy.json `commands`
  features?: PackFeatureDef[];     // { id, designation?, hasSystem, hasPlugin, services, settings? }
};
```

The runtime bundle also exports `setCompiledDir(dir)`, which the host calls with the directory of the pack's compiled seeds.

### Frontend entry (`PackFERegistration`)

Your `__generated__/pack-entry-fe.ts` default-exports:

```typescript
export default {
  plugins?: Plugin[];
  defaultPlugin?: Plugin;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  dslTypes?: Record<string, DslTypeConfig>;  // abuddy.json `dsl` entries with a `monaco` target
} satisfies PackFERegistration;
```

Both entry files are auto-generated by `generate-entries`. You don't write them by hand. Everything your pack contributes arrives in these two registrations, seeders and DSL types included: the SDK has no registry for pack code to write to, and its lookups (`getDesignated`, `stepRegistry`, `getPackCommands`, `getDslTypes`, `services`, …) read what the app registered.

### Collision detection

`registerPack()` refuses a registration that would collide:

| What | Checked against |
|---|---|
| Pack id | Registered packs |
| Entity types, relation kinds | Other packs' (names the SDK owns are dropped from a pack's own first) |
| Service keys | Other packs' keys and the host's own services (`logger`, `emitter`, `repository`, `appData`, `traceStore`, `inference`, `secrets`) |
| Designations | Other packs' roles |
| Seed hooks | Another pack's hooks for the same entity type |
| Seeders | Two seeders for one seed key in the pack |
| Commands | Other packs' command names |
| Feature settings | A feature setting anything but its own plugin's settings |

Steps, artifacts, blocks, seed hooks, seeders, commands and feature settings register one at a time; if one fails, those already registered in the call are unregistered. A step type another registration defines is merged facet by facet (build, runtime, frontend); a later artifact or block of a registered type replaces it.

## The `pack://` protocol

A custom Electron protocol registered in the main process. It serves files from the pack's install directory.

```
pack://<packId>/<filePath>
```

- Resolves to `<userDataDir>/packs/<packId>/<filePath>`
- Path traversal protection: the resolved path must be inside the pack's directory
- While `abuddy dev` runs, `<userDataDir>/pack-dev-servers/<packId>.json` names the pack's Vite dev server port, and requests are proxied there (an invalid port answers 502; a failed or non-OK fetch falls back to the file). The marker lives outside the pack directory, so the installed pack still verifies and the marker survives reinstalls
- Used by the renderer to load `runtime/fe.js`, `runtime/fe.css`, and other pack assets

## Host dependency sharing

### Frontend: `window.__abuddy`

Packs share runtime dependencies with the host via `window.__abuddy` globals. This is critical for correctness — modules with internal state (Vue's reactivity system, XState's actor registry, the SDK's bound frontend host, which its lookups read) must be singletons.

**Host side (Vite):** A Vite plugin generates a virtual module that star-imports all shared deps and SDK modules, assigning them to `window.__abuddy`:

```javascript
// Generated at host build time
import * as vue from 'vue';
import * as xstate from 'xstate';
import * as sdkFe from '@abuddy/sdk/fe';
// ...
window.__abuddy = { vue, xstate, sdkFe, /* ... */ };
```

**Pack side (Vite):** A single Vite plugin (`packExternalsPlugin`) intercepts imports of shared deps and SDK barrels, replacing them with virtual modules that proxy from the globals:

```javascript
// import { ref } from 'vue'  becomes:
const __m = window.__abuddy.vue;
export const ref = __m.ref;
export default __m;
```

#### Shared third-party deps

`vue`, `xstate`, `@xstate/vue`, `@tiptap/core`, `@tiptap/vue-3`, `@tiptap/starter-kit`, `reka-ui`, `lucide-vue-next`, `@vue-flow/core`, and every subpath of `@tiptap/pm` and `@tiptap/vue-3`

#### Shared SDK modules

`@abuddy/sdk/fe`, `@abuddy/sdk/runtime`, `@abuddy/sdk/steps`, `@abuddy/sdk/artifacts`, `@abuddy/sdk/blocks`, `@abuddy/sdk/designations`, `@abuddy/sdk/events` (`sdkEvents`), `@abuddy/sdk/helpers`, and every `@abuddy/ui` export

#### Deep subpath imports

Only registered barrel subpaths are externalized. Other SDK modules resolve and bundle: the file is compiled into your pack's `fe.js`. The FE build fails if a bundled SDK module needs the app's binding (`bindHost`/`bindFeHost` in `@abuddy/sdk/runtime`), since a bundled copy has nothing bound.

#### `@abuddy/ui`

Components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`) come from the separate `@abuddy/ui` package. Add it to your pack's dependencies when your UI uses them; backend-only packs don't install it or its editor libraries. The package ships compiled JS with declarations, so component props typecheck with plain `tsc`.

At runtime your pack uses the app's copy: `abuddy build` turns `@abuddy/ui` imports into references to the modules the app exposes, the same way it handles the shared SDK modules. Your `fe.js` stays small, and stateful modules (the Monaco configuration, editor extensions) have one instance across the app. `@abuddy/ui` changes follow semver, and your pack's `hostVersion` states which apps it runs in.

To ship your own copy instead, set `fe.bundleUi` in `abuddy.json`. All of `@abuddy/ui` is then bundled into `fe.js`, so the pack never mixes its copy with the app's.

### Backend: the module bridge

The API bundles its own copy of `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/host`. Pack runtime code loaded from disk would otherwise get separate instances, with no app bound: no registered packs to look up and no installed EARS engine. `@abuddy/sdk` and `@abuddy/ears` are the shared-instance packages (`SHARED_INSTANCE_PACKAGES` in `@abuddy/host/build/shared-deps`): the bundler externals, this bridge and the test harness's all derive from that one list.

`withHostResolution(fn)` (`packages/abuddy-host/src/packs/runtime/bridge.ts`) runs a `require()` of pack code through `withModuleBridge()` (`@abuddy/host/packs`), which:

- puts the loader's instances (the API bundle's, in the app) of the bridged `@abuddy/sdk`, `@abuddy/ears` modules (every backend export of the shared-instance packages, except `@abuddy/ears/lmdb`, which only the app loads) in the require cache, and patches `Module._resolveFilename` so those specifiers resolve to them;
- resolves the shared backend packages (`xstate`, `zod`) from the API, since an installed pack has no `node_modules`;
- restores the resolver afterwards. The bridged modules stay cached, so requires the pack makes later get them too.

The pack test harness uses the same bridge with the pack's own SDK instance.

## Host services

The SDK reaches the running app through one typed port, `HostRuntime` (`@abuddy/sdk/runtime`), bound once per process with `bindHost`: the app's event bus (`transport.rootEvents`), its EARS engine, the registered packs, the app version, and the five services packs call that the app implements: `appData` (reset, backup export/import, onboarding), `traceStore` (the volatile trace store), `inference` (model calls), `secrets` (API key metadata) and `filesystem` (files and folders on disk). Their contracts live in `@abuddy/sdk/services`; the implementations live in `@abuddy/host/services`, whose `createHostRuntime(...)` assembles the runtime. `openAppStore()` in `packages/api/src/setup/backend.ts`, which `setupBackend()` calls first, opens the LMDB store and binds that runtime over it. `appData.reset()` resets the whole app as a fresh boot leaves it: it empties the stores and keys, then runs each pack's `onInit` and boot seed, then the app migrations.

Sends, logging and error reports are SDK code over the bound bus: `sendToSystem` emits an incoming event, `sendToPlugin` (and `services.emitter.sendToPlugin`) goes through the bus actor, which drops it until a client connects, like a system's `emit`, and `createLogger` emits log events, which the API prints once and streams to the logs plugin (with nothing bound, as in the CLI, a logger writes to the console). In the renderer, `bindFeHost` binds the application actor, the secrets client behind `secretsClient` (the Settings → Secrets procedures) and a transport that sends to systems over the API client. Using the port with nothing bound throws, naming `bindHost` or `bindFeHost`.

A pack can't register a service under a host service's name.

## Secrets store

The user's API keys live in `@abuddy/host/secrets`, which is host-only and not part of `HostRuntime`.

- `secrets.json` holds each key's metadata in plain text and its value encrypted with AES-256-GCM.
- The data key is kept in a `KeyVault`: the OS credential store (`@napi-rs/keyring`), or a `secrets.key` file in the test environment, in development with `ABUDDY_SECRETS_VAULT=file`, or after the user allows unprotected storage.
- Values enter only through the API's `secrets.*` tRPC procedures, never the event bus. Inference reads a provider's selected key with `secretsStore.keyFor(provider)`.
- Packs see metadata only, through `services.secrets` (list, select, rename, delete).

## Persistence partitions

EARS persists through a sharded router (`makeShardedPersistence`, `@abuddy/ears`) over two LMDB environments. The app opens them with `openLmdbStore({ paths, policy })` from `@abuddy/ears/lmdb` and makes the store's sink the engine's persistence; `lmdb` is an optional peer of `@abuddy/ears` that only the app installs, so packs and pack tests never load it:

| Partition | Directory | Holds | Hydrated at boot |
|---|---|---|---|
| `primary` | `ears-db/` | Everything not excluded | Yes |
| `volatileBackup` | `ears-trace/` | Entity types in the partition policy's `excludedEntityTypes` (always the SDK's `TNode`), and relations touching them | No |

The policy (the app's registry's `partitionPolicy`) is the union of the SDK's excluded types and each registered pack's `partitionPolicy.excludedEntityTypes`, and follows packs as they register and unregister. External packs can't set a partition policy; their data goes to `primary`. `services.traceStore` reads `volatileBackup` directly.

## Backups

`@abuddy/host/backup`, reached by packs through `services.appData` (`@abuddy/host/services/app-data.ts`):

- **Export** (`exportBackup(targetPath, name?, databases?)`): copies the chosen databases (`lmdb`, `volatileLmdb`; default `lmdb`) into `<targetPath>/<name>` (default `agentbuddy-backup-<timestamp>`), with a `metadata.json` and, when `lmdb` is included, `media/`.
- **Import** (`importBackup(path)`): requires `metadata.json`; restores only databases the app has. It copies the current files aside, closes persistence, replaces the files and media, reopens LMDB and reloads memory. On failure the previous files are put back and reloaded.
- **Reset** (`reset()`): clears the engine's memory, deletes both LMDB databases and reopens them, clears the stored API keys, then runs each pack's `onInit` and boot seed and the app migrations, leaving the app as a fresh boot does.

## Generated files

`generate-entries` reads `abuddy.json` and produces up to 18 files in `src/__generated__/`, plus files per dependency. These are regenerated on every build — never edit them.

| File | Contents |
|---|---|
| `pack-entry.ts` | BE registration: systems, services, repositories, steps, artifacts, blocks, EARS, boot hooks, migrations, seed hooks, seeders, commands, features |
| `pack-entry-fe.ts` | FE registration: plugins keyed by feature (the host registers each at its address), the default plugin and designations by feature, step/artifact/block FE, tiptap, app extensions, DSL types |
| `ears.ts` | Typed EARS namespace (Entity, RelKind constants + types), `PackShapes`, and the typed `qx`/`find*`/`createEntity` facade |
| `bus-ids.ts` | `packId` and `busId`, each feature's address (`<packId>.<featureId>`), for the generated code that resolves names. Import-free. Pack code names features and doesn't import it |
| `fe.ts` | Frontend helpers taking the names pack code writes: `actorOf(name)` (a plugin's actor), `navigateToPlugin(name, event?)`, and the `PluginName` type. Only packs with plugins get it |
| `system-specs.ts` | Type-only: `specs`, each system's incoming events keyed by feature id, read from its entry's spec. `events.ts` imports it; only packs with systems get it |
| `events.ts` | `PackEvents` (plugin ID -> the events it receives from this pack's systems, its dependencies' and the host's plugins), `PackSystemEvents` (this pack's systems by feature ID -> the events each receives; dependents name them `<packId>/<feature>`), `SendableSystemEvents` (own systems by feature ID, plus each dependency's as `<dependency>/<feature>`) and `QualifiedSystemEvents` (every system as `<pack>/<feature>`, for `services.emitter`), and the typed `emit`/`sendToPlugin`/`sendToSystem` sends, which resolve each name to the address it stands for (a pack without systems sends to its dependencies'), plus `actorOf(system, name)` for a system's actor |
| `types.ts` | Type barrel: outgoing events + per-feature types |
| `services.ts` | Service aggregation: imports each service object its manifest entry names (`"path#exportName"`), exports `Services`/`Z`/`EntityId` and the typed `services` proxy (with dependencies' services). `Services` types `services.emitter` as `PackEmitter`, with this pack's plugin and system events |
| `repository.ts` | `repository`, typed with the repositories declared in `features[].repositories` and dependencies' |
| `repositories.ts` | This pack's repositories by name, which `pack-entry.ts` puts in the registration (the host registers them with the app's engine) |
| `pack-types.ts` | The facade types `abuddy build` bundles into `dist/types/pack-types.d.ts` for dependents |
| `deps/<id>.d.ts` | Each dependency's facade types, from its snapshot. Its header names the version (`// <id>@<version> facade types`); `abuddy build` warns when the dependency it builds with is another version |
| `deps/<id>.flow-helpers.js`, `.d.ts` | Each dependency's flow helpers module and declarations, from its snapshot |
| `references.ts` | Reference type aggregation: which things are linkable from an editor |
| `seeders.ts` | `seeders`, one per seeded key, which `pack-entry.ts` puts in the registration, and the compiled data path accessors (`setCompiledDir`, `getCompiledDir`) |
| `seed-runtime.ts` | The pack's seed runtime (entity types, relation kinds, repositories, seed hooks). The pack's tests import it; `abuddy build` bundles it into `dist/build/seed-runtime.mjs` for dependents' tests |
| `flow-helpers.ts` | Typed DSL helpers for each step definition, with dependencies' |
| `step-types.ts` | Re-exports DSL/compiled node types from step definitions |
| `dsl-types-fe.ts` | `dslTypes` for the Monaco editor, from the definitions `abuddy build` writes to `dist/defs/monaco/`, which `pack-entry-fe.ts` puts in the frontend registration |

## FE build pipeline

The FE bundler uses Vite with `@vitejs/plugin-vue`:

- **Format:** ESM
- **Target:** es2022
- **Sourcemaps:** on, off with `--release`
- **Minification:** off, on with `--release`
- **Entry:** `src/pack-entry-fe.ts` (or `.js`) if present, otherwise `src/__generated__/pack-entry-fe.ts`
- **Output:** `dist/runtime/fe.js` + `dist/runtime/fe.css`
- `--skip-fe` skips it

Vue SFCs (`.vue` files) are compiled automatically — no extra build step needed.

## External pack constraints

| Capability | Available? | Reason |
|---|---|---|
| Systems, plugins | Yes | Core feature mechanism |
| Seeds (actions, prompts, flows) | Yes | Hash-checked per pack |
| Steps, artifacts, blocks | Yes | Extension points |
| Services | Yes | Stateless modules |
| EARS entities/relations | Yes | With collision detection |
| Migrations | Yes | Targeted at the pack's own version, run at boot |
| `features[].earlySystem` | No | Starts before external packs load |
| `partitionPolicy` | No | Security: controls data routing |
| `boot.seed.settings` | No | Feature defaults go in `features[].settings` |
| `builtIn` | No | Reserved for the default pack |

## Build-time dependency resolution

`abuddy generate-entries`, `abuddy validate`, `abuddy build` and `abuddy fetch-deps` resolve each dependency in `abuddy.json` to its artifacts: `types/snapshot.json`, plus `build/` and `runtime/index.cjs` with its compiled seeds when it ships them (dependents' tests load the runtime). Sources, in order:

1. **`file:` path** — the given directory (relative to the pack root or absolute), in any layout. Not cached. A missing snapshot is an error.
2. **Workspace** — `../<id>`, `../../packages/<id>`, `../../<id>`.
3. **Configured app** — the built-in packs of the app `abuddy test` is configured for (`ABUDDY_APP`, `ABUDDY_ROOT` or the saved choice).
4. **Installed apps** — `host-packs/<id>` in each environment's data dir (production, beta, development, test), which the app publishes at boot.
5. **Cache** — `.abuddy/deps/<id>/`, used only when no source on this machine matches and the cached version satisfies the range. `fetch-deps` skips it.
6. **GitHub releases** — for `github:owner/repo [range]` values: the newest release matching the range, whose `<id>-<version>.tgz` is downloaded with its `.sha256`, checksum-checked, extracted and verified.
7. **Registry** — a stub for future `api.abuddy.com` resolution. Currently a no-op.

Sources 2–4 must satisfy the declared semver range. A dependency found on this machine or on GitHub is written to `.abuddy/deps/<id>/` (`snapshot.json`, `defs/`, `build/`, `runtime/`).

A `PackSnapshot` contains `types` (entity and relKind maps), `defs` (`.d.ts` contents, including the bundled `pack-types` facade), `manifest`, `sdkVersion`, and `flowHelpers` (the pack's bundled flow helpers module and declarations).
