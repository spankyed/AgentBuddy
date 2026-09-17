# @abuddy/host

Host-only modules shared by the API, the renderer, the Electron main process, the CLI and `@abuddy/testing`. This package is the app runtime: the app's own state (`AppState`), pack registration, discovery, install and update, the pack runtime the app runs (loading, lifecycle, reload, seeding), the backend bus, the migrations runners, the user's API keys, host service implementations and the one place the app's `HostRuntime` is assembled, backups and build-time helpers. The API (`packages/api`) keeps only transport, process boot and composition, and calls into it. Packs never import it, and it never imports transport (`fastify`, `@trpc/*`, `ws`) or `virtual:*` modules: the CLI and the pack test harness run it without a server. The root `CLAUDE.md` ("SDK packages") lists the subpaths and their one-line roles. This file covers how each area works. For the pack runtime (loader, `SDK_BRIDGE`, lifecycle, reload, seeding, boot sequence), see [`src/packs/runtime/CLAUDE.md`](src/packs/runtime/CLAUDE.md).

## Package basics

- The package is private and has no build step. Every `exports` entry in `package.json` points at `src/*.ts`, so consumers compile or bundle it: the API's tsup build, and `scripts/bundle-package.ts` for the CLI and `@abuddy/testing`. `bundle-package.ts` inlines `@abuddy/host` and removes it from the published dependencies.
- Relative imports name the `.ts` file (`./staging.ts`), and host modules import each other by relative path, never as `@abuddy/host/*`. The tsconfig sets `allowImportingTsExtensions` and `customConditions: ["@abuddy/source"]`, so `@abuddy/sdk` and `@abuddy/ears` resolve to their source. Host imports only those two `@abuddy` packages, and never the API (`check:specifiers`).
- `npm run check:specifiers` (`scripts/check-import-specifiers.ts`) rejects `@abuddy/host` in pack sources, pack unit tests and CLI templates. `abuddy build` also fails a pack bundle that imports it.
- Scripts: `npm run typecheck:host` (`tsc --noEmit` over `src` and `tests`) and `npm test -w @abuddy/host` (vitest, `tests/**/*.spec.ts`, with the source condition set in `vitest.config.ts`). `npm run test:unit` includes this package.

## Module map (`src/`)

| Subpath | Files | What it holds |
|---|---|---|
| `./packs` | `packs/index.ts` (barrel) | Registration (`createPackRegistry()`, with `packs/contributions.ts` and `packs/backend-contributions.ts`), discovery, registry, installer, updater, bundle, staging, host info, `withModuleBridge` |
| `./packs/runtime` | `packs/runtime/*.ts` | The pack runtime the app runs, on the registry it's given: loader, SDK bridge, loaded packs, lifecycle, reload, seed, the host `packs` system (`createPacksSystem(registry)`), activation outcome ([its CLAUDE.md](src/packs/runtime/CLAUDE.md)). The `./packs` barrel never imports it |
| `./packs/dev-server` | `packs/dev-server.ts` | The `abuddy dev` marker file and `devServerUrl` |
| `./bus` | `bus/{index,machine,app-bus,client-events}.ts` | `createBusMachine` and the bus event types (`machine.ts`), `createAppBus(registry)` (`app-bus.ts`), `receiveClientEvent(registry, event)` and `UnknownClientEventError` (`client-events.ts`) |
| `./migrations` | `migrations/index.ts`, `migrations/app/*.ts` | The migrations runners, `runAppMigrations(registry)` and `runPackMigrations(packs)`, and the host's own migrations, which move the app's state ([its CLAUDE.md](src/migrations/CLAUDE.md)) |
| `./secrets` | `secrets/{index,store,vault,private-file}.ts` | The API key store (`secretsStore`), `secretsSnapshot()`, `forwardSecretsChanges(registry)`, key vaults, atomic private file writes |
| `./services` | `services/{index,app-data,trace-store,inference,secrets,filesystem}.ts` | `createHostRuntime(...)`. Only the five app-implemented services and the index (`tests/boundaries.spec.ts`) |
| `./backup` | `backup/index.ts` | `exportDatabase(store, dir, { mediaPath })`, `importDatabase(store, path, mediaPath)`, `getBackupInfo`, `readBackup` |
| `./database` | `database/{index,open,schema,layout,running}.ts` | A data dir's database opened outside the app (`abuddy db`), through the composition the API's boot uses (see Database) |
| `./app-state` | `app-state/index.ts` | `appState` (the one `AppState` row: `get`, `update`, `updatePackEntry`, the pack seed hash accessors), `HOST_ENTITY_TYPES`, `APP_STATE_ENTITY` |
| `./fe` | `fe/pack-store.ts`, `fe/app-extensions.ts` | `createFePackRegistry()`: the renderer's registered pack frontends (`registerPackFE`, `unregisterPackFE`, `getRegisteredPlugins`, `getRegisteredDefaultPlugin`, `getAppExtension`, and the `FePackRegistryView` the SDK reads) |
| `./build/discover` | `build/discover.ts` | `discoverBuiltInPacksForBuild`, used by the API tsup config and the renderer's Vite and Tailwind configs |
| `./build/shared-deps` | `build/shared-deps.ts` | `SHARED_INSTANCE_PACKAGES` (and `APP_ONLY_EXPORTS`, `sharedInstanceSpecifiers`, `sharedInstanceExports`, `sharedInstanceExternals`, `sharedInstancePackage`), `SHARED_DEPS`, `SDK_FE_MODULES`, `getSharedFeDeps`, `getUiFeModules`, `getSharedBeDeps`, `findSdkVersion` |
| `./build/source-resolution` | `build/source-resolution.ts` | `assertSourceResolution`, `withSourceCondition`, `withoutSourceCondition` |

