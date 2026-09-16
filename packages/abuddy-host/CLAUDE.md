# @abuddy/host

Host-only modules shared by the API, the renderer, the Electron main process, the CLI and `@abuddy/testing`. This package covers pack registration, discovery, install and update, the backend bus, the user's API keys, host service implementations, EARS/LMDB delegates, backups and build-time helpers. Packs never import it. The root `CLAUDE.md` ("SDK packages") lists the subpaths and their one-line roles. This file covers how each area works. For the API's side of pack loading (loader, lifecycle, reload, boot sequence, `SDK_BRIDGE`), see `packages/api/src/packs/CLAUDE.md`.

## Package basics

- The package is private and has no build step. Every `exports` entry in `package.json` points at `src/*.ts`, so consumers compile or bundle it: the API's tsup build, and `scripts/bundle-package.ts` for the CLI and `@abuddy/testing`. `bundle-package.ts` inlines `@abuddy/host` and removes it from the published dependencies.
- Relative imports name the `.ts` file (`./staging.ts`). The tsconfig sets `allowImportingTsExtensions` and `customConditions: ["@abuddy/source"]`, so `@abuddy/sdk` resolves to its source.
- `npm run check:specifiers` (`scripts/check-import-specifiers.ts`) rejects `@abuddy/host` in pack sources, pack unit tests and CLI templates. `abuddy build` also fails a pack bundle that imports it.
- Scripts: `npm run typecheck:host` (`tsc --noEmit` over `src` and `tests`) and `npm test -w @abuddy/host` (vitest, `tests/**/*.spec.ts`, with the source condition set in `vitest.config.ts`). `npm run test:unit` includes this package.

## Module map (`src/`)

| Subpath | Files | What it holds |
|---|---|---|
| `./packs` | `packs/index.ts` (barrel) | Registration, discovery, registry, installer, updater, bundle, staging, host info, `withModuleBridge` |
| `./packs/dev-server` | `packs/dev-server.ts` | The `abuddy dev` marker file and `devServerUrl` |
| `./bus` | `bus/index.ts` | `createBusMachine` and the bus event types |
| `./secrets` | `secrets/{index,store,vault,private-file}.ts` | The API key store (`secretsStore`), key vaults, atomic private file writes |
| `./services` | `services/{index,app-data,trace-store,inference,secrets}.ts` | `HOST_SERVICES`, `registerHostServices()` |
| `./ears` | `ears/index.ts`, `ears/lmdb.ts` | Re-exports `@abuddy/sdk/ears/internals`, plus LMDB lifecycle delegates |
| `./persistence` | `persistence/{policy,sharded-router,base-sink}.ts` | `makePolicy`, `makeShardedPersistence` |
| `./backup` | `backup/index.ts` | `exportDatabase`, `importDatabase`, `getBackupInfo` |
| `./settings` | `settings/index.ts` | `settingsRepository`, which is the SDK's `builtinRepository` |
| `./fe` | `fe/pack-store.ts`, `fe/app-extensions.ts` | The renderer's plugin registry: `registerPackFE`, `unregisterPackFE`, `getRegisteredPlugins`, app extension slots |
| `./build/discover` | `build/discover.ts` | `discoverBuiltInPacksForBuild`, used by the API tsup config and the renderer's Vite and Tailwind configs |
| `./build/shared-deps` | `build/shared-deps.ts` | `SHARED_DEPS`, `SDK_FE_MODULES`, `getSharedFeDeps`, `getUiFeModules`, `getSharedBeDeps`, `findSdkVersion` |
| `./build/source-resolution` | `build/source-resolution.ts` | `assertSourceResolution`, `withSourceCondition`, `withoutSourceCondition` |

## Data dirs

All paths come from `resolveAppContext()` (`@abuddy/sdk/env`). The context gives `userDataDir`, `packsDir` (`packs/`), `hostPacksDir` (`host-packs/`), `registryFile` (`pack-registry.json`) and `appName`. The database, media and secrets file paths come from `@abuddy/sdk/utils` `paths.ts` (`ears-db`, `ears-trace`, `media`, `secrets.json`). No path is resolved at import time: each is resolved on the call that needs it, because the environment isn't known until then. Files this package writes under `userDataDir`:

- `host.json` holds `{ version }` (`packs/host-info.ts`). `recordHostVersion` writes it at boot, using a temp file and a rename. `readHostVersion` lets `abuddy install` check a pack's `hostVersion` without the app running.
- `pack-registry.json` (`packs/pack-registry.ts`) holds install state, `enabled`, `source`, update-check results and `lastError`. It is kept outside LMDB because packs register before hydration.
- `pack-dev-servers/<packId>.json` holds `{ port, pid }` (`packs/dev-server.ts`). It is kept outside `packs/`, because an installed pack dir holds exactly the verified bundle.
- `secrets.json` plus `secrets.key` (file vault only) sit in the same directory (`secrets/index.ts`).
- `packs/<id>/` holds installed bundles, and `host-packs/<id>/` holds published built-in pack artifacts (see Bundle).

