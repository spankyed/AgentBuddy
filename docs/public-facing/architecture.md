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
| `pack-registry.json` | Installed external packs and their `enabled` state |
| `ears-db/` | Primary LMDB database |
| `ears-trace/` | Volatile LMDB database (flow execution records) |
| `secrets.json` | API keys: metadata plain, values encrypted |
| `media/` | Media assets |
| `api-port` | The API's port (development only) |

CLI commands pass `{ env }` explicitly: `abuddy install`/`uninstall`/`list` target production unless given `-d` (development) or `-b` (beta).

## Pack loading lifecycle

### Install

`abuddy install` (or the Packs view) installs into the data dir's `packs/<id>/`. An installed pack has the bundle layout, the same layout as `abuddy build`'s `dist/` and the release archive:

```
<id>/
  abuddy.json          # The pack's manifest, as written
  bundle.json          # Format version, versions, source, sha256 of every file
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

1. **Stage:** a built pack source is copied into a temporary bundle (`runtime/`, `build/`, `types/` from `dist/`, without source maps), with the resolved `abuddy.json` and a `bundle.json` listing each file's sha256. A `.tgz` archive is checked against its `.sha256` (when given) and extracted.
2. **Verify:** the bundle's format version must match the host's, and the files on disk must be exactly the ones `bundle.json` lists, with matching checksums.
3. **Place:** the bundle is copied into a hidden `.<id>.installing-<pid>-…` dir in `packs/`, the current copy (if any) is renamed aside to `.<id>.previous-…`, the new copy is renamed into place, and the previous one is removed. At boot, `prepareHostDataDirs` restores a pack whose install crashed between those renames and removes stale staging dirs.

The source directory must be built first: installing a directory with neither a `bundle.json` nor a `dist/runtime/index.cjs` beside `dist/types/snapshot.json` fails and asks you to run `abuddy build`. A directory in `packs/` that isn't a bundle is skipped at boot with a warning.

### Backend boot

`setupBackend()` in `packages/api/src/setup/backend.ts` runs, in order:

1. Registers the host `packs` system.
2. `prepareHostDataDirs`: records the app version in the data dir (for `abuddy install`) and recovers staging dirs in `packs/` and `host-packs/`.
3. `forwardSecretsChanges`: the settings system hears of API key changes.
4. Loads packs. Built-in packs load asynchronously while external packs load and register:
   - **Built-in:** discovered from `BUILT_IN_PACKS_DIR` (`abuddy.json` with `builtIn: true`). In development each pack's `dist/runtime/index.cjs` is loaded when it exists, falling back to the loader bundled into the API (`virtual:built-in-pack-loaders`); otherwise the bundled loader is used.
   - **External:** discovered in `packs/` and reconciled with `pack-registry.json` (new packs added enabled, missing ones removed). For each enabled pack: `hostVersion` check, bundle format check, a warning on an SDK major version mismatch, `runtime/index.cjs` loaded through the module bridge, and `earlySystem`, `seedManifest` and `partitionPolicy` stripped. Each pack's systems register as `<packId>.<featureId>`.
   - `registerPack()` stores each registration (see [Collision detection](#collision-detection)).
5. Publishes each built-in pack's build artifacts into `host-packs/<id>/`.
6. Starts the `earlySystem` (default-setup's logs system).
7. Wires each pack's `onShutdown` hook, keyed by pack id.
8. Hydrates EARS from LMDB. Every pack's entity types are registered by now, so the partition policy sees them all.
9. Runs every pack's `onInit`.
10. Runs host migrations (the built-in packs', against the app version), then external pack migrations (each against its own pack version).
11. Seeds: each built-in pack's declarative `boot.seed`, then external packs' compiled seeds, skipped when a pack's seed hash hasn't changed.
12. Starts the bus actor, which spawns every registered system.

### Frontend boot

Built-in packs' frontends are compiled into the renderer (`virtual:built-in-packs` imports each pack's `__generated__/pack-entry-fe.ts`). External packs load at runtime:

1. Each time this window's bus subscription is established, the application actor queries the pack registry (`trpc.packs.registry`), which lists each loaded external pack's `feEntry` and `feStyles` — the bundle's `runtime/fe.js` and `runtime/fe.css`, when it has them. It loads only the packs it hasn't loaded yet, so a query that fails leaves them to the next connection and a pack is never loaded twice.
2. For each external pack, `loadPackFrontend(pack)`:
   - loads `pack://<id>/runtime/fe.css` as a `<link>` when the pack has styles;
   - imports `pack://<id>/runtime/fe.js` and calls `registerPackFE()` with its default export, a `PackFERegistration`;
   - returns the plugins it exports, `[]` when the load failed, or `null` for a pack without frontend code.