## Data dirs

All paths come from `resolveAppContext()` (`@abuddy/sdk/env`). The context gives `userDataDir`, `packsDir` (`packs/`), `hostPacksDir` (`host-packs/`), `registryFile` (`pack-registry.json`) and `appName`. The database, media and secrets file paths come from `@abuddy/sdk/utils` `paths.ts` (`ears-db`, `ears-trace`, `media`, `secrets.json`). No path is resolved at import time: each is resolved on the call that needs it, because the environment isn't known until then. Files this package writes under `userDataDir`:

- `host.json` holds `{ version }` (`packs/host-info.ts`). `recordHostVersion` writes it at boot, using a temp file and a rename. `readHostVersion` lets `abuddy install` check a pack's `hostVersion` without the app running.
- `pack-registry.json` (`packs/pack-registry.ts`) holds install state, `enabled`, `source`, update-check results and `lastError`. It is kept outside LMDB because packs register before hydration.
- `pack-dev-servers/<packId>.json` holds `{ port, pid }` (`packs/dev-server.ts`). It is kept outside `packs/`, because an installed pack dir holds exactly the verified bundle.
- `secrets.json` plus `secrets.key` (file vault only) sit in the same directory (`secrets/index.ts`).
- `packs/<id>/` holds installed bundles, and `host-packs/<id>/` holds published built-in pack artifacts (see Bundle).

## App state (`app-state/`)