## Packs

**Registration** (`packs/pack-registration.ts`) is the in-memory registry the API, bus and harness read.
- `registerPack` first removes SDK-owned entity types and relation kinds from the pack's `ears`, via `ownEARS`, for packs built with an older SDK.
- It throws on a duplicate pack id, an entity or relation value collision, or a service key that clashes with another pack or with `HOST_SERVICE_NAMES`. A compile-time check fails when `HostServices` gains a key that list lacks. These checks run before anything is stored.
- It then registers steps, artifacts, blocks, seed hooks and feature settings. If any of those throws, it rolls back what this call registered.
- Designations from systems and features are registered last.
- `registerHostSystem` covers host systems such as `packs`. `getRegisteredSystems` merges host and pack systems.
- `getRegisteredMigrations(packIds)` takes explicit ids, so the API asks only for built-in packs' migrations. External packs' migrations run through `runPackMigrations`.
- `runRegisteredBootSeeds` seeds only `boot.seedManifest`.

**Discovery and registry** (`packs/pack-discovery.ts`, `packs/pack-registry.ts`)
- `discoverBuiltInPacks(dir)` needs `builtIn`, `id` and `name` in `abuddy.json` and doesn't check for source, since packaged apps ship only `abuddy.json` and `dist/`.
- `discoverPacks(packsDir)` skips hidden dirs, and skips manifests without `id`, `name` and `version`.
- `reconcileExternalRegistry` adds newly found packs as enabled, rewrites entries whose version or dir changed, drops missing packs, and returns the enabled packs.
- `modifyRegistry(fn)` reads, applies `fn` and writes the file. `writePackRegistry` writes to `pack-registry.json.tmp` and renames it into place. A failed write is logged, not thrown.

**Bundle** (`packs/bundle.ts`): the one layout used for `dist/`, release archives and installed packs. The layout is documented in the file header, with paths in `BUNDLE_PATHS`.
- `stageBundle(packRoot, stageDir)` copies `dist/{runtime,build,types}` without `.map` files, writes `abuddy.json` (with an optional version override) and writes `bundle.json`, which records the format version and a sha256 per file.
- `verifyBundle` throws on a format major other than `BUNDLE_FORMAT_VERSION`, a missing file, a checksum mismatch, or an unexpected extra file.
- `createBundleArchive` writes a reproducible `<id>-<version>.tgz` (no mtimes or uids, entries prefixed `<id>/`) plus a `.sha256` file. `extractBundleArchive` checks the sha256 when one is given and requires exactly one top-level dir.
- `publishHostPackArtifacts` is described in `packages/api/src/packs/CLAUDE.md`. It is skipped when `.fingerprint` matches, and it throws when `dist/runtime/seeds-index.sha256` doesn't match `seeds.json`.

**Installer** (`packs/pack-installer.ts`): every install goes through stage, then verify, then place.
- Entry points:
  - `installPack(slug, source?)` dispatches by source: `local`, `url`, an `http(s)` URL, or otherwise a GitHub `owner/repo[@tag]` slug.
  - `installPackFromLocal` accepts a directory, a `.tgz`/`.tar.gz` (extracted with `extractBundleArchive`) or a `.zip` (extracted by shelling out to `unzip`, with `findPackRoot`).
  - `installPackFromGitHub` picks the release's first `.tgz` asset and uses its `<asset>.sha256` when one exists.