3. When it returns plugins (even none), the loader reports `PACK_FRONTEND_LOADED` to the application actor, which spawns the plugins whose ids aren't taken and calls `trpc.bus.packClientReady({ packId })`.
4. `packClientReady` sends the pack's systems `CLIENT_CONNECTED`, so they send their startup data once the plugin actors exist.

A connection's own `CLIENT_CONNECTED` skips the systems of external packs with frontend code (the bus asks `getPacksWithClientLoadedFrontends()`). When the renderer's bus subscription (re)connects, `BUS_SUBSCRIBED` calls `packClientReady` again for every pack whose frontend it loaded. Systems of packs without frontend code get the connection's `CLIENT_CONNECTED` directly.

### Activation, teardown and reload

The `packs` system handles install, uninstall, enable/disable and update from the Packs view:

- **Activate** (after install or update, or on enable): reads the pack's manifest, loads and registers it, registers `onShutdown`, runs `onInit`, seeds (install and update only), sends the bus `PACK_CHANGED` so running systems refresh what they read from packs, then `ACTIVATE_PACK` to spawn its systems. The renderer hears `PACK_ACTIVATED` and asks the application actor to load the frontends it hasn't, the new pack's included. The bus sends `CLIENT_CONNECTED` right away only for a pack without frontend code; otherwise it waits for `packClientReady`. An install or update that activated but failed to seed reports the seed error.
- **Teardown** (before uninstall or update, or on disable): runs the pack's shutdown hooks, unregisters it, clears its modules from the require cache, and sends the bus `TEARDOWN_PACK` to stop its systems. The renderer hears `PACK_DEACTIVATED`, unregisters the pack's FE contributions, removes its stylesheets and unloads its plugins.
- **Reload** (development, `POST /dev/reload` on the API from `abuddy dev` or a built-in pack's watch build): loads and registers the rebuilt runtime before shutting the running one down. If the fresh runtime fails to load or register, the running pack is re-registered and stays as it was. Otherwise the old shutdown hooks run, the new `onShutdown` registers, `onInit` runs, external packs re-seed, and the bus `RELOAD_PACK` stops the old and new system ids and starts those still registered, then sends them `CLIENT_CONNECTED`; `PACK_CHANGED` follows for every running system. Teardown (disable, uninstall) sends it too, after stopping the pack's systems.

Migrations run only at boot, not on activation or reload.

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
  steps?: StepDefinition[];
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  seedHooks?: Record<string, SeedHooks>;  // abuddy.json `seedHooks`, keyed by entity type
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
} satisfies PackFERegistration;
```

Both entry files are auto-generated by `generate-entries`. You don't write them by hand.

### Collision detection

`registerPack()` refuses a registration that would collide:

| What | Checked against |
|---|---|
| Pack id | Registered packs |
| Entity types, relation kinds | Other packs' (names the SDK owns are dropped from a pack's own first) |
| Service keys | Other packs' keys and the host's own services (`logger`, `emitter`, `repository`, `appData`, `traceStore`, `inference`, `secrets`) |
| Step, artifact and block types | The SDK registries |

Steps, artifacts, blocks, seed hooks and feature settings register one at a time; if one fails, those already registered in the call are unregistered.

## The `pack://` protocol

A custom Electron protocol registered in the main process. It serves files from the pack's install directory.

```
pack://<packId>/<filePath>
```

- Resolves to `<userDataDir>/packs/<packId>/<filePath>`
- Path traversal protection: the resolved path must be inside the pack's directory
- While `abuddy dev` runs, `<userDataDir>/pack-dev-servers/<packId>.json` names the pack's Vite dev server port, and requests are proxied there (an invalid port answers 502; a failed or non-OK fetch falls back to the file). The marker lives outside the pack directory, so the installed bundle still verifies and the marker survives reinstalls
- Used by the renderer to load `runtime/fe.js`, `runtime/fe.css`, and other pack assets

## Host dependency sharing

### Frontend: `window.__abuddy`