- The app's own state is one `AppState` row (`AppState-app`): `hasOnboarded`, `version` (the app version the data was migrated to), `packVersions`, `packSeedHashes` (external packs' seeds), `seedHashes` and `seedStatFingerprints` (built-in packs' boot seeds, per pack). Host declares the entity type (`HOST_ENTITY_TYPES`), which the engine's entity-type check and the test harness include and no pack may declare.
- Only host code reads and writes it, through `appState` (`get()` fills defaults; `update()` creates the row on the first write): the migrations runners, the boot seed and external pack seeding (`packs/runtime/seed.ts`, `lifecycle.ts`, `reload.ts`, the API's boot), `createAppBus()` (the application plugin's `CLIENT_CONNECTED` carries `hasOnboarded`) and `services.appData` (`hasOnboarded()`, `completeOnboarding()`, which default-setup's onboarding calls).
- Packs never read it, and their settings don't hold it: resetting settings leaves it alone (`default-setup/tests/unit/settings-reset-app-state.spec.ts`). `appData.reset()` clears it with the rest of the database; the migrations the reset runs record the version again.
- Before 0.3.15 it lived in default-setup's Settings row (`data.internal`); the host's 0.3.15 app migration moves it (`migrations/app/0.3.15.ts`, `tests/migrations/app-state-0.3.15.spec.ts`).

## Packs

**Registration** (`packs/pack-registration.ts`): `createPackRegistry()` returns a new, empty registry of packs, an instance: the API's composition root creates the app's (`openAppStore()`), the pack test harness one per test file, and the CLI one per build. It owns everything packs registered (their registrations, host systems, the lookups the SDK reads, shutdown hooks and derived caches), with no module-level state (`tests/packs/registry-state.spec.ts` checks this module, `contributions.ts`, `backend-contributions.ts` and `fe/`), and it holds the only writes to it. It implements the SDK's `PackRegistryView` (`@abuddy/sdk/runtime`), which the composition root binds as `HostRuntime.packs`; the SDK's lookups (`getDesignated`, `stepRegistry`, `artifactRegistry`, `blockRegistry`, `seedHookRegistry`, `seedData`, `getPackSettingsDefaults`, `getPackCommands`, `services`) read the bound one. Two registries in one process share nothing (`tests/packs/two-registries.spec.ts`).
- It throws on a duplicate pack id, an entity type or relation kind the app declares (the SDK's, or the host's `HOST_ENTITY_TYPES`) or another pack registered, a designation role another pack holds, a repository name another pack registered, or a service key that clashes with another pack or with `HOST_SERVICE_NAMES`. A compile-time check fails when `HostServices` gains a key that list lacks. These checks run before anything is stored.
- It then registers the pack's repositories (`PackRegistration.repositories`) with the installed engine (the app's), then steps (a type's facets merge, `contributions.ts`), artifacts, blocks, seed hooks (one owner pack per entity type), seeders (`PackRegistration.seeders`; two for one key throw), commands (a name another pack declares throws) and feature settings (`checkFeatureSettings`, merged into the defaults with a new `revision` and listeners told; `backend-contributions.ts`). If any of those throws, it rolls back what this call registered.
- Designations from systems and features are registered last. `unregisterPack` drops everything the pack registered, its seeders included.
- `registerHostSystem` covers host systems such as `packs`. `getRegisteredSystems` merges host and pack systems.
- `getRegisteredEntityTypes()` (the engine's entity-type check) is the SDK's entity types, the host's (`AppState`) and the registered packs'.
- `getEventValidationMap()` maps each registered system (host systems, pack systems, early systems) to the incoming event types it accepts; `receiveClientEvent` (`bus/client-events.ts`, the API's `bus.send`) checks against it. It's cached, and `registerPack`, `unregisterPack` and `registerHostSystem` drop the cache, so nothing else invalidates it.
- `partitionPolicy` is the partition policy the API opens the LMDB store with: one object whose calls read the policy of the packs registered at that moment (`makePolicy` from `@abuddy/ears` over `getRegisteredEARSPolicy()`: the SDK's excluded types plus each pack's `ears.partitionPolicy.excludedEntityTypes`). The policy is cached, and `registerPack` and `unregisterPack` drop the cache, so pack lifecycle and reload don't invalidate it themselves (`tests/packs/partition-policy.spec.ts`).
- `getRegisteredMigrations(packIds)` takes explicit ids, so `runAppMigrations(registry)` (`migrations/index.ts`) asks only for built-in packs' migrations. External packs' migrations run through `runPackMigrations`.
- `runRegisteredBootSeeds` seeds only `boot.seedManifest`.
- Shutdown hooks: `registerShutdownHook(hook, key?)`, `runShutdownHooks()` (the API on exit), `runShutdownHooksForKey(key)` (a pack stopping) and `removeShutdownHooksForKey(key)`. Only the app calls them; packs declare `boot.onShutdown`.

**Discovery and registry** (`packs/pack-discovery.ts`, `packs/pack-registry.ts`)
- `discoverBuiltInPacks(dir)` needs `builtIn`, `id` and `name` in `abuddy.json` and doesn't check for source, since packaged apps ship only `abuddy.json` and `dist/`.
- `discoverPacks(packsDir)` skips hidden dirs, and skips manifests without `id`, `name` and `version`.
- `reconcileExternalRegistry` adds newly found packs as enabled, rewrites entries whose version or dir changed, drops missing packs, and returns the enabled packs.
- `modifyRegistry(fn)` reads, applies `fn` and writes the file. `writePackRegistry` writes to `pack-registry.json.tmp` and renames it into place. A failed write is logged, not thrown.

**Bundle** (`packs/bundle.ts`): the one layout used for `dist/`, release archives and installed packs. The layout is documented in the file header, with paths in `BUNDLE_PATHS`.
- `stageBundle(packRoot, stageDir)` copies `dist/{runtime,build,types}` without `.map` files, writes `abuddy.json` (with an optional version override) and writes `bundle.json`, which records the format version and a sha256 per file.
- `verifyBundle` throws on a format major other than `BUNDLE_FORMAT_VERSION`, a missing file, a checksum mismatch, or an unexpected extra file.
- `createBundleArchive` writes a reproducible `<id>-<version>.tgz` (no mtimes or uids, entries prefixed `<id>/`) plus a `.sha256` file. `extractBundleArchive` checks the sha256 when one is given and requires exactly one top-level dir.
- `publishHostPackArtifacts` is described in `src/packs/runtime/CLAUDE.md`. It is skipped when `.fingerprint` matches, and it throws when `dist/runtime/seeds-index.sha256` doesn't match `seeds.json`.

**Installer** (`packs/pack-installer.ts`): every install goes through stage, then verify, then place.
- Entry points:
  - `installPack(slug, source?)` dispatches by source: `local`, `url`, an `http(s)` URL, or otherwise a GitHub `owner/repo[@tag]` slug.
  - `installPackFromLocal` accepts a directory, a `.tgz`/`.tar.gz` (extracted with `extractBundleArchive`) or a `.zip` (extracted by shelling out to `unzip`, with `findPackRoot`).
  - `installPackFromGitHub` picks the release's first `.tgz` asset and uses its `<asset>.sha256` when one exists.
- `installFromDirectory` validates the manifest (`parseManifest`) and checks the `hostVersion` option, a range test that includes prereleases (`isHostCompatible`). If the dir is an unstaged built pack source, it stages it into a tmp dir. It then verifies the bundle and calls `placePack`.
- `placePack` copies the bundle into `.<id>.installing-<pid>-XXXXXX`, moves any existing copy to `.<id>.previous-<pid>-<hex>`, and renames the new copy into place. If that rename fails, it puts the previous copy back, then deletes the leftover.
- `checkDependencies` reports the manifest's dependencies that are neither installed nor built in. Built-in ids come from `BUILT_IN_PACKS_DIR` when it is set, and otherwise from the non-hidden dirs in `host-packs/` next to `packsDir`.
- `uninstallPack` deletes `packs/<id>` and throws if the dir is missing. Neither function touches `pack-registry.json`. The host `packs` system (`packs/runtime/packs-system.ts`) updates it after an install. The CLI never writes it, so a CLI install is picked up by `reconcileExternalRegistry` at the next boot, without a `source`.

**Staging recovery** (`packs/staging.ts`)
- `stagingDirName(id, kind)` produces `.<id>.<installing|previous|publishing>-<pid>-<hex>`.
- `recoverStagingDirs(dir)` treats a staging dir as stale only when its pid is no longer running (`process.kill(pid, 0)`; `EPERM` counts as running). For a stale `previous` dir whose `<id>` is missing, it renames the dir back to `<id>`. It deletes other stale staging dirs and leaves dir names without a pid alone. It never throws and reports failures instead.
- `prepareHostDataDirs({ userDataDir, packsDirs, version })` records the host version and recovers each dir. The API calls it with `packs/` and `host-packs/` before discovery.

**Updater** (`packs/pack-updater.ts`, `packs/github.ts`)
- `checkForUpdates({ hostVersion })` covers enabled registry entries that have a `source`. The API sets `source` only for GitHub installs.
- A cached result is reused for 24 h, but only when `lastUpdateCheckHostVersion` matches the current host version. A failed check stores `updateCheckError` and isn't cached.
- `findLatestRelease` ignores drafts, non-semver tags and versions that aren't newer. It includes prereleases only when `resolveAppContext().env === 'beta'`.
- With a `hostVersion`, `findLatestRelease` reads each candidate's range from the `*.bundle.json` release asset, falling back to `abuddy.json` at the tag. It reads at most 10 manifests (`MAX_MANIFEST_FETCHES`). A candidate whose range it couldn't read comes back with `hostVersionUnverified`, and the install checks the range again.
- The update installs `availableTag`, so it gets exactly the release the check found.
- `githubFetch` sends `GITHUB_TOKEN`/`GH_TOKEN` when set, which covers private repos and the higher rate limit, with a 10 s timeout. It throws `GitHubRequestError` with a `reason` of `rate-limited`, `not-found`, `unauthorized` or `failed`.

**Module bridge** (`packs/module-bridge.ts`)
- `withModuleBridge({ modules, hostPackages, resolveFrom, stubMissing, bridgedPackages, appOnly }, fn)` patches `Module._resolveFilename` while `fn` runs. Bridged specifiers map to cache entries under `__module_bridge__/<specifier>`, and each specifier's real resolved path also points at the same entry. `hostPackages` resolve from `resolveFrom`.
- The patch is restored in `finally`, but the cache entries stay, so lazy requires still get the bridged modules.
- `stubMissing`, used by the harness, turns unresolvable bare specifiers into proxies that throw when used.
- `bridgedPackages` (the pack loader passes `SHARED_INSTANCE_PACKAGES`): a module of those packages that `modules` lacks throws "<specifier> isn't provided by this AgentBuddy: rebuild the pack…" instead of loading another copy, so a pack built against an SDK entry the app no longer has fails with that message.
- `appOnly` (the pack loader and the harness pass `APP_ONLY_EXPORTS`): requiring one of those specifiers throws "<specifier> is only for the app (…); pack code can't import it".
- The pack runtime wraps this in `withHostResolution` (`packs/runtime/bridge.ts`). `@abuddy/testing` uses it for dependency runtimes.

**Dev server** (`packs/dev-server.ts`)
- `writeDevServerMarker` writes the marker with a temp file and a rename. `removeDevServerMarker` deletes it.
- `devServerUrl(userDataDir, packId, filePath)` returns `null` when there is no marker, and throws on invalid JSON or a bad port. `packages/main/src/modules/pack-protocol/PackProtocol.ts` calls it.
- A marker only means a dev server is running, never that anything on disk is current. Don't use it to skip a build.

## Bus composition (`bus/`)

`createBusMachine(options)` returns the XState machine that the app starts with systemId `bus` (`@abuddy/sdk/ids`). The options are:
- `onOutgoing` is the client sink.
- `registry` is the registered packs whose systems the bus runs (`getRegisteredSystems`, `getRegisteredPackSystemIds`).
- `listen(send)` feeds `INCOMING`, `CLIENT_CONNECTED` and `PACK_CLIENT_CONNECTED`, and returns an unsubscribe function.
- `systems` defaults to the registry's `getRegisteredSystems`. Every lookup goes through it, so a bus given a subset never reaches past that subset.
- `clientLoadedPacks` lists the packs whose systems wait for `PACK_CLIENT_CONNECTED`.
- `connectedEvents` lists outgoing events sent after each connection.

- On entry, the bus spawns every system with `id` and `systemId` equal to the system id. The `listen` actor is spawned as `bus-listen`. Distinct ids matter: with shared keys, stopping the bus stops only the last child.
- The bus routes `INCOMING` (client events, and `sendToSystem`, `fire` and schedule ticks from backend code) in every state. It starts in `awaitingClient`, where it drops `OUTGOING` (sends to plugins) and `SYSTEMS_SPAWNED`. The first `CLIENT_CONNECTED` moves it to `clientSeen`, and entering that state sends `CLIENT_CONNECTED` to every system except the systems of `clientLoadedPacks`. The same happens on each later connection. Nothing reports a client leaving, so the bus never goes back: `clientSeen` means a client has connected since boot, and a reconnecting client gets the startup data again (`app-bus.spec.ts`).
- `RELOAD_PACK`, `TEARDOWN_PACK`, `ACTIVATE_PACK`, `PACK_CLIENT_CONNECTED` and `PACK_CHANGED` are handled in both states.
  - `PACK_CHANGED` goes to every running system (a system that isn't running doesn't get it, without a warning).
  - Reload stops the listed systems, then respawns the ones still registered and raises `SYSTEMS_SPAWNED`, which sends them `CLIENT_CONNECTED` only while connected.
  - Activate raises `SYSTEMS_SPAWNED` only for packs that aren't client-loaded.
- Systems are stopped by reference, through `system.get(id)`.
- `routeIncoming` strips `systemId` and warns when the target isn't running, which can happen mid-reload.
- The app's composition is `createAppBus(registry)` (`bus/app-bus.ts`), which the API starts in `setup/backend.ts`. It uses the SDK's bound `rootEvents` (`@abuddy/sdk/runtime`: the bound `HostRuntime`'s transport, the API's `bus-emitter`) for outgoing events, `CLIENT_CONNECTED`, `PACK_CLIENT_CONNECTED`, sends to plugins from outside a system (`onPluginSend`, fed to the bus as `OUTGOING`, so they're dropped until a client connects) and incoming events (except those for the `logs` designation, which reads log events directly), `getPacksWithClientLoadedFrontends` (`packs/runtime/loaded-packs.ts`, the one runtime module the bus imports) as `clientLoadedPacks`, and sends the `application` plugin `CLIENT_CONNECTED` with `hasOnboarded` (`ApplicationConnectedEvent`, read from `AppState`) after each connection. The harness composition is `packages/abuddy-testing/src/app.ts`. Behaviour tests live in `tests/bus/app-bus.spec.ts`, `tests/packs/runtime/reload.spec.ts` and `packages/api/tests/unit/bus-client-connected.spec.ts`.

- `receiveClientEvent(registry, event)` (`bus/client-events.ts`) is what the API's `bus.send` procedure delegates to: it checks the event's `systemId` and `type` against the registry's `getEventValidationMap()` (a `*` entry accepts any type) and throws `UnknownClientEventError` otherwise, logs it through the `app-events` logger (arrays over 5 items become `{ count, sample }`), and emits it on the SDK's bound `rootEvents` (`tests/bus/client-events.spec.ts`).

## Secrets (`secrets/`)

- `secretsStore` (`secrets/index.ts`) is a lazy facade over `createSecretsStore` (`secrets/store.ts`). It uses the file vault in the `test` environment, and in `development` when `ABUDDY_SECRETS_VAULT=file` is set. Otherwise it uses `osKeyVault(appName)`, backed by `@napi-rs/keyring` and loaded with `createRequire` on first use.
- `secrets.json` holds `{ format: 1, protection, keyId, secrets[] }`. Metadata is stored in plain text. Each value is AES-256-GCM encrypted with a 12-byte IV and a 16-byte tag, using the AAD `<id>:<provider>`. The 32-byte data key is stored in the vault under the account `secrets:<keyId>`.
- `list`, `select`, `rename` and `delete` never load a data key. Selection and label rules come from `secretRules` (`@abuddy/sdk/services`).
- `keyFor(provider)` decrypts the selected key on every call. An unreadable value throws an error that tells the user to enter it again in Settings, then Secrets.
- Every value the store encrypts or decrypts is passed to `registerSecretValue` (`@abuddy/sdk/utils/internals`), so logs can mask it without keeping the plaintext.
- `status()` probes the OS vault once per process by reading the unused account `secrets:probe`. `KeyVaultUnavailableError` switches the status to `unavailable`, and a later successful vault call switches it back. Listeners from `onChange` hear these status changes as well as data changes.
- `allowUnprotected()` re-encrypts the readable values under a new key in the file vault, sets `protection: 'unprotected'` and deletes the old OS vault entries.
- `clearAll()` empties the key list but keeps `keyId`. If the file can't be read or emptied, it deletes the file.
- A data key created for a write that then fails is removed from the vault again (`pendingKeys`).
- `writePrivateFile` (`secrets/private-file.ts`) writes a unique temp file with mode `0600`, fsyncs it, renames it into place and fsyncs the directory. On Windows it retries renames that fail with `EPERM`, `EBUSY` or `EACCES`, and skips the directory sync.
- `secretsSnapshot()` is the `SecretsSnapshot` (`list()` and `status()`) the API's procedures return. `forwardSecretsChanges(registry)`, which the API's boot calls once, sends the `settings` designation `SECRETS_CHANGED` (no values) on the bound `rootEvents` on every store change, once that system is registered in `registry`.
- Only the API's `core/router/secrets-router.ts` tRPC procedures (`add`, `replaceValue`, `allowUnprotected`, ...) and `services/inference.ts` (`keyFor`) touch values. `services/secrets.ts` exposes only `status`, `list`, `select`, `rename` and `delete` to packs.

## Services (`services/`)

- `createHostRuntime({ store, engine, transport, appVersion, packs })` (`index.ts`) is the only place the app's `HostRuntime` (`@abuddy/sdk/runtime`) is assembled: the given bus and version, the engine's query face (`engine.query`, which `bindHost` installs), the app's registry as `packs` (the SDK's lookups read it) and the five host-implemented services (`appData`, `traceStore`, `inference`, `secrets`, `filesystem`) over the app's LMDB store (`LmdbStore` from `@abuddy/ears/lmdb`) and the engine's admin face. The API binds it in `openAppStore()` (`packages/api/src/setup/backend.ts`), once it has opened the store.
- `inference.ts`: `createModelResolver()` parses the `provider:model` id and checks the requested kind against `providerCapabilities`. It lazily imports the `@ai-sdk/<provider>` factory and passes an explicit `apiKey` (from `secretsStore.keyFor`) and an explicit `baseURL` (from `PROVIDER_BASE_URLS`). As a result, environment variables such as `ANTHROPIC_BASE_URL` can't redirect calls. The `baseUrls` option exists only for tests.
- `app-data.ts` (`createAppData(store, engine, registry)`) handles reset, the whole app's: it runs the packs' shutdown hooks (`registry.runShutdownHooks()`), clears the engine's memory (`engine.clear()`, the admin face), `store.reset()`, then `secretsStore.clearAll()` once the store is open again, then starts the packs as a boot does (`startPacks(registry, getLoadedPacks())`, `../packs/runtime/start.ts`: each `boot.onInit`, the migrations, the built-in and external seeds). default-setup's reset actions only call it, then restart the brain. `hasOnboarded()` and `completeOnboarding()` read and write `AppState`. It also handles backup export and import, and backup info. After an import, or a failed import, it clears memory and hydrates the store again; a successful import then runs the migrations (an older backup's data, and the app's state from before `AppState`).
- `trace-store.ts` (`createTraceStore(store)`) provides read-only access to the store's volatile partition through `store.query('volatileBackup')` (`LmdbQuery`), reading the current environment on each call (the store reopens after a reset or import).

## Persistence and backup

- EARS persistence isn't host code. The partition policy (`makePolicy`) and the sharded router (`makeShardedPersistence`) are in `@abuddy/ears`, and the LMDB store in `@abuddy/ears/lmdb` (`openLmdbStore`). Host builds the policy from the registered packs (the registry's `partitionPolicy`) and takes the store as an argument; it never imports `lmdb` (`check:specifiers`, `findLmdbImports`).
- `backup/index.ts`: `exportDatabase` copies the requested databases of the store (`store.paths`; default `['lmdb']`, the primary partition; `volatileLmdb` only when listed) and writes `metadata.json`. It also copies the media folder it's given when `lmdb` is included and the folder exists. On import (`importDatabase(store, path, mediaPath)`) it copies the current files to `temp-backup-*`, closes the store, restores the backup, and puts the old files back if anything throws; either way it reopens the store. Database names the app doesn't know are skipped. `readBackup(dir, entityTypes)` checks a backup restores into this app (known databases, the primary one included, each present) and counts, without changing it, its entities per type. `services.appData` passes the app's media folder (`getMediaPath()`); `abuddy db import` the target data dir's.

## Database (`database/`)

What opening an app's database needs, shared by the API's boot and `abuddy db`, so both hydrate a data dir the same way (`packages/api/tests/unit/app-database-parity.spec.ts`):

- `openDatabaseStore({ paths, schema, readOnly?, log? })` (`open.ts`): the LMDB store (`openLmdbStore`) with `schema.partitionPolicy` and a new engine persisting to it, checking entity types against `schema` (`DatabaseSchema`: `getRegisteredEntityTypes()` and `partitionPolicy`, which the app's registry implements). The API's `openAppStore()` calls it with its registry.
- `openAppDatabase({ env, userDataDir, readOnly?, log? })`: for a data dir outside the app. It reads the installed packs' schema (`readInstalledSchema`, `schema.ts`: the built-in packs' `host-packs/<id>/types/snapshot.json` manifests and the external packs' `abuddy.json`, minus those `pack-registry.json` disables; entity types and relation kinds from all, the partition policy from the built-in packs through `appPartitionPolicy`, as the registry does; no pack code runs; a data dir with no published built-in packs throws), finds the layout (`findAppDataPaths`, `layout.ts`: the stores at the data dir's root (packaged) or under `.data/` (source), from `appDataPaths` in `@abuddy/sdk/utils`; none or both throws), opens and hydrates the primary partition and installs the engine's query face. `close()` uninstalls the engine, closes the store and throws when a write failed (the store's `close()` returns its failed writes, the final flush's included). `readOnly` opens the files read-only (LMDB and the sink: a write throws). Files in another storage format are refused by `@abuddy/ears/lmdb` itself (`LMDB_FORMAT_VERSION`), so the app, `abuddy db` and a backup read all refuse them alike.
- `findRunningApp({ userDataDir, apiPortFile })` (`running.ts`): why an app runs on the data dir, or `null`: Chromium's `SingletonLock` (`<host>-<pid>`, POSIX only) held by a live process (a lock from another host, or unreadable, counts), or the API's port file naming a port that answers on `API_HOST`. Every run writes that file (`packages/api/src/setup/websocket.ts`), so this works on every platform and for a packaged app. A stale file doesn't count.
- `holdDatabaseWriteLock(userDataDir, what)` / `findDatabaseWriter` / `assertNoDatabaseWriter` (`write-lock.ts`): `db-write.lock` in the data dir, holding the tool's pid, host and what it's doing. A tool takes it while it changes the database and releases it however it ends (`process.on('exit')` too); a lock whose process has exited is taken over, one from another host counts as held, and a release only removes this process's own. The API's boot calls `assertNoDatabaseWriter` before it opens the store, so a check-then-act race can't end with the app overwriting a change: the app refuses to start instead. Specs: `tests/database/write-lock.spec.ts`, `packages/api/tests/unit/db-write-lock.spec.ts`.
- Specs: `tests/database/` (`open-app-database`, `running-app`).

## Build helpers and source resolution

- `SHARED_INSTANCE_PACKAGES` (`@abuddy/sdk`, `@abuddy/ears`) lists the packages a process loads once. The CLI's bundler externals and FE resolution, the pack loader's bridge (`packs/runtime/shared-modules.ts`, generated by `build/shared-modules.ts` with `npm run shared-modules:update`), `@abuddy/testing`'s dependency-runtime bridge and `scripts/bundle-package.ts` derive from it; `check:specifiers` (`findSharedPackageLists`) fails when one of them names the packages itself. `APP_ONLY_EXPORTS` (`@abuddy/ears/lmdb`) are left out of `sharedInstanceSpecifiers`, so neither bridge provides them: pack code never loads the LMDB store, and pack tests never load `lmdb`. Pack frontends don't share `@abuddy/ears`: the renderer keeps no EARS data, so a pack FE inlines the constants and helpers it imports.
- `SHARED_DEPS` lists the packages the host provides to packs. FE entries are exposed on `window.__abuddy` under `globalKey`, and BE entries (`xstate`, `zod`) are bridged.
  - `getSharedFeDeps()` also shares every exported subpath of `@tiptap/pm` and `@tiptap/vue-3`, and aliases `prosemirror-<name>` to `@tiptap/pm/<name>`.
  - To give pack FE code a new SDK module, add it to `SDK_FE_MODULES`. The FE bundler's error message says to do this.
- `assertSourceResolution(resolve, processName)` throws when a checkout's `@abuddy/ears`, `@abuddy/sdk` or `@abuddy/ui` (a package with `src/`) resolves outside `src/`. It is called by the API boot (except under Electron), the CLI bin (`abuddy-cli/bin/abuddy.mjs`) and `@abuddy/testing` (`src/source-check.ts`).
- `withSourceCondition` and `withoutSourceCondition` edit `NODE_OPTIONS`. `abuddy test` and the fixture's launch env use them.

## Tests (`tests/`)

- `boundaries.spec.ts`: no transport or `virtual:*` imports, no `@abuddy/host/*` self-imports, the `./packs` barrel and the bus clear of `packs/runtime` (the bus may load only `loaded-packs.ts`), no `packages/api/src/packs` or `systems.ts`, no persistence source left in `src/ears`, `src/persistence` or the API's `core/ears` and `core/persistence`, and `src/services` holding exactly one file per `HostRuntime['services']` key plus `index.ts` (checked against the type and against `createHostRuntime`'s services).
- `removed-names-in-docs.spec.ts`: no doc (outside `docs/archive`), CLI template or pack source names what the package-boundaries goal removed (the host module registry, the SDK's `run…Migrations` export, the engine's module-state entry points, the cast repository types, the app state in settings, the registries packs wrote to), with a per-file allowance and its reason.
- `migrations/`: `runner` (both runners on the SDK test host, each migration once, versions recorded in `AppState`; which migrations a release, a beta and a development build run; a failure stops the rest and records nothing) and `app-state-0.3.15` (the host's move of the app's state out of old-shaped settings, run twice; the runners on data from before `AppState` on the release, a beta and a development build, on new data, and after a failed move).
- `packs/`: `bundle`, `dependencies` (`checkDependencies`, publish staging), `dev-server`, `discovery`, `event-validation-map`, `host-info`, `module-bridge`, `partition-policy`, `registration` (including repositories: registered, removed, collisions and rollback), `pack-protocol` (the `pack://` MIME table), `registered-lookups` (each SDK lookup through the functions packs call: registering, unregistering, collisions with rollback), `two-registries`, `registry-state` (no module-level state in the registry and lookup modules), `backend-contributions` (the command and settings stores), `shutdown-hooks`, `staging`, and `updater` (`findLatestRelease`, with `fetch` mocked).
- `fe/`: `fe-registered-lookups` and `pack-store-designations` (`createFePackRegistry()` bound with `bindFeHost`).
- `packs/runtime/`: the pack runtime's specs, on the SDK test host (`test-host.ts`); see its CLAUDE.md.
- `bus/`: `app-bus` (`createAppBus()` on the SDK test host) and `client-events` (`receiveClientEvent`).
- `secrets/`: `store` (uses `memoryKeyVault`) and `private-file`.
- `services/`: `inference` (provider URLs, model kinds) and `host-runtime` (`createHostRuntime`'s members, and a reset's order: shutdown hooks, stores, `onInit`, migrations, seeds, external packs included; `startPacks` runs no pack migration or seed after a failed app migration).
- `build/`: `source-resolution`, `shared-deps` (`APP_ONLY_EXPORTS` stay out of both bridges).
- Related suites elsewhere:
  - `packages/api/tests/unit/` (`secrets`, `bus-client-connected`, `bound-runtime`, `log-capture`, `host-data-services` (with an old backup's import moving the app's state), `restart-persistence`, and `app-reset`: a reset on the built-in packs)
  - `packages/abuddy-ears/tests/lmdb/` (the LMDB adapter, sharded router, query layer and `openLmdbStore`)
  - `packages/abuddy-cli/tests/cli/init-install-load.spec.ts`
  - `packages/abuddy-cli/tests/cli/{install-host-version,dev-install,pack-cli}.spec.ts`
  - `packages/abuddy-cli/tests/packs/host-artifacts.spec.ts`

## Gotchas

- `reconcileExternalRegistry` rebuilds an entry whose version or dir changed from only `id`, `name`, `version`, `dir` and `enabled`, so fields like `source` and `availableVersion` are dropped. An out-of-app reinstall (`abuddy install`) therefore loses the pack's update source at the next boot.
- `writePackRegistry` doesn't throw on failure, so callers can't tell that a registry write was lost.
- External pack FE code can't reach the renderer's `createFePackRegistry()` instance: the renderer calls `registerPackFE` on its behalf (see the pack runtime doc's FE entry section), and pack frontends read it through the SDK's lookups.
- Adding a host service means updating `HostServices` and `HostRuntimeServices` in the SDK, `HOST_SERVICE_NAMES` (`pack-registration.ts`), `createHostRuntime`'s `services` (`services/index.ts`, with the implementation in `services/<kebab-case key>.ts`) and `HOST_SERVICE_KEYS` in `tests/boundaries.spec.ts`. All are type-checked against the SDK types. Helpers that aren't a service don't go in `services/`.
