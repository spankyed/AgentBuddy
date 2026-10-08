# Pack runtime (`@abuddy/host/packs/runtime`)

The pack runtime the app runs: loading built-in and external packs, the SDK bridge, activation and teardown, reload, seeding, and the host `packs` system. It works on the registry it's given (`PackRegistry`, `createPackRegistry()` from `../pack-registration.ts`): every function that registers, unregisters or reads packs takes it as its first argument, and the host `packs` system is `createPacksSystem(registry)`. Discovery, the registered packs (`createPackRegistry()`, with the shutdown hooks), the install registry, the installer and the pack layout live one level up in `@abuddy/host/packs` (`packages/abuddy-host/src/packs/`). That barrel, which the CLI imports, never imports this folder, and neither does `@abuddy/host/bus` (`tests/boundaries.spec.ts`).

The API calls this runtime (`packages/api/src/runtime/index.ts`, `setup/websocket.ts`, `transport/packs.ts`), and so do the db scripts. What only the API has, it reaches through the SDK's bound runtime: logging through `createLogger` (`@abuddy/sdk/logger`) and the app version through `getAppVersion()` (`@abuddy/sdk/env`). Unbound (the CLI), loggers write to the console. The partition policy the app's store routes by is a constant (`appPartitionPolicy()`), so nothing here touches it. Modules here import each other and the rest of host by relative `.ts` path.

## Architecture

### Install locations

All paths come from `resolveAppContext()` (`@abuddy/sdk/env`), under `userDataDir`:

| Path | Contents |
|------|----------|
| `packs/<id>/` | Every installed pack, the ones the app ships included, in the pack layout (`abuddy.json`, `integrity.json`, `runtime/{index.cjs,fe.js,fe.css,seeds/}`, `build/`, `types/snapshot.json`; see `abuddy-host/src/packs/pack-layout.ts`) |
| `installed-packs.json` | Install state and `enabled` flag, for the packs that have a row |

Hidden `.<id>.installing-*` and `.<id>.previous-*` dirs are installs in progress; discovery skips them and `prepareHostDataDirs` cleans up stale ones at boot.

### The packs the app ships

They are installed packs, so they have no loader of their own. `installShippedPacks(SHIPPED_PACKS_DIR, packsDir)` (`packs/installer.ts`) runs before loading, because a pack has to be in the packs dir to be discovered there:

- **Which** — a directory under `SHIPPED_PACKS_DIR` holding an `abuddy.json`. Not `builtIn`, which decides nothing: the manifest field survives as something a pack says about itself, and no load, reload, build, frontend or seed path reads it.
- **Whether to write** — `packFileHashes` of the installed copy against `stagedFileHashes` of the shipped one. Equal is `current` and writes nothing, so only a first boot and a version bump install; unequal is `updated`, which covers both causes at once — a newer build was shipped, or something changed the installed copy. The comparison is of the files themselves rather than of either side's recorded `integrity.json`, which is what makes an edited install visible.
- **A failed install** is reported and the rest proceed (`outcome: 'failed'`). It is not fallen back on: there is no read-only load straight from the shipped directory, because a pack the app could not install is a pack the app does not have, which is the answer an installed pack has always had for the same condition.
- **Its id is reserved against an install**, which is what makes `canUninstall: false` a promise rather than a hidden button: uninstalling, disabling and installing over it are the three ways to lose a pack the app needs, and the same predicate refuses all three (`features/packs/be/system.ts`). An install over a shipped pack bought nothing the next boot's hash comparison did not revert, and cost a session running a pack nobody chose. A shipped pack that failed to *load* has no origin to read, so the refusal cannot answer for it and that case still recovers at the next boot.

### Loading

`loadAppPacks(registry, shippedIds)` in `loader.ts` — one path for every pack:

- **Discovery** — `discoverPacks(packsDir)` plus the `installed-packs.json` rows, minus the disabled.
- **Order** — the ids in `shippedIds` first, so a pack depending on one the app ships finds it registered.
- **Loading** — `runtime/index.cjs` in the pack's own installed directory, written by its `abuddy build`, required with `withHostResolution()`. The api bundle carries no pack's backend, so this is the path packaged and from source alike.
- A pack with no built runtime, or one whose load throws, has a **load problem recorded** and the rest load.
- Each loaded module's `setCompiledDir(<pack>/runtime/seeds)` is called, then `registry.registerPack(mod.registration)`.

### Installed packs

`loadExternalPacks(registry?)`:
1. Discovers packs in `packsDir` (`discoverPacks()`; each needs an `abuddy.json` with `id`, `name`, `version`)
2. Drops what was recorded about packs it no longer finds (`forgetPacksExcept()`), then takes the ones the record doesn't disable (`enabledExternalPacks()`): the directory is the list, and the record only takes packs out of it
3. Loads each enabled pack with `loadSingleExternalPack()`:
   - `hostVersion` check (`isHostCompatible`), pack layout format check, warning on an SDK major version mismatch
   - `runtime/index.cjs` through `withHostResolution()`; the registration id must match the manifest. A directory without a `integrity.json` and a `runtime/index.cjs` isn't an installed pack: it's skipped with a warning pointing at `abuddy install` or `abuddy run`
   - a pack it can't load comes back as `{ problem }`, which `loadExternalPacks` records in the registry it's given (`recordLoadProblem`), so the Packs view says why the pack isn't running