Packs share runtime dependencies with the host via `window.__abuddy` globals. This is critical for correctness — modules with internal state (Vue's reactivity system, XState's actor registry, the SDK's designation registry) must be singletons.

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

`@abuddy/sdk/fe`, `@abuddy/sdk/runtime`, `@abuddy/sdk/steps`, `@abuddy/sdk/artifacts`, `@abuddy/sdk/blocks`, `@abuddy/sdk/designations`, `@abuddy/sdk/helpers`, and every `@abuddy/ui` export

#### Deep subpath imports

Only registered barrel subpaths are externalized. Other SDK modules resolve and bundle: the file is compiled into your pack's `fe.js`. The FE build fails if a bundled SDK module depends on the host module registry.

#### `@abuddy/ui`

Components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`) come from the separate `@abuddy/ui` package. Add it to your pack's dependencies when your UI uses them; backend-only packs don't install it or its editor libraries. The package ships compiled JS with declarations, so component props typecheck with plain `tsc`.

At runtime your pack uses the app's copy: `abuddy build` turns `@abuddy/ui` imports into references to the modules the app exposes, the same way it handles the shared SDK modules. Your `fe.js` stays small, and stateful modules (the Monaco configuration, editor extensions) have one instance across the app. `@abuddy/ui` changes follow semver, and your pack's `hostVersion` states which apps it runs in.

To ship your own copy instead, set `fe.bundleUi` in `abuddy.json`. All of `@abuddy/ui` is then bundled into `fe.js`, so the pack never mixes its copy with the app's.

### Backend: the module bridge

The API bundles its own copy of `@abuddy/sdk` and `@abuddy/host`. Pack runtime code loaded from disk would otherwise get a separate SDK instance, with empty registries and an empty EARS store.

`withHostResolution(fn)` (`packages/api/src/packs/pack-loader.ts`) runs a `require()` of pack code through `withModuleBridge()` (`@abuddy/host/packs`), which:

- puts the API's instances of the bridged `@abuddy/sdk/*` and `@abuddy/host/*` modules in the require cache, and patches `Module._resolveFilename` so those specifiers resolve to them;
- resolves the shared backend packages (`xstate`, `zod`) from the API, since an installed pack has no `node_modules`;
- restores the resolver afterwards. The bridged modules stay cached, so requires the pack makes later get them too.

The pack test harness uses the same bridge with the pack's own SDK instance.

## Host services

Some services packs reach through `services` are implemented by the host: `appData` (reset, backup export/import), `traceStore` (the volatile trace store), `inference` (model calls) and `secrets` (API key metadata). Their contracts and delegates live in `@abuddy/sdk/services`; the implementations live in `@abuddy/host/services`. `packages/api/src/setup/sdk-host-init.ts`, imported first by `backend.ts`, calls `registerHostServices()`, which registers each implementation as a host module under its service key, where the SDK delegate reads it. The same file registers the API's internal host modules (attribute storage, LMDB query, logger, tRPC, bus emitter, migrations, pack registry) and initializes the EARS runtime.

A pack can't register a service under a host service's name.

## Secrets store

The user's API keys live in `@abuddy/host/secrets`, which is host-only and not a registered host module.

- `secrets.json` holds each key's metadata in plain text and its value encrypted with AES-256-GCM.
- The data key is kept in a `KeyVault`: the OS credential store (`@napi-rs/keyring`), or a `secrets.key` file in the test environment, in development with `ABUDDY_SECRETS_VAULT=file`, or after the user allows unprotected storage.
- Values enter only through the API's `secrets.*` tRPC procedures, never the event bus. Inference reads a provider's selected key with `secretsStore.keyFor(provider)`.
- Packs see metadata only, through `services.secrets` (list, select, rename, delete).

## Persistence partitions

EARS persists through a sharded router (`@abuddy/host/persistence`) over two LMDB environments:

| Partition | Directory | Holds | Hydrated at boot |
|---|---|---|---|
| `primary` | `ears-db/` | Everything not excluded | Yes |
| `volatileBackup` | `ears-trace/` | Entity types in the partition policy's `excludedEntityTypes` (always the SDK's `TNode`), and relations touching them | No |

The policy is the union of the SDK's excluded types and each registered pack's `partitionPolicy.excludedEntityTypes`. External packs can't set a partition policy; their data goes to `primary`. `services.traceStore` reads `volatileBackup` directly.

## Backups

`@abuddy/host/backup`, reached by packs through `services.appData`:

- **Export** (`exportBackup(targetPath, name?, databases?)`): copies the chosen databases (`lmdb`, `volatileLmdb`; default `lmdb`) into `<targetPath>/<name>` (default `agentbuddy-backup-<timestamp>`), with a `metadata.json` and, when `lmdb` is included, `media/`.
- **Import** (`importBackup(path)`): requires `metadata.json`; restores only databases the app has. It copies the current files aside, closes persistence, replaces the files and media, reopens LMDB and reloads memory. On failure the previous files are put back and reloaded.
- **Reset** (`reset()`): clears memory, deletes both LMDB databases, reopens them, and clears the stored API keys.

## Generated files

`generate-entries` reads `abuddy.json` and produces up to 17 files in `src/__generated__/`, plus files per dependency. These are regenerated on every build — never edit them.

| File | Contents |
|---|---|
| `pack-entry.ts` | BE registration: systems, services, steps, artifacts, blocks, EARS, boot hooks, migrations, seed hooks, features |
| `pack-entry-fe.ts` | FE registration: plugins, step/artifact/block FE, tiptap, app extensions |
| `ears.ts` | Typed EARS namespace (Entity, RelKind constants + types), `PackShapes`, and the typed `qx`/`find*`/`createEntity` facade |
| `system-ids.ts` | Re-exports system ID constants from each feature |
| `bus-ids.ts` | `busId` map of bus-routable system IDs (pack-prefixed for external packs). Import-free, so frontend code imports it from here rather than `system-ids.ts` |
| `events.ts` | `PackEvents` (plugin ID -> the events it receives from this pack's systems, its dependencies' and the host's plugins) and the typed `emit`/`sendToPlugin` facade |
| `types.ts` | Type barrel: outgoing events + per-feature types |
| `services.ts` | Service aggregation: imports each service object its manifest entry names (`"path#exportName"`), exports `Services`/`Z`/`EntityId` and the typed `services` proxy (with dependencies' services) |
| `repository.ts` | `repository`, typed with the repositories declared in `features[].repositories` and dependencies' |
| `repositories.ts` | Registers this pack's repositories; `pack-entry.ts` imports it first |
| `pack-types.ts` | The facade types `abuddy build` bundles into `dist/types/pack-types.d.ts` for dependents |
| `deps/<id>.d.ts` | Each dependency's facade types, from its snapshot. Its header names the version (`// <id>@<version> facade types`); `abuddy build` warns when the dependency it builds with is another version |
| `deps/<id>.flow-helpers.js`, `.d.ts` | Each dependency's flow helpers module and declarations, from its snapshot |
| `contributions.ts` | Contribution type aggregation |
| `seeders.ts` | Seeder registration with compiled data paths |
| `seed-runtime.ts` | The pack's seed runtime (entity types, relation kinds, repositories, seed hooks). The pack's tests import it; `abuddy build` bundles it into `dist/build/seed-runtime.mjs` for dependents' tests |
| `flow-helpers.ts` | Typed DSL helpers for each step definition, with dependencies' |
| `step-types.ts` | Re-exports DSL/compiled node types from step definitions |
| `dsl-register-fe.ts` | DSL type registration for Monaco editor, from the definitions `abuddy build` writes to `dist/defs/monaco/` |

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

`abuddy generate`, `abuddy generate-entries`, `abuddy validate`, `abuddy build` and `abuddy fetch-deps` resolve each dependency in `abuddy.json` to its artifacts: `types/snapshot.json`, plus `build/` and `runtime/index.cjs` with its compiled seeds when it ships them (dependents' tests load the runtime). Sources, in order:

1. **`file:` path** — the given directory (relative to the pack root or absolute), in any layout. Not cached. A missing snapshot is an error.
2. **Workspace** — `../<id>`, `../../packages/<id>`, `../../<id>`.
3. **Configured app** — the built-in packs of the app `abuddy test` is configured for (`ABUDDY_APP`, `ABUDDY_ROOT` or the saved choice).
4. **Installed apps** — `host-packs/<id>` in each environment's data dir (production, beta, development, test), which the app publishes at boot.
5. **Cache** — `.abuddy/deps/<id>/`, used only when no source on this machine matches and the cached version satisfies the range. `fetch-deps` skips it.
6. **GitHub releases** — for `github:owner/repo [range]` values: the newest release matching the range, whose `<id>-<version>.tgz` is downloaded with its `.sha256`, checksum-checked, extracted and verified.
7. **Registry** — a stub for future `api.abuddy.com` resolution. Currently a no-op.

Sources 2–4 must satisfy the declared semver range. A dependency found on this machine or on GitHub is written to `.abuddy/deps/<id>/` (`snapshot.json`, `defs/`, `build/`, `runtime/`).

A `PackSnapshot` contains `types` (entity and relKind maps), `defs` (`.d.ts` contents, including the bundled `pack-types` facade), `manifest`, `sdkVersion`, and `flowHelpers` (the pack's bundled flow helpers module and declarations).
