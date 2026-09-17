# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server (`node:http` + `ws`) using tRPC: transport, process boot and the composition of the app runtime (`@abuddy/host`: XState actor systems, packs, services) over LMDB persistence (`@abuddy/ears/lmdb`)
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — the built-in pack: features, steps, and seed sources (actions, prompts, flows, library, notes, FAQs, settings) that `abuddy build` compiles into `packages/default-setup/dist/` from `abuddy.json` `boot.seed` (see `packages/default-setup/CLAUDE.md` and `docs/public-facing/seeds.md`)

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Release metadata

Do not edit release/version metadata unless the user explicitly asks for a release or version bump. This includes `package.json` version fields, `package-lock.json` root package versions, app version constants, release notes, changelogs, and generated release artifacts. The release process owns those changes.

## Commands

```bash
npm start                # Dev mode (builds the built-in pack without its FE bundle)
npm run start:gen        # Full built-in pack build (npm run compile), then dev mode
npm run build:be         # Build backend only
npm run build            # Build all workspaces
npm run build-prod       # Full production build (build/build.sh)

npm run typecheck        # Every check below, plus check:specifiers
npm run typecheck:fe     # Frontend only (vue-tsc)
npm run typecheck:be     # Backend only (tsc --noEmit, plus the api's scripts)
npm run typecheck:ears   # @abuddy/ears only
npm run typecheck:sdk    # @abuddy/sdk only
npm run typecheck:host   # @abuddy/host only
npm run typecheck:ui     # @abuddy/ui only
npm run typecheck:cli    # @abuddy/cli + @abuddy/testing
npm run typecheck:scripts # scripts/ and tests/
npm run typecheck:pack   # @app/default-setup only
npm run check:ui-entries # Fails on a stale @abuddy/ui exports map or a component without an entry

npm test                 # Playwright E2E tests
npm run test:unit        # Vitest: @app/api, @app/default-setup, @abuddy/host, @abuddy/ears
npm run test:all         # test:unit, then the E2E tests
npm run bench -w @abuddy/ears    # EARS engine benchmark (baseline and tolerance: packages/abuddy-ears/CLAUDE.md)
npm run test:external-pack       # Build the fixture packs in tests/fixtures with the CLI and run their tests (needs npm run build)
npm run test:packaged-authoring  # Author, build, test and install a pack outside the monorepo from the packed @abuddy/* tarballs (needs npm run build)
npm run compile          # Build packages/default-setup (abuddy build: compiled seeds, snapshot, types; DSL defs; dist/runtime/index.cjs)

npm run db:cli           # Database CLI
npm run db:reset         # Reset database

# Published API surface (run from packages/abuddy-ears, packages/abuddy-sdk or packages/abuddy-ui)
npm run api:check        # CI: fails if a public entry's API changed without updating reports
npm run api:update       # Dev: regenerate etc/<entry>.api.md (and etc/<entry>.component.md for UI components)

# Built-in pack facade types (after `abuddy build`; from packages/default-setup or with -w @app/default-setup)
npm run facade:check     # CI: fails if dist/types/pack-types.d.ts changed without updating etc/pack-types.api.md
npm run facade:update    # Dev: regenerate etc/pack-types.api.md

# Manifest JSON schema (-w @abuddy/sdk)
npm run generate:schema  # Regenerate packages/abuddy-sdk/abuddy.schema.json from manifest-schema.ts
npm run schema:check     # Fails if abuddy.schema.json is stale

npm run packages:build   # Build dist/ for @abuddy/ears, @abuddy/sdk and @abuddy/ui, bundle @abuddy/cli and @abuddy/testing
npm run packages:check   # publint + arethetypeswrong on the packed packages (after packages:build)
```

### E2E visual testing

Playwright tests launch the full Electron app and interact via `window.applicationState` (the XState actor). Use to visually verify UI changes.

```bash
npm test                              # Run all E2E tests
npm test -- smoke                    # Run just smoke tests
npm test -- tests/e2e/scratch        # Run ad-hoc scratch test (gitignored)
DEBUG_E2E=1 npm test                  # With Electron stdout/stderr logging
```

Screenshots save to `tests/screenshots/` (gitignored). The `app` fixture provides `navigate(pluginId)`, `screenshot(name)`, `sendEvent(event)`, `getState()`, `getContext()`, `waitForState(check)`, and `waitForPlugin(pluginId)`.