`registerExternalPacks(registry, packs)` registers each pack (recording why as the pack's load problem when the registry refuses one), whose features the registry runs at `<packId>/<featureId>` (its seeders, commands and the rest of its registration with it), and returns the packs whose registration succeeded.

## Modules

In this folder (all exported from `index.ts`):

| File | Purpose |
|------|---------|
| `loader.ts` | Built-in and external loading, `registerExternalPacks`, `clearPackRequireCache` |
| `bridge.ts` | The SDK bridge map (`SDK_BRIDGE`: `sdk-modules.ts`), `withHostResolution()`, `getBridgedSdkSpecifiers()` |
|  `sdk-modules.ts` | Generated (`npm run sdk-modules:update -w @abuddy/host`, from `../../build/render-sdk-modules.ts`): a static import of every export of the `SHARED_INSTANCE_PACKAGES` (`@abuddy/sdk`, `@abuddy/ears`) pack runtime code can require, so the app bundle carries them |
| `lifecycle.ts` | `activatePack()` and `teardownPack()` for install, uninstall, enable/disable and update at runtime |
| `reload.ts` | `reloadPackById()` for the API's `POST /dev/reload` (`transport/websocket.ts`): the caller names a pack, and the registry says which directory it was loaded from |
| `packs-system.ts` | Every action takes an in-flight lock (install on the slug, the rest on the pack id), so two of the same never interleave. The host `packs` XState system: `INSTALL_PACK`, `UNINSTALL_PACK`, `TOGGLE_PACK_ENABLED`, `UPDATE_PACK`, `CHECK_FOR_UPDATES`, `GET_INSTALLED_PACKS`, and publishes its list on `SEND_STATE` like any other system, whatever caused the ask; emits `PACKS_LIST`, `PACK_ACTIVATED`/`PACK_DEACTIVATED` and install/update/uninstall results. It lists `installedPacks()`: the packs directory, joined with what the record says about each and the registry's load problem for it |
| `activation-outcome.ts` | `activationProblem()`: why a just-installed or updated pack isn't working (failed to load, with the load problem the registry recorded, or the seed error recorded on its installed-packs entry) |
| `seed.ts` | `computePackSeedHash` (every file under the pack's `runtime/seeds`, by name and bytes, media included — **content only**: file times were in here so that reinstalling the version already installed would re-seed, which also made a `touch` re-seed and made every `abuddy run` backend rebuild re-import every seed, that loop reinstalling. Asking for a pack's data back is `IMPORT_PACK_SEEDS`; a reinstall of a pack whose data failed still reports it, because `recordInstalled` keeps the `lastError` only the seeder may clear), and `seedPacks` — **one function for every pack**, whoever ships it. The hashes are kept in `AppState.packSeedHashes`, which keeps a pack's hash while it's disabled; every seeder the pack registered runs; failures are recorded as the installed-packs entry's `lastError`. A pack is seeded when its own compiled data changed, or when its last seed failed and a pack it depends on has seeded since — `AppState.packSeedDeps` holds what the failed attempt faced, so the retry happens when that changes rather than never, and a pack whose data and dependencies are both settled is still skipped. `seedPolicy` is read from whatever pack declares one (`evaluateSeedPolicy`: `skipAtBoot` always, `skipAfterOnboarding` once `AppState.hasOnboarded`), and the hash covers every file in the directory, `settings.seed.json` included, so changing default settings re-seeds the pack even though `skipAtBoot` keeps settings from being reset |

In `packages/abuddy-host/src/packs/` (`@abuddy/host/packs`):

| File | Purpose |
|------|---------|
| `pack-discovery.ts` | `discoverPacks`, `enabledExternalPacks`, `installedPacks` |
| `pack-registration.ts` | `createPackRegistry()`, the registered packs as an instance: `registerPack`/`unregisterPack` (the host's own features too, `hostRegistration`), boot hooks, migrations, EARS policy, extensions, shutdown hooks (`registerShutdownHook`, `runShutdownHooks`, `runShutdownHooksForKey`, `removeShutdownHooksForKey`), `getEventValidationMap()` (what `bus.send` accepts, cached until a registration changes), and the lookups the SDK reads once it's bound (`PackRegistryView`). Collision detection with rollback |
| `extensions.ts`, `backend-extensions.ts` | The stores a registry keeps: definitions by type (steps merge facet by facet), designations, seed hooks, seeders, feature settings defaults, commands, shutdown hooks |
| `installed-packs.ts` | `installed-packs.json` CRUD |
| `module-bridge.ts` | `withModuleBridge()` |
| `pack-layout.ts` | Pack layout, stage/verify, archives, `packFileHashes`/`stagedFileHashes` |
| `pack-installer.ts` | Install from a directory, archive, URL or GitHub release (stage, verify, place); `installShippedPacks`; uninstall; `checkDependencies` |
| `staging.ts` | Staging dir names, `recoverStagingDirs`, `prepareHostDataDirs` |
| `pack-updater.ts`, `github.ts` | Update checks against GitHub releases |
| `host-info.ts` | Records the app version in the data dir for `abuddy install` |

The API's `transport/packs.ts` serves `packs.loaded` from `getLoadedPackEntries()`.

## Boot sequence (in the API's `runtime/index.ts`)

```
0. initializeLogCapture()          — console calls become log events, each printed once
   openAppStore()                  — (runtime/index.ts) createPackRegistry(), the app's registered packs; open the LMDB store
                                     (@abuddy/ears/lmdb) with appPartitionPolicy(), createEarsEngine({ persistence: store.sink }),
                                     bindHost(createHostRuntime({ ..., packs })), which installs the engine's query face
                                     and binds the registry for the SDK's lookups; every step below works on it
1. registerPack(hostRegistration) — the app's own features as the pack `host`: the application and packs systems and plugins
2. prepareHostDataDirs()           — record host version; recover staging in packs/
3. forwardSecretsChanges()         — settings system hears of API key changes (@abuddy/host/secrets)
4. installShippedPacks()           — each pack the app ships into packs/<id>, when its files differ from the
                                     installed copy's; before loading, since a pack is loaded from packs/
5. loadAppPacks()                  — discover + reconcile installed packs + load enabled, shipped ids first;
                                     registerPack() each, with where it was found (PackOrigin)
6. registry.registerShutdownHook() — each pack's onShutdown, keyed by pack id
7. store.hydrate()                 — EARS policy now sees all entity types
8. startPacks(registry)            — start.ts; services.appData.reset() runs it too, after the shutdown hooks:
   onInit hooks                    — all packs (built-in + external)
   runAppMigrations()              — the host's app migrations, then built-in packs', against the app version (@abuddy/host/migrations); if one fails, nothing below runs
   runPackMigrations()             — external packs' migrations, each against its pack version
   seedPacks()                     — every pack's compiled seeds (hash-checked, in dependency order,
                                     each pack's own seedPolicy applied)
9. start the bus actor             — createAppBus(registry) (@abuddy/host/bus) with systemId `HOST.bus`, which spawns every registered system
```

Every pack registers before hydration, so its entity types are visible to the partition policy resolver.

## Pack entry contract

A pack's `__generated__/pack-entry.ts` (built-in, and bundled into an external pack's `runtime/index.cjs`) exports a `registration` conforming to `PackRegistration` from `@abuddy/sdk/framework`, and `setCompiledDir(dir)`:

```typescript
export const registration: PackRegistration = {
  id: string;
  features?: Record<string, PackFeature>;  // by feature id: designation?, system?: { machine, receives } (packSystem), plugin?: { receives }, services?, settings?
  services?: Record<string, unknown>;
  ears?: PackEARS;           // entities + relKinds
  repositories?: Record<string, unknown>;  // features[].repositories, registered with the app's engine
  boot?: PackBootHooks;      // onInit/onShutdown (boot.hooks), seedManifest (boot.seed)
  migrations?: PackMigration[];
  steps?: StepDefinition[];
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  seedHooks?: Record<string, SeedHooks>;  // abuddy.json seedHooks
  seeders?: Seeder[];                     // one per seeded key (abuddy.json boot.seed), run by importCompiledSeeds
  commands?: PackCommand[];               // abuddy.json commands
};
```

Designations come from the manifest's `features[].designation`, which generate-entries puts on the feature, and `registerPack()` maps each role to the feature's ref, `<packId>/<featureId>`, whether it has a system or none. A designation is a role, not a name, and need not equal the feature id: both registries map the role to the id of the system or plugin that plays it. `abuddy validate` rejects one role claimed by two features of a pack; across packs `registerPack` throws.

## Collision detection

`registerPack()` in `abuddy-host/src/packs/registry.ts` checks for collisions before storing a registration:

| What | Checked against | On collision |
|------|----------------|--------------|
| Pack id | Registered packs | Throws |
| EARS entity type values | The SDK's and the host's, and all registered packs' entity values | Throws (blocks registration) |
| EARS relation kind values | The SDK's, and all registered packs' relation values | Throws (blocks registration) |
| Designation roles | All registered packs' roles | Throws (blocks registration) |
| Service keys | Host service names (`logger`, `emitter`, `repository`, `appData`, `traceStore`, `inference`, `secrets`) and all registered packs' keys | Throws (blocks registration) |
| Repository names | All registered packs' repository names | Throws (blocks registration) |
| Seed hooks | Another pack's hooks for the entity type | Throws — **with rollback** of what this call registered (repositories, steps, artifacts, blocks, seed hooks, seeders, commands, feature settings) |
| Seeders | Two seeders for one seed key in the pack | Same rollback behavior |
| Commands | Other packs' command names | Same rollback behavior |
| Feature settings | `checkFeatureSettings` (a feature sets only its own plugin's settings) | Same rollback behavior |

EARS, designation, service and repository collisions throw before anything is stored, so no cleanup is needed. The rest register sequentially and roll back on failure; `unregisterPack()` removes all of it, the repositories from the installed engine included (`unregisterRepository`). Step, artifact and block types aren't collisions: a later registration of a type merges into it (steps, facet by facet) or replaces it (`../extensions.ts`). The specs are `tests/packs/registration.spec.ts` and `tests/packs/registered-lookups.spec.ts`.

## Host resolution for pack runtime code

`withHostResolution(fn)` in `bridge.ts` calls `withModuleBridge()` (`../module-bridge.ts`) with:
- `SDK_BRIDGE` — the loader's own instances (in the app, the API bundle's, which inlines `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/host`) of the shared-instance packages' subpaths (`sdk-modules.ts`, built from each package's exports map minus `APP_UNBRIDGED` and the app-only `@abuddy/ears/lmdb`). They go into the require cache (under a bridge key and the real resolved path) and `Module._resolveFilename` resolves those specifiers to them, so pack code shares the bundle's bound app (its registered packs and hydrated EARS engine) instead of loading a separate SDK copy. Pack code never requires `@abuddy/host`, so no host module is bridged.
- `getSharedBeDeps()` (`xstate`, `zod`, and every subpath they export: a bundled dependency may require `zod/v4`) — resolved from `import.meta.url` (the API's `dist/server.js` in the app), since an installed pack has no `node_modules`.
- `bridgedPackages: SHARED_INSTANCE_PACKAGES` — a pack requiring a shared-instance module the map lacks fails with "isn't provided by this AgentBuddy: rebuild the pack".
- `appOnly: APP_ONLY_EXPORTS` — a pack requiring `@abuddy/ears/lmdb` fails saying only the app loads it (`abuddy build` already rejects the import).

The resolver patch is restored in a `finally`; the bridged cache entries stay, so lazy requires get them too. `tests/packs/runtime/sdk-bridge-drift.spec.ts` guards the list via `getBridgedSdkSpecifiers()` and fails when  `sdk-modules.ts` is stale. The pack test harness calls `withModuleBridge()` with the pack's own SDK.

## Blocked features for external packs


## Runtime lifecycle

### Activate and teardown (`lifecycle.ts`)

`activatePack(registry, packId, bus)` — reads `packs/<id>/abuddy.json`, `loadSingleExternalPack()`, `registerExternalPacks()`, registers `onShutdown`, then starts it as a boot does: `onInit`, `runPackMigrations()`, `seedPacks()` (hash-checked, so enabling a pack whose seeds didn't change imports nothing), then `updateLoadedPack()`, sends the bus `PACK_CHANGED`, then `ACTIVATE_PACK` with the `<packId>/<featureId>` system ids. Returns `false` when the pack can't be read, loaded or registered, with why recorded as its load problem. The packs system then emits `PACK_ACTIVATED`, or, after install/update, `PACK_INSTALL_FAILED`/`PACK_UPDATE_FAILED` when `activationProblem()` reports one.

`teardownPack(registry, packId, bus, { replacing? })` — runs the pack's shutdown hooks, clears its load problem, `unregisterPack()` (which drops everything the pack registered, its seeders included, and the cached event validation map and partition policy), clears the pack's require cache, `removeLoadedPack()`, sends the bus `TEARDOWN_PACK` to stop its systems, then `PACK_CHANGED` unless `replacing` is set. The packs system emits `PACK_DEACTIVATED`.

Update tears down with `replacing`, installs the release the update check found, and activates with seeding; if the install fails it reactivates the previous copy. The activation sends `PACK_CHANGED`; when neither activation succeeds, the update sends it itself, since the pack is then gone.

### Reload (`reload.ts`)

`POST /dev/reload { packId }` (from `abuddy run` and `abuddy build --watch`; one reload per pack at a time) calls `reloadPackById(registry, …)` on the app's registry, which re-requires the pack's built runtime from the directory the registry says it came from. Either way:
0. refresh the installed copy of a pack the app ships, `installShippedPacks(…, { only: packId })` — the same comparison the boot makes, so it writes nothing when the installed copy already holds the shipped build, and a pack the app does not ship matches no shipped id and nothing happens. A pack is loaded from `packsDir`, so a rebuild in the checkout reaches the app only once this has run; without it `abuddy build --watch` rebuilds and the app re-requires the copy from before the edit. A refresh that fails throws, because the edit is what the reload was for
1. clear the pack's require cache and load the fresh runtime (a load failure throws; the running pack is untouched, and a pack that wasn't running has the failure recorded as its load problem)
2. unregister the running registration and register the fresh one; if that throws, re-register the previous one and rethrow (registering and unregistering drop the cached event validation map and partition policy)
3. run the old shutdown hooks, register the new `onShutdown`, run `onInit`; external packs run their migrations (`runPackMigrations()`), re-seed and `updateLoadedPack()`. A reload can be the first this app has seen of a pack, since `abuddy run` installs into a running app — it needs no record entry, because the directory is what makes it installed
4. send the bus `RELOAD_PACK` with old and new system ids: it stops each running one, starts those still registered, and sends them `CLIENT_CONNECTED`, then asks them to publish
5. send the bus `PACK_CHANGED`

`PACK_CHANGED { packId }` goes to every running system once a change is complete, and the bus then asks each to publish (`SEND_STATE`) — which is how systems that read what a pack registers or seeds (the chat's slash commands, the library's documents) send their data again, without any of them handling the fact. It's never sent between unregistering a pack and registering it again: a system reading another pack's services then would find them gone. Settings → Import pack seeds sends it too.

The app's migrations run only at boot (and in an app reset). An external pack's run whenever it starts: at boot, on activation (install, update, enable) and on reload, each against its own recorded version.

## Client startup data for packs with frontends

`getPacksWithClientLoadedFrontends(registry)` (`../pack-layout.ts`) lists registered external packs whose layout has a `runtime/fe.js` (`packFrontendFiles()`). The app bus (`createAppBus()` in `abuddy-host/src/bus/app-bus.ts`, passing it to `createBusMachine` as `clientLoadedPacks`) skips their systems when a connection's `CLIENT_CONNECTED` broadcasts, and doesn't ask them to publish on their `ACTIVATE_PACK`.

The renderer loads each such pack's frontend, then calls `trpc.bus.packClientReady({ packId })`, which sends the pack's running systems `CLIENT_CONNECTED` and asks them to publish (`PACK_CLIENT_CONNECTED` on the bus). It calls it again for every loaded pack when its bus subscription reconnects.

## External pack FE entry convention

A pack's frontend files are found on disk, not declared in the manifest: `packFrontendFiles(layoutDir)` (`@abuddy/host/packs`) returns `{ entry?: 'runtime/fe.js', styles?: 'runtime/fe.css' }` for whichever of the two `abuddy build` emitted.

The `packs.loaded` query reports them as `feEntry` and `feStyles`. The frontend's `createPackFrontends` (`features/packs/fe/frontends.ts`, over the window's I/O) loads the styles, then imports `pack://{packId}/{feEntry}`. The module's default export must be a `PackFERegistration`-shaped object (or a subset): `{ plugins?, steps?, artifacts?, blocks?, tiptapPlugins?, appExtensions?, dslTypes? }`. It calls the window's registry's `registerPackFE()` with it, and the shell sends itself `PACK_FRONTEND_LOADED` (with no plugins when the load failed), which merges the plugins and calls `bus.packClientReady`.

External pack FE modules cannot call `registerPackFE()` themselves: the renderer's registry (`createFePackRegistry()`, `renderer/src/core/fe-host.ts`) isn't theirs to reach, and they register nothing when imported. The host always mediates; pack frontends read what's registered through the SDK's lookups.

## Tests

`packages/abuddy-host/tests/packs/runtime/` runs on the SDK's test host (`test-host.ts`: `startTestRuntime({ appVersion, packs: registry })`, with the `registry` it exports, which the specs pass to the runtime): `loader` (one load path for every pack, the shipped-first order, seeding, the installed-packs entries), `lifecycle`, `reload`, `activation-outcome`, `bridge-leaves`, `sdk-bridge-drift` (set `REQUIRE_RUNTIME_ENTRY` to require default-setup's built runtime) and `pack-e2e`. `tests/bus/app-bus.spec.ts` runs `createAppBus(registry)` on the test host; `tests/packs/shutdown-hooks.spec.ts` covers a registry's shutdown hooks. Elsewhere: `packages/api/tests/runtime/bus-client-connected.spec.ts` (the app bus on the API's transport) and `packages/abuddy-cli/tests/commands/init-install-load.spec.ts` (a scaffolded pack installed and loaded).