- `installFromDirectory` validates the manifest (`parseManifest`) and checks the `hostVersion` option, a range test that includes prereleases (`isHostCompatible`). If the dir is an unstaged built pack source, it stages it into a tmp dir. It then verifies the bundle and calls `placePack`.
- `placePack` copies the bundle into `.<id>.installing-<pid>-XXXXXX`, moves any existing copy to `.<id>.previous-<pid>-<hex>`, and renames the new copy into place. If that rename fails, it puts the previous copy back, then deletes the leftover.
- `checkDependencies` reports the manifest's dependencies that are neither installed nor built in. Built-in ids come from `BUILT_IN_PACKS_DIR` when it is set, and otherwise from the non-hidden dirs in `host-packs/` next to `packsDir`.
- `uninstallPack` deletes `packs/<id>` and throws if the dir is missing. Neither function touches `pack-registry.json`. The API's `packs-system.ts` updates it after an install. The CLI never writes it, so a CLI install is picked up by `reconcileExternalRegistry` at the next boot, without a `source`.

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
- `withModuleBridge({ modules, hostPackages, resolveFrom, stubMissing, bridgedPackages }, fn)` patches `Module._resolveFilename` while `fn` runs. Bridged specifiers map to cache entries under `__module_bridge__/<specifier>`, and each specifier's real resolved path also points at the same entry. `hostPackages` resolve from `resolveFrom`.
- The patch is restored in `finally`, but the cache entries stay, so lazy requires still get the bridged modules.
- `stubMissing`, used by the harness, turns unresolvable bare specifiers into proxies that throw when used.
- `bridgedPackages` (the API passes `['@abuddy/sdk']`): requiring a module of those packages that isn't bridged throws an error with `code: 'ERR_UNBRIDGED_MODULE'` and its `specifier`, instead of resolving another copy. The API's loader skips such a pack with a "rebuild the pack" message (a pack built against an SDK entry this app no longer has, like `@abuddy/sdk/rpc`).
- The API wraps this in `withHostResolution` (see the API doc). `@abuddy/testing` uses it for dependency runtimes.

**Dev server** (`packs/dev-server.ts`)
- `writeDevServerMarker` writes the marker with a temp file and a rename. `removeDevServerMarker` deletes it.
- `devServerUrl(userDataDir, packId, filePath)` returns `null` when there is no marker, and throws on invalid JSON or a bad port. `packages/main/src/modules/pack-protocol/PackProtocol.ts` calls it.
- A marker only means a dev server is running, never that anything on disk is current. Don't use it to skip a build.

## Bus composition (`bus/index.ts`)

`createBusMachine(options)` returns the XState machine that the app starts with systemId `bus` (`@abuddy/sdk/ids`). The options are:
- `onOutgoing` is the client sink.
- `listen(send)` feeds `INCOMING`, `CLIENT_CONNECTED` and `PACK_CLIENT_CONNECTED`, and returns an unsubscribe function.
- `systems` defaults to `getRegisteredSystems`. Every lookup goes through it, so a bus given a subset never reaches past that subset.
- `clientLoadedPacks` lists the packs whose systems wait for `PACK_CLIENT_CONNECTED`.
- `connectedEvents` lists outgoing events sent after each connection.

- On entry, the bus spawns every system with `id` and `systemId` equal to the system id. The `listen` actor is spawned as `bus-listen`. Distinct ids matter: with shared keys, stopping the bus stops only the last child.
- The bus starts in `disconnected`, where it drops `INCOMING`, `OUTGOING` and `SYSTEMS_SPAWNED`. The first `CLIENT_CONNECTED` moves it to `connected`, and entering that state sends `CLIENT_CONNECTED` to every system except the systems of `clientLoadedPacks`. The same happens on each later connection.
- `RELOAD_PACK`, `TEARDOWN_PACK`, `ACTIVATE_PACK`, `PACK_CLIENT_CONNECTED` and `PACK_CHANGED` are handled in both states.
  - `PACK_CHANGED` goes to every running system (a system that isn't running doesn't get it, without a warning).
  - Reload stops the listed systems, then respawns the ones still registered and raises `SYSTEMS_SPAWNED`, which sends them `CLIENT_CONNECTED` only while connected.
  - Activate raises `SYSTEMS_SPAWNED` only for packs that aren't client-loaded.
- Systems are stopped by reference, through `system.get(id)`.
- `routeIncoming` strips `systemId` and warns when the target isn't running, which can happen mid-reload.
- The app's composition is `packages/api/src/systems.ts` (`backendSystem`). Its sources are `rootEvents`, the logs system is excluded from routing, and `connectedEvents` sends `hasOnboarded`. The harness composition is `packages/abuddy-testing/src/app.ts`. Behaviour tests live in `packages/api/tests/unit/bus-client-connected.spec.ts` and `pack-reload.spec.ts`.

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
- Only the API's `core/router/secrets-router.ts` tRPC procedures (`add`, `replaceValue`, `allowUnprotected`, ...) and `services/inference.ts` (`keyFor`) touch values. `services/secrets.ts` exposes only `status`, `list`, `select`, `rename` and `delete` to packs.

## Services (`services/`)