The fixture source is `@abuddy/testing` (`packages/abuddy-testing/src/index.ts`), re-exported by `tests/e2e/fixtures/app.ts`. It launches Electron, finds the main window via `window.applicationState`, bypasses onboarding, and provides the `AppHelper` API. External packs share the same fixture — `abuddy init-tests` scaffolds tests in a pack repo, then `abuddy test` runs them in a local checkout (`--app-root`) or a downloaded AgentBuddy Beta (`--app beta`). Set `PACK_DIR=/path/to/pack` to sync/build a pack and wait for its plugins.

For full fixture lifecycle, API reference, and ad-hoc testing pattern, see `tests/e2e/CLAUDE.md`. For external pack testing details, see `packages/abuddy-testing/CLAUDE.md`.

## Architecture

### Event-driven actor system

Every backend **system** and frontend **plugin** is an XState state machine. They communicate via a central event bus:

- **Backend → Frontend**: `system.get(bus).send(emit(pluginId, event))` inside a system's actions, `sendToPlugin(pluginId, event)` elsewhere; actions use `services.emitter.sendToPlugin`
- **Frontend or backend → System**: `sendToSystem(systemId, event)`, typed with the events each system declares (own systems by feature id, a dependency's as `<dependency>/<feature>`; actions name every system `<pack>/<feature>`)
- **System → System**: `system.get(otherSystemId).send({ type })`
- Pack code takes `emit`/`sendToPlugin`/`sendToSystem` from `#generated/events`; `onConnected`/`onIncoming` come from `@abuddy/sdk/events`. `check:specifiers` rejects the host's raw event paths (its root event bus and API client) and the untyped sends in pack sources
- **⚠️ `sendToPlugin` wraps events with `pluginId`** — never use `pluginId` as a field name inside event payloads sent via `sendToPlugin()`, it gets overwritten by the transport layer. Use `targetId` or similar instead.

Systems define `IncomingSystemEvents`, `SystemInternalEvents`, and `OutgoingSystemEvents`. System code lives in `packages/default-setup/src/features/<name>/be/system.ts`, its identity from `defineSystem(id)`; a feature's designation comes only from `abuddy.json` `features[].designation`, which must equal the feature id. The bus machine is `createBusMachine` in `packages/abuddy-host/src/bus`; `createAppBus(registry)` there composes it with the app's root event bus (the api's tRPC event sources), and `packages/api/src/setup/backend.ts` starts it. Systems register through the app's registry (`createPackRegistry()` in `packages/abuddy-host/src/packs/pack-registration.ts`, its `registerPack()`); external packs' system ids are `<packId>.<featureId>` (use `busId` from `#generated/bus-ids`).

### SDK packages

`@abuddy/sdk` is the pack-facing API; host-only modules live in the private `@abuddy/host` (`packages/abuddy-host`). Packs, built-in or external, import only `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/ui`; host code (api, renderer, CLI and testing) also uses `@abuddy/host`; default-setup, tests included, does not depend on it. `npm run check:specifiers` rejects `@abuddy/host` in pack sources and CLI templates, and `abuddy build` fails a pack bundle that imports it. Pack code reads relations with `findRelations`/`getRelationStats` and queries untyped with `untypedQx` (`@abuddy/ears`), reaches host-implemented data operations through `services.appData` (reset, backup export/import, whether the user finished onboarding), `services.traceStore` (the volatile trace store) and `services.secrets` (the user's API keys as metadata: list, select, rename, delete; never values), and calls models through `services.inference` (AI SDK 7's `generateText`/`streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe` and `rerank`, with `provider:model` ids checked against `providerCapabilities`, `output` as an `Output` or plain data like `{ type: 'object', schema }`, and the key the user selected per provider, never the environment; packs import pure pieces like `tool` from `ai`).

Layers, each importing only the ones above it (`check:specifiers`, `findUpwardImports`, and each `package.json`'s `@abuddy` dependencies):

| Layer | Holds |
|---|---|
| `@abuddy/ears` | the engine, the EARS types, the persistence port (`/lmdb`: the LMDB store) |
| `@abuddy/sdk` | the pack contract and pack runtime: lookups of what packs registered, the services' contracts, event sends, logging and error reports over the bound bus, the SDK entities and their repositories, the `HostRuntime` port |
| `@abuddy/host` | the app runtime: the four app services (`/services`), app state (`/app-state`), and what the app runs (`/packs` and `/packs/runtime`, `/bus`, `/migrations`, `/secrets`) |
| `packages/api` | transport (`node:http`, `ws`, the tRPC routers, the log stream), process boot and composition (`setup/backend.ts`) |
| `packages/renderer` | the frontend composition: binds the frontend port |

What crosses to the app follows one rule, **bind resources, derive behaviour**. A resource has identity per running app (the event bus, the engine and its data, the registered packs, services doing I/O on user data or keys) and is a `HostRuntime` member; behaviour over a resource is SDK code, written once for the app, tests and tooling. So event sends, logging and error reports are SDK code over the bound bus, not host implementations. `services` holds seven host services (`HostServices`, reserved names in host's `pack-registration.ts`): the SDK implements `logger` and `emitter` over the bound bus and `repository` from the bound engine, and the app implements four, `appData`, `traceStore`, `inference` and `secrets`: contract types in `@abuddy/sdk/services/<name>.ts`, implementation in `@abuddy/host/services/<name>.ts`, test doubles in `@abuddy/sdk/testing`'s in-memory runtime (`fakeInference`, `addTestSecret`). Host-only modules (`/app-state`, `/migrations`, `/packs/runtime`, `/bus`, `/secrets`) aren't reachable from the SDK.

- `@abuddy/ears` (`packages/abuddy-ears`, see its CLAUDE.md) — the EARS engine, published like the SDK and imported by no other `@abuddy` package: `tx`, `defineEars`, `grantRole`, `repository`/`registerRepository`, the core `EARS` namespace (`Entity = { Relation }`), `BaseEntity`/`EntityShapes`/`ShapeOf`/`EntityNameArg`, etc. The engine is an instance: `createEarsEngine({ persistence?, isEntityType })` returns a new, empty engine that owns its stores, indexes and caches (no `@abuddy/ears` module keeps data at module scope, `tests/no-module-state.spec.ts`), with two faces: `query` (`qx`, `tx`, the finders, relation reads, graph walks, the repository registry) and `admin` (`clear`, `bulkLoadAttr`, direct attribute and relation writes, `edgeStore`, the relation index, the entity-type checker), which only its creator holds. The free functions (`untypedQx`, `tx`, `repository`, the `defineEars` facades…) act on the engine installed with `installEngine(query)` and throw, naming the fix, when none is: `bindHost` installs the app's (`HostRuntime.ears`), `startTestRuntime` a test engine (`resetTestData` replaces it, keeping repositories), and tooling installs or passes its own (`exportFlowsToDSL(dir, { engine })`). A pack's repositories arrive in its registration (`PackRegistration.repositories`), and the host registry's `registerPack` registers them with the installed engine. It's a shared-instance package with the SDK: `SHARED_INSTANCE_PACKAGES` in `@abuddy/host/build/shared-deps` is the one list the bundler externals, the pack loader's bridge (generated `packs/runtime/shared-modules.ts`, `npm run shared-modules:update -w @abuddy/host`), the harness bridge and `bundle-package` derive from; `check:specifiers` rejects those consumers naming the packages themselves, and upward imports (`@abuddy/ears` imports no `@abuddy/*`, `@abuddy/sdk` only `@abuddy/ears`, `@abuddy/host` only those two and never the API).
- What the SDK adds to the engine: its `EARS` (the engine's types plus `SDK_ENTITIES`/`SDK_REL_KINDS`) and the SDK entity shapes, from `@abuddy/sdk/types` (and the root), and the SDK entities' repositories from `@abuddy/sdk/repositories` (`flowRepository`, `tnodeRepository`, `actionRepository`, `promptRepository`; default-setup's flows, actions and prompts repositories build their views over them). Packs get typed `qx`/`tx`/`find*`/`createEntityWithDefaults`/`updateEntity`/`getAttr` from `#generated/ears` (a literal entity name must be one the pack or its dependencies declare, its `EntityName`; a name typed `string` passes unchecked; ids from typed queries carry their entity type, a plain `EARS.EntityId` is accepted anywhere; `tx` checks declared fields' values when it knows the entity; the SDK owns Relation and the flow model (Flow, Node, TNode, Action, Prompt), defined in `abuddy-sdk/src/types/sdk-entities.ts`, and no pack declares them; Settings is default-setup's, and the host declares `AppState`, which packs never see), `repository` (typed with the repositories declared in `abuddy.json` `features[].repositories`) from `#generated/repository`, and `emit`/`sendToPlugin` (keyed by receiving plugin; `features[].system.sendsTo` adds cross-plugin sends) and `sendToSystem` (keyed by receiving system; a pack without systems sends to its dependencies') from `#generated/events`. Systems default-export their entry with `satisfies SystemEntry`, which keeps the spec's events for the generated types. `abuddy build` bundles a pack's facade types into `dist/types/pack-types.d.ts` (and its snapshot), so dependents' facades include them. `check:specifiers` rejects raw `emit`/`sendToPlugin` imports and `registerRepository` from `@abuddy/ears` in pack sources.
- `@abuddy/ears` also holds the persistence port (`PersistenceSink`, `Partition`/`PartitionPolicy`/`makePolicy`, `makeShardedPersistence`). `@abuddy/ears/lmdb` is the LMDB store: `openLmdbStore({ paths, policy })` returns the store (`sink`, `envs`, `hydrate`, `query`, `close`, `reopen`, `reset`); nothing opens on import. `lmdb` is an optional peer of `@abuddy/ears` that the app installs (`packages/api` keeps it as a dependency for the packaged app). Only `/lmdb` imports `lmdb`: the api's composition (`openAppStore()` in `setup/backend.ts`) opens the store with the app registry's `partitionPolicy` (and `engine: () => engine.admin`, which the store hydrates into and reads relation details from), creates the engine with `store.sink` as its persistence, and binds `createHostRuntime({ store, engine, packs, … })`; host code (`@abuddy/host/services`, `/backup`) takes the store, and the engine's `admin` face, as arguments; packs, pack tests and the pack bridges never load it (`APP_ONLY_EXPORTS`); `check:specifiers` (`findLmdbImports`) enforces it. No code reaches engine state except through an engine's `admin` (`abuddy-ears/tests/no-engine-state-access.spec.ts`).
- `@abuddy/sdk/events` — messaging: `emit`, `sendToPlugin`, `sendToSystem`, `sendToBrainSystem`, `onConnected`, `onIncoming`, `defineEvents` and the event map types. Frontend-safe; shared with pack frontends as the `sdkEvents` global. It sends over the bound app's bus (`HostRuntime.transport`), or in the renderer over the frontend port's `transport`. `sendToPlugin` (and `services.emitter.sendToPlugin`) goes through the bus actor, so like a system's `emit` it's dropped until a client connects.
- `@abuddy/sdk/logger` — `createLogger(source, { debug? })` (debug gated per source by `setDebugEnabled`), `reportError` (a system error, sent to the app as `SYSTEM_ERROR`, or with `step` a flow step's error recorded on its TNode) and `onLog`. SDK code over the bound bus: a logger emits redacted log events there (the api prints each once), and with no app bound (the CLI, tooling) writes to the console. Backend pack code doesn't call `console.*` (`check:specifiers`).
- `@abuddy/sdk/templates` — `executeTemplate`, `createTemplateResolver`. `@abuddy/sdk/env` — `resolveAppContext`, `getAppVersion`. `@abuddy/sdk/runtime` — the one port to the app: `HostRuntime` (`transport.rootEvents`, `ears`, `packs`, `appVersion`, and `services`: `appData`, `traceStore`, `inference`, `secrets`), bound once per process with `bindHost` (the api binds `createHostRuntime(...)`, `startTestRuntime` an in-memory one), and the renderer's `bindFeHost({ application, secrets, transport, packs })`; an unbound use throws naming them. The registered packs are an instance too: the program that assembles an app creates one (the api's composition root `createPackRegistry()`, the renderer `createFePackRegistry()`, the harness one per test file, the CLI one per build) and binds its read face (`PackRegistryView`, `FePackRegistryView`); the SDK's lookups of what packs registered (designations, steps, artifacts, blocks, seed hooks, seeders, feature settings defaults, commands, pack services, and in the renderer tiptap plugins and DSL types) read the bound one, and no SDK or host module keeps them at module scope. Everything a pack contributes arrives in its `PackRegistration`/`PackFERegistration` (seeders and DSL types included); there's no registry for pack code to write to. Contexts without an app (SDK specs, a pack test filling a lookup directly) use `testPacks` from `@abuddy/sdk/testing`. Also the `@internal` `rootEvents` (the bound bus). `secretsClient` (`@abuddy/sdk/fe`) reads the frontend port's `secrets`; no general API client reaches the SDK.
- `@abuddy/sdk/fe` — pack-facing: `Plugin`, `PackFERegistration`, `safeEvents`, `useActorSystem`, `navigateToPlugin` (`fe/navigation.ts`), `secretsClient`, etc.
- `@abuddy/host/fe` — host-only: `createFePackRegistry()`, the renderer's registered pack frontends (`registerPackFE`, `getRegisteredPlugins`, app extensions).
- `@abuddy/host/packs`, `/packs/runtime`, `/packs/dev-server`, `/backup`, `/build/discover`, `/build/shared-deps`, `/build/source-resolution` — pack registration (`createPackRegistry()`: the registered packs as an instance, with their partition policy and shutdown hooks), discovery, registry, installer, updater, bundle layout and module bridge (the CLI imports this barrel, which never imports `/packs/runtime`); the pack runtime the app runs, on the registry it's given (loader, SDK bridge, lifecycle, reload, seeding, the host `packs` system); the `abuddy dev` server marker the `pack://` handler proxies to; backups of the LMDB store; build-time pack discovery and host-shared dependency lists; the `@abuddy/source` condition helpers and the check that a process resolves workspace source, not `dist`.
- `@abuddy/host/bus` — `createBusMachine`, the backend bus (spawns registered systems, routes events, pack activate/teardown/reload), `createAppBus()`, the app's composition of it, and `receiveClientEvent()`, the check, log and send behind the API's `bus.send`. It never imports the pack loader; the pack test harness runs the same machine.
- `@abuddy/host/migrations` — the app's migrations runners (`runAppMigrations`, `runPackMigrations`; see Migrations below). Host-only, never bridged to packs.
- `@abuddy/host/services` — the host's implementations of the services packs reach through `services` (`app-data.ts`, `trace-store.ts`, `inference.ts`, `secrets.ts`, each named after its contract and delegate in `@abuddy/sdk/services`). `createHostRuntime({ store, engine, transport, appVersion, packs })` (`services/index.ts`) is the only place the app's `HostRuntime` is assembled, over the LMDB store (`appData` and `traceStore` use it); the API's composition binds it. `appData.reset()` resets the whole app: stores and keys, each pack's `onInit` and boot seed, then the host's `runAppMigrations(registry)`. `src/services` holds only those four services and the index (`tests/boundaries.spec.ts`). A service's implementation never lives in the API, which keeps only transport, process boot and composition (`packages/api/tests/unit/source-layout.spec.ts` lists its files); the API's tRPC procedures delegate to host (`receiveClientEvent`, `secretsStore`/`secretsSnapshot`, `getPackBundleEntries`).
- `@abuddy/host/app-state` — host-only: the app's own state, one `AppState` row (`hasOnboarded`, `version`, `packVersions`, `packSeedHashes`, `seedHashes`, `seedStatFingerprints`) that only host code reads and writes (`appState`); the host registers the entity type next to the SDK's (`HOST_ENTITY_TYPES`). Packs learn whether the user onboarded through `services.appData.hasOnboarded()`/`completeOnboarding()`, the renderer through the application plugin's `CLIENT_CONNECTED`. Resetting settings doesn't touch it; `appData.reset()` empties it with the rest.
- `@abuddy/host/secrets` — host-only, never bridged to packs: the store of the user's API keys (metadata plain, values AES-256-GCM encrypted in `secrets.json`, the data key in a `KeyVault`: the OS credential store via `@napi-rs/keyring`, or a file in the test environment or after the user allows unprotected storage). Values reach it only through the API's `secrets.*` tRPC procedures, off the event bus (`forwardSecretsChanges()` tells the settings system that keys changed, never their values); inference reads them with `secretsStore.keyFor(provider)`. The API logger and error reports redact key-shaped strings.
- `@abuddy/ui` (`packages/abuddy-ui`) — Vue components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`). Published as compiled JS (tsdown, with vue-tsc declarations). Packs use the host's copy at runtime: the renderer exposes every export on `window.__abuddy` and the pack FE bundler proxies `@abuddy/ui` imports, unless `abuddy.json` sets `fe.bundleUi`. Contracts and host-shared state (`useActorSystem`, menu state, the tiptap plugin and DSL type lookups) stay in `@abuddy/sdk/fe`; `@abuddy/sdk` must not import `@abuddy/ui`.
- `@abuddy/sdk/utils` — **Node-only**: re-exports everything (pure + Node-dependent). Backend code imports from here.
- `@abuddy/sdk/utils/pure` — **environment-agnostic**: pure utilities only (`compareVersions`, `detectChanges`, `BinaryOperator`, `toMap`, `randomId`, etc.). Frontend/renderer code must import from this path (or a specific sub-path like `@abuddy/sdk/utils/compare-versions`), never from `@abuddy/sdk/utils`.

Relative imports in `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/host` and `@abuddy/ui` name the `.ts` source (`./query.ts`); tsc (`rewriteRelativeImportExtensions`) and tsdown write `.js` into the output. `npm run check:specifiers` (part of `npm run typecheck`) rejects relative `.js` specifiers there. Workspace tsconfigs that compile this source need `allowImportingTsExtensions`. Generated pack code (`generate-entries`) keeps `.js`.

When adding new utils, put pure functions in the appropriate file under `utils/` and re-export from `pure.ts`. Node-dependent code stays in the existing Node modules and is re-exported only from `index.ts`.

`@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` publish their workspace `package.json`. Each export resolves source under the `@abuddy/source` condition and `dist/` otherwise, so monorepo tooling sets that condition: tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, esbuild/tsup `conditions`, `node --conditions` (the CLI bin's resolve hooks in source mode, the API process the app spawns from source). Node commands that load workspace source run through `node scripts/with-source.mjs <command>`, which appends the condition to `NODE_OPTIONS` (`npm test`, the api's `db:*` scripts); run Playwright through `npm test -- <args>`, which carries the condition. `@abuddy/testing`, the CLI and the API's dev boot fail when they would resolve a checkout's `dist` instead of its source. `npm run packages:build` writes `dist/`; `npm run exports:update -w @abuddy/ui` regenerates the UI exports map after adding or removing a module. To publish a `@abuddy/ui` component, add a `.ts` entry module next to it (`design/button.ts`: `export { default } from './button.vue'; export * from './button.vue';`) and run `exports:update`. TypeScript can't resolve an exports target that is a `.vue` file, so the entry is what consumers import. SFCs without an entry are internal: other `@abuddy/ui` files import them by relative path, and `exports:update` fails if code outside `@abuddy/ui` imports one.

When adding new EARS or FE exports, put them in the correct barrel. Tag exports only the host uses `@internal`. After changing public exports, run `npm run api:update` in `packages/abuddy-sdk` (or `packages/abuddy-ears`, `packages/abuddy-ui`) and commit the updated `etc/*.api.md` reports. A UI component's props, emits, slots and exposed members are reported in `etc/<entry>.component.md`, so changing them needs `api:update` too. The pack-facing SDK exposes no `any` (`published-sdk-any.spec.ts` fails when an export does; use `unknown` or a generic); `@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` support TypeScript 5.7 and later (`packages/typescript-floor`; `ai` 7's declarations need it).

**Typed EARS types are change-controlled.** `abuddy-ears/src/{entities,runtime,typed}.ts`, `abuddy-sdk/src/types/{entities,sdk-entities}.ts` and the generated `PackShapes`/`EntityName` are a specified contract that editor completions depend on. Don't widen or rewrap them to make a call site compile; fix the call site (explicit shape, `EntityName` constraint, `untypedQx` from `@abuddy/ears`). Read `packages/abuddy-sdk/TYPED-EARS.md` and follow its checklist, including checking completions, before any change.

### Data layer (EARS)

Custom entity-attribute-relation graph database (`@abuddy/ears`) backed by LMDB (`@abuddy/ears/lmdb`). All data lives in memory; the store persists writes and hydrates them at boot.

- `createEarsEngine()` — an engine instance (the app creates one at boot; tests and tooling create their own)
- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: a feature's `be/repository/index.ts` exports `<name>Queries`/`<name>Commands` objects (usually from `queries.ts`/`commands.ts`), declared in `abuddy.json` `features[].repositories` as `"path#export"`; code reaches them through `repository` from `#generated/repository`
- A pack's repository can expose another package's repository methods (default-setup's `actionQueries.byId` is the SDK's `actionRepository.byId`), so its code reaches its data through `repository` alone. It takes them by reference (`byId: actionRepository.byId`), never wrapped in a function that re-declares the signature, and adds its own views beside them
- Each entity's repository lives with the package that declares it: the SDK's entities' in `@abuddy/sdk/repositories`, a pack's in its features, the host's `AppState` in `@abuddy/host/app-state`. No package reads another's repositories through a cast of the registry (`repository as unknown as` fails `check:specifiers`, `findRepositoryCasts`)

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. Plugin code lives in `packages/default-setup/src/features/<name>/fe/`. Plugins come from `abuddy.json` `features[].plugin`: `generate-entries` writes them into `src/__generated__/pack-entry-fe.ts`, which the renderer imports through `virtual:built-in-packs` (external packs' load at runtime from `pack://<id>/runtime/fe.js`).

### Key patterns

- Every backend system must handle `CLIENT_CONNECTED` to send its plugin's startup data. The bus sends it to every system when a client connects, except systems of external packs with frontend code: those get it once the renderer has loaded the pack's frontend (`bus.packClientReady`), and again when its subscription reconnects
- The bus sends every running system `PACK_CHANGED { packId }` once a pack is activated, reloaded or torn down, or its seeds are imported; systems listing what packs register or seed send their data again
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### App environment

Environment identity and data paths come from one resolver, `@abuddy/sdk/env` (`resolveAppContext()`). Don't read `NODE_ENV`, `PLAYWRIGHT_TEST` or platform paths to decide which data dir to use.

- The Electron main process infers the environment once at startup (`packages/main/src/app-context.ts`): Playwright → `test`; packaged builds → the channel stamped by `build/build.sh` (`production` | `beta`; an unstamped packaged build refuses to start); source runs → `ABUDDY_ENV` if set, else `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process.
- Anything started without them throws instead of falling back to production. Manual API boots must pass both, pointing at a copy of user data: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`
- CLI commands pass `{ env }` explicitly (`install`/`uninstall`/`list`/`open` default to production; `-d`/`-b` select dev/beta).

### Migrations

Migrations live with their pack; the host only moves the app's state from before `AppState` (`packages/abuddy-host/src/migrations/legacy-app-state.ts`). default-setup's are in `packages/default-setup/src/migrations/`: each file exports a `PackMigration` (`@abuddy/sdk/framework`) with `target`, `description` and `up()`, listed in that folder's `index.ts` and registered with the pack. `@abuddy/host/migrations` (`packages/abuddy-host/src/migrations/index.ts`) holds only the runners, which the API's boot and host's `services.appData.reset()` call through `startPacks()` (after the packs' `onInit`, before the seeds), and a backup import after reloading the data:

- `runAppMigrations(registry)` — first moves the app's state from before `AppState` whatever the version (running nothing and recording nothing if that fails), then the built-in packs' migrations in the app's registry, run when `stored app version < target <= app version` (`getAppVersion()`, the bound runtime's); records `AppState.version`. Data with no recorded version is new and at the app version (after the move recorded any older one).
- `runPackMigrations(registry, externalPacks)` — each external pack's migrations, against that pack's own version (`stored < target <= manifest version`); records `AppState.packVersions[packId]`. External migrations never run in `runAppMigrations()`.

Rules for default-setup migrations (details in `packages/abuddy-host/src/migrations/CLAUDE.md`):

- **Target the next release version** — name the file after the version it targets (e.g. `0.2.4.ts` runs when the app is released as 0.2.4+). Several changes for one release go in the same file.
- **Never bump `package.json` version manually** — the release process handles version bumps. Migrations are written ahead of time to target the upcoming release.
- **List it in `packages/default-setup/src/migrations/index.ts`** — import and append to the `migrations` array in version order.
- **Idempotent guards** — always check if the change is needed before applying (e.g. `if (!value) set(value)`), since migrations may re-run after a reset.

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK 7 (model calls through `services.inference`: Anthropic, OpenAI, Google, Groq, Mistral, Cohere), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