- `registerHostServices()` registers each entry of `HOST_SERVICES` (`appData`, `traceStore`, `inference`, `secrets`) with `registerHostModule(key, impl)`. The API calls it in `packages/api/src/setup/sdk-host-init.ts`.
- `inference.ts`: `createModelResolver()` parses the `provider:model` id and checks the requested kind against `providerCapabilities`. It lazily imports the `@ai-sdk/<provider>` factory and passes an explicit `apiKey` (from `secretsStore.keyFor`) and an explicit `baseURL` (from `PROVIDER_BASE_URLS`). As a result, environment variables such as `ANTHROPIC_BASE_URL` can't redirect calls. The `baseUrls` option exists only for tests.
- `app-data.ts` handles reset (`resetLmdbFiles`), backup export and import, and backup info. After an import, or a failed import, it clears memory and runs `hydrateSharded` again.
- `trace-store.ts` provides read-only access to `envs.volatileBackup` through the API's `LmdbQuery` (the `lmdb-query` host module).

## EARS, persistence, backup

- `ears/lmdb.ts` delegates to host modules the API registers in `sdk-host-init.ts`: `attribute-storage` (`resetLmdbFiles`, `closePersistence`, `reinitializeLmdb`, and the `envs`, `policy` and `persistence` proxies) and `hydrate-sharded`. Calling these delegates before that registration fails.
- `persistence/policy.ts`: `makePolicy` routes entity types listed in `excludedEntityTypes`, and relations that touch one of them, to `volatileBackup`. Everything else goes to `primary`, and only `primary` is hydrated by default.
- `persistence/sharded-router.ts`: `makeShardedPersistence` routes sink calls by entity-id prefix. It moves a relation between partitions when its src or tgt changes, and requires `entireArray` for `onDropAttr`. Its relation metadata cache (`relMeta`) is module-level, so every router instance shares it. The partition map is per instance.
- `backup/index.ts`: `exportDatabase` copies the requested databases (default `['lmdb']`; `volatileLmdb` only when listed) and writes `metadata.json`. It also copies `media/` when `lmdb` is included and the media dir exists. On import it copies the current files to `temp-backup-*`, restores the backup, and puts the old files back if anything throws. Database names the app doesn't know are skipped.

## Build helpers and source resolution

- `SHARED_DEPS` lists the packages the host provides to packs. FE entries are exposed on `window.__abuddy` under `globalKey`, and BE entries (`xstate`, `zod`) are bridged.
  - `getSharedFeDeps()` also shares every exported subpath of `@tiptap/pm` and `@tiptap/vue-3`, and aliases `prosemirror-<name>` to `@tiptap/pm/<name>`.
  - To give pack FE code a new SDK module, add it to `SDK_FE_MODULES`. The FE bundler's error message says to do this.
- `assertSourceResolution(resolve, processName)` throws when a checkout's `@abuddy/sdk` or `@abuddy/ui` (a package with `src/`) resolves outside `src/`. It is called by the API boot (except under Electron), the CLI bin (`abuddy-cli/bin/abuddy.mjs`) and `@abuddy/testing` (`src/source-check.ts`).
- `withSourceCondition` and `withoutSourceCondition` edit `NODE_OPTIONS`. `abuddy test` and the fixture's launch env use them.

## Tests (`tests/`)

- `packs/`: `bundle`, `dependencies` (`checkDependencies`, publish staging), `dev-server`, `discovery`, `host-info`, `module-bridge`, `registration`, `staging`, and `updater` (`findLatestRelease`, with `fetch` mocked).
- `secrets/`: `store` (uses `memoryKeyVault`) and `private-file`.
- `services/`: `inference` (provider URLs, model kinds) and `register`.
- `build/`: `source-resolution`.
- Related suites elsewhere:
  - `packages/api/tests/unit/` (`secrets`, `pack-lifecycle`, `pack-reload`, `pack-loader`, `sdk-bridge-drift`, `bus-client-connected`)
  - `packages/abuddy-cli/tests/cli/{install-host-version,dev-install,pack-cli}.spec.ts`
  - `packages/abuddy-cli/tests/packs/host-artifacts.spec.ts`

## Gotchas

- `reconcileExternalRegistry` rebuilds an entry whose version or dir changed from only `id`, `name`, `version`, `dir` and `enabled`, so fields like `source` and `availableVersion` are dropped. An out-of-app reinstall (`abuddy install`) therefore loses the pack's update source at the next boot.
- `writePackRegistry` doesn't throw on failure, so callers can't tell that a registry write was lost.
- The `pack-store.ts` FE registry and `app-extensions.ts` are module-level state. External pack FE code can't reach them, and the renderer calls `registerPackFE` on its behalf (see the API doc's FE entry section).
- Adding a host service means updating `HostServices`/`HostImplementedServices` in the SDK, `HOST_SERVICE_NAMES` (`pack-registration.ts`) and `HOST_SERVICES` (`services/index.ts`). Both lists are type-checked against the SDK types.
