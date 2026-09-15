```
# Goal: clean package boundaries — @abuddy/ears, a typed host port, and one owner per concern

Implement docs/issues/goal-package-boundaries.md on a branch cut from AS/inference-service
(fb06e736a or later): Background, Spike results, Decisions, Phases, Constraints. Read it first.
Decisions are final: implement them, don't reopen them or stop to ask. Where a detail isn't
specified, pick the conventional option, note it in the final summary, and keep going. No
backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the
exception: it moves with app migrations.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `registerHostModule`, `getHostModule`, `hostFn` and `hostValue` no longer exist. The SDK
  reaches the host only through the typed `HostRuntime` bound once per process: the event bus,
  the pack registry view, the app version and the three services packs call (`appData`,
  `traceStore`, `inference`), each implemented in `@abuddy/host/services/`.
- All EARS code (engine, types, persistence, LMDB) lives in `@abuddy/ears`; no EARS or
  persistence code remains in `@abuddy/sdk`, `@abuddy/host` or `packages/api`.
- `packages/api/src` holds only transport (Fastify, WebSocket, tRPC), process boot and
  composition.
- No package reads another package's data through a cast (`BuiltinRepositories`,
  `HostSettingsRepositories`); each entity's repository lives with the package that declares it.
- The typed EARS contract behaves as before: default-setup's typed-EARS specs,
  `facade-typing.spec.ts` (workspace source and published package) and completions pass.
- `npm run typecheck`, `schema:check`, `api:check` (sdk, ui, ears), `packages:build` +
  `packages:check`, and the api, sdk, ears, host, cli, default-setup and renderer unit suites pass.
- `npm run build`, the monorepo E2E suite, `npm run test:external-pack`,
  `npm run test:packaged-authoring` and the example pack's `abuddy test --app-root <repo>` pass.
- You give a final summary: phase → done/deferred, evidence, and the conventional choices you made.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no Co-Authored-By or
  session lines). Commit with `git commit -- <paths>` and check `git diff --cached` first:
  something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site
  compile. Moving them is this goal's agreed design change; follow the TYPED-EARS checklist.
- loosen a failing assertion instead of investigating.
```

## Background

Five packages share responsibilities that should each have one home, and the code jumps between them through a string-keyed registry.

- **The host module registry.** `@abuddy/sdk/runtime` (`src/runtime/host.ts`) holds a process-global `Map<string, unknown>`. SDK and host code read it with `getHostModule`/`hostFn`/`hostValue` to reach code in packages they can't import. It has 14 keys:

  | Key | Registered by | Read by | Implemented in |
  |---|---|---|---|
  | `attribute-storage`, `hydrate-sharded` | api `setup/sdk-host-init.ts` | `host/src/ears/lmdb.ts` (through `any` Proxies) | `api/src/core/ears`, `api/src/core/persistence` |
  | `lmdb-query` | api | `host/src/services/trace-store.ts` | `api/src/core/persistence/lmdb/query.ts` |
  | `trpc`, `bus-emitter`, `router-events` | api | `sdk/src/rpc/index.ts` | `api/src/core/router` |
  | `event-emitter` | api | `sdk/src/services/index.ts` | `api/src/core/router/event-emitter.ts` |
  | `logger` | api | `sdk/src/logger/index.ts` | `api/src/core/shared/debug/logger.ts` (imports `bus-emitter`) |
  | `system-errors`, `version`, `migrations` | api | `sdk/src/utils/index.ts` | `api/src/core/shared/system-errors.ts`, `api/src/version.ts`, `api/src/setup/migrations` |
  | `pack-registry` | api, and the test harness | `sdk/src/services/index.ts` | `@abuddy/host/packs` |
  | `app-data`, `trace-store`, `inference` | api (`registerHostServices`) | `sdk/src/services/*` | `@abuddy/host/services` |
  | `application` | renderer `src/main.ts` | `sdk/src/fe/delegates.ts` | the renderer's application actor |

  - Every read is lazy (on first call), so nothing depends on import order.
  - The registry dates from the SDK's extraction from api/renderer (`a96073e04`, 2026-08-30: "lazy-loaded proxy wrappers"). The private host package (`2e29d2f91`, 2026-09-13, `goal-sdk-types-architecture.md` Decision 2) made it permanent.
- **EARS is spread over three packages.**
  - The engine is in `sdk/src/ears` (18 files, about 2,000 lines), with its write side in `internals.ts`, exported only under `@abuddy/source`.
  - The partition policy, sharded router and sinks are in `host/src/persistence`.
  - LMDB (environments, adapter, hydrate, query, about 1,030 lines) is in `api/src/core/persistence`. `api/src/core/ears/attribute-storage.ts` opens the environments and calls `setPersistence` as an import side effect.
  - Persistence reaches back and forth between the three: the api imports host's policy; host reaches the api's LMDB through the registry.
- **The api implements app runtime, not just transport.** Besides `server.ts`, `setup/websocket.ts` and `core/router/{trpc,context,bus-router,index}.ts`, it holds:
  - LMDB persistence;
  - event routing (`core/router/event-emitter.ts`, `bus-emitter.ts`);
  - system errors, and the logger core with its log capture;
  - the migrations runner;
  - the pack lifecycle (`api/src/packs`: loader, lifecycle, reload, seed, packs system, about 1,470 lines), next to host's registry, installer and updater;
  - the backend system composition (`systems.ts`).
- **Data is read by casting another package's repositories.**
  - The SDK declares the flow model (Flow, Node, TNode, Action, Prompt), Settings and Secret (`sdk/src/types/sdk-entities.ts`), but default-setup implements their repositories (`features/flows/be/repository` 724 lines, `settings` 122, `secrets` 101, `prompts` 93, `actions` 103).
  - The SDK calls them through `sdk/src/ears/builtin-repositories.ts`, `repository as unknown as BuiltinRepositories`, from:
    - the flow seeder (`importFromDSL`, `deleteFlow`, `promptQueries.all`)
    - the settings seeder (`resetSettings`)
    - boot seed (`seedHash`)
    - `utils/resolve-cli.ts` (`general.secrets.cliPaths`)
    - `steps/runtime-errors.ts` (`brainCommands.updateTNodeResult`)
  - Host reads them through `host/src/settings`, `repository as unknown as HostSettingsRepositories`. That covers the inference key lookup, and app state in `settings.internal`:
    - `hasOnboarded` (`api/src/systems.ts`, `packs/pack-seed.ts`)
    - `version` and `packVersions` (`setup/migrations/index.ts`)
    - `packSeedHashes` (`setup/backend.ts`, `packs/pack-lifecycle.ts`, `packs/pack-reload.ts`)
    - `seedHash` and `seedStatFingerprint` (`packs/pack-seed.ts`, `sdk/src/seed/boot-seed.ts`)
  - **Consequence:** the app's own state lives inside default-setup's Settings row, and `settingsCommands.resetSettings()` (`settings/be/repository/index.ts:116-119`) writes `data: {}`. Resetting settings therefore also erases the onboarding flag, app version, pack versions and seed hashes.
  - Secret selection is stored as a provider → secret id map in default-setup's `general.secrets`. CLI path overrides sit in the same object (`general.secrets.cliPaths`).
- **One shared instance, listed in eight places.** Packs, dependency runtimes, the app and tests must share one SDK instance. Each of these knows separately which packages must not be duplicated:
  - `abuddy-cli/src/build/be-bundler.ts:35, 99, 146` (backend bundles) and `:193` (the seed runtime bundle);
  - `fe-bundler.ts` (SDK detection);
  - `abuddy-host/src/build/shared-deps.ts` (FE globals);
  - `api/src/packs/pack-loader.ts:61-83` (the SDK bridge map);
  - `abuddy-testing/src/dependency-runtime.ts` (the harness bridge);
  - `scripts/bundle-package.ts:57` (inlined packages).
- **Related plan.** `goal-ears-engine-instance.md` (not implemented) makes the engine an explicit instance (`createEarsEngine`, query/admin faces). This goal supersedes two of its decisions:
  - Decision 3: installation goes through `HostRuntime`, not the registry.
  - Decision 6: the engine lives in `@abuddy/ears`, a new package.

  Its remaining decisions carry over as a follow-up inside `@abuddy/ears` (Deferred).

## Spike results (2026-09-14)

Throwaway worktree `spike/ears-package` (from `2b14f142e`, uncommitted, in the session scratchpad; discard with `git worktree remove`). The EARS engine was moved into a new `packages/abuddy-ears` workspace package, with the SDK rebuilt on top.

**Don't reuse the spike's code; rewrite Phase 1 on the current branch.** Its patch (excluding generated files and API reports) applies without conflict to `fb06e736a`, checked with `git apply --check -3`. But it keeps every engine module re-exported from an SDK file of the same name, which Decision 4 removes, and it has no build or publish configuration. Reusing it would mean undoing half of it.

- **Coupling.** The engine's imports outside `src/ears` were:
  - `types/entities.ts` (16 files)
  - `utils/random-id.ts` (1)
  - `builtin-repositories.ts`, which imports `sdk-entities.ts` and the flow compiler, and stays in the SDK

  In `types/entities.ts`, the `EARS` namespace uses SDK code only for `Entity = SDK_ENTITIES` and `RelKind = { ...SDK_REL_KINDS, Custom }`. The engine itself uses only `EARS.Entity.Relation`.
- **The move.**
  - 18 engine files plus the core `EARS` namespace (with `Entity = { Relation }` and `RelKind = { Custom }`) went to `@abuddy/ears`.
  - The SDK's `EARS` became a namespace of aliases to the engine's types, plus the SDK's entity and relation-kind constants.
  - SDK files re-exported the moved modules.
- **Results:**
  - `typecheck:sdk`, `:host`, `:be`, `:cli` and `:pack` passed.
  - default-setup's unit suite passed 544/544 (2 skipped), including `typed-query-builder`, `branded-entity-id`, `entity-shape-registry` and `sdk-type-safety`.
  - `facade-typing.spec.ts` against workspace source passed 7/7: typechecking and field/entity-name completions under bundler and node16.
- **What it needs to be complete:**
  - The published-package half of `facade-typing.spec.ts` failed with `ERR_MODULE_NOT_FOUND: @abuddy/ears` from the packed SDK. `@abuddy/ears` must be built, packed and installed like `@abuddy/sdk` (Phase 1).
  - The SDK's API reports shrank by about 800 lines: API Extractor doesn't copy declarations re-exported from another package. The engine's surface needs its own reports in `@abuddy/ears` (`api:check`).
  - The renderer typecheck wasn't run: it needs a built API. It's covered by Phase 1's `npm run typecheck`.
- **Not spiked (proved in their phases):**
  - one engine instance when a pack imports `@abuddy/ears` directly;
  - LMDB as `@abuddy/ears/lmdb` in the packaged app;
  - the `HostRuntime` bind in the renderer and harness.

## Decisions

Final.

1. **Layers, imports pointing down only.**
   ```
   @abuddy/ears     engine, EARS types, persistence port, in-memory store      (+ /lmdb: LMDB adapter)
   @abuddy/sdk      pack contract + pack runtime: registries, services contracts, event sends, logging and
                    error reports over the bound event bus, SDK entities and their repositories, HostRuntime port
   @abuddy/host     app runtime: the three services (/services), app state, and the subsystems the app
                    runs (/packs pack lifecycle, /bus, /migrations)
   packages/api     transport (Fastify, WebSocket, tRPC routers, log stream) + process boot + composition
   packages/renderer  FE composition: binds the FE port
   ```
   - The api keeps transport because host has consumers without a server: the CLI (`@abuddy/host/packs`) and the pack test harness (`@abuddy/host/bus`, `/packs`).
   - host must never import Fastify, tRPC or `ws`. The package boundary enforces that, and a guard test checks it.
2. **`@abuddy/ears` is a standalone engine package.**
   - It contains the engine (queries, transactions, relations, repository registry, typed facades `defineEars`), the core `EARS` namespace, `BaseEntity`/`EntityShapes`/`ShapeOf`/`EntityNameArg`, the persistence port (`PersistenceSink`, partition policy, sharded router) and the in-memory store.
   - It knows no packs and no SDK entity names.
   - It publishes like `@abuddy/sdk`: its workspace `package.json`, source under `@abuddy/source`, `dist` otherwise, API reports, publint and attw, the TypeScript 5.7 floor, and the changesets fixed group.
   - Its engine-state entry (today's `ears/internals`) is published with `@internal` tags, rather than hidden behind the source condition.
3. **LMDB is `@abuddy/ears/lmdb`.**
   - It takes the api's `core/persistence` and `core/ears`, host's `persistence` and `ears/lmdb.ts`, and host services' use of `LmdbQuery`.
   - `lmdb` is an optional peer of `@abuddy/ears`, installed by the app. Packs and tests never load it.
   - Opening is explicit: `openLmdbStore({ paths, policy })` returns the store (sinks, hydrate, query, reset, close), and the composition root calls `setPersistence`. There's no import side effect.
   - The partition policy is an argument, built by host from the pack registry.
4. **Packs may import `@abuddy/ears` directly; it's a shared-instance package.**
   - `SHARED_INSTANCE_PACKAGES = ['@abuddy/sdk', '@abuddy/ears']` in `@abuddy/host/build/shared-deps` is the single source for every bundler external list, the api pack loader's bridge, the harness bridge and `bundle-package`.
   - Bridge maps are built from each package's exports, not written out by hand.
   - A guard test fails when any of those consumers names a shared package itself.
   - `@abuddy/sdk/ears` exports only what the SDK adds: `EARS` with the SDK's entities and relation kinds, the SDK entity shapes, and the SDK entity repositories.
   - Generated `#generated/ears` imports `defineEars` and core types from `@abuddy/ears`, and SDK names and shapes from `@abuddy/sdk`.
   - The typed contract's behaviour (types, completions, typo errors) stays exactly as it is.
5. **One typed port replaces the registry, with only what the SDK can't do itself.**
   ```ts
   // @abuddy/sdk/runtime
   export interface HostRuntime {
     transport: { rootEvents: RootEvents };   // the app's event bus; the api supplies it (was trpc, bus-emitter, router-events)
     packs: PackRegistryView;                 // registered pack services, for `services` (was pack-registry)
     appVersion: string;                      // (was version)
     services: {                              // what packs call through `services` and the app implements
       appData: AppDataService;               // (was app-data)
       traceStore: TraceStore;                // (was trace-store)
       inference: InferenceService;           // (was inference)
     };
   }
   export function bindHost(runtime: HostRuntime): void;       // once per process; rebinding throws unless reset for tests
   export function bindFeHost(runtime: { application: AnyActorRef }): void;  // renderer (was application)
   ```
   - An unbound use throws, naming `bindHost`.
   - **Bindings:**
     - the api's composition root binds `createHostRuntime(...)` from `@abuddy/host`;
     - `@abuddy/sdk/testing`'s `startTestRuntime` binds an in-memory `HostRuntime`;
     - the harness supplies `packs` (with `mockService` overlays) when it binds.
   - `runtime/host.ts` and its registry are deleted.
6. **Plumbing moves into the SDK; "service" means only what packs call.**
   - **Event sends, logging and error reports are SDK code over `transport`**, not host implementations. They're a few lines each over the event bus today (`api/src/core/router/event-emitter.ts`, `core/shared/debug/logger.ts`, `core/shared/system-errors.ts`) and move next to the functions the SDK already exports:
     - `sendToPlugin`, `sendToSystem`, `sendToBrainSystem`, `onOutgoing`, `onIncoming` → `@abuddy/sdk/services`;
     - `createLogger` → `@abuddy/sdk/logger`. It formats and emits log events. The api's log capture writes them to the console and streams them to the client, so nothing is logged twice.
     - `reportSystemError` → `@abuddy/sdk/utils`.

     Their registry keys (`event-emitter`, `logger`, `system-errors`) go away with no replacement.
   - **The app version** is `HostRuntime.appVersion`; `getAppVersion()` reads it.
   - **Migrations leave the SDK.** `runMigrations` is removed from `@abuddy/sdk/utils`. The only pack caller is default-setup's reset actor (`settings/be/system.ts`), which today runs the app's reset itself: `appData.reset()`, `createDefaultSettings()`, `seedData(...)`, `runMigrations()`. `services.appData.reset()` does all of it in host (wipe stores, run every pack's boot hooks and boot seed, run app migrations), and the actor only calls `reset()`.
   - **Services** are exactly `HostRuntime.services`: `appData`, `traceStore`, `inference`.

     | What | Where |
     |---|---|
     | Contract (types only) | `@abuddy/sdk/services/<name>.ts` (`app-data`, `trace-store`, `inference`) |
     | Implementation | `@abuddy/host/services/<name>.ts`, same names |
     | Test double | `@abuddy/sdk/testing`: the in-memory `HostRuntime` (`fakeInference` for inference) |

     `@abuddy/host/services/index.ts` exports `createHostRuntime({ store, transport, appVersion, userDataDir })`, the only place the runtime is assembled. The SDK's contract files contain types only, and `@abuddy/sdk/services/index.ts` reads the services from the bound runtime.
   - **Host-only code stays in host and isn't reachable from the SDK:**
     - app state, `@abuddy/host/app-state` (Decision 7);
     - `@abuddy/host/migrations`: app migrations and their runner, moved from `api/src/setup/migrations` with its CLAUDE.md. Host runs them at boot and in `appData.reset()`.
     - `@abuddy/host/packs`: loader, lifecycle, reload, seed, packs system and activation outcome, moved from `api/src/packs`;
     - `@abuddy/host/bus`, plus the backend system composition from `api/src/systems.ts`.
   - **The api keeps** `server.ts`, `setup/websocket.ts`, `setup/config.ts`, `core/router/{trpc,context,bus-router,index}.ts` (tRPC procedures delegating to host), `core/router/bus-emitter.ts` (the `transport` it supplies), log capture to the console and client, and `setup/backend.ts`, which shrinks to composition.
7. **Each entity's repository lives with the package that declares it.**
   - **Flow model** (the SDK's): `@abuddy/sdk` owns the flow, node, edge and TNode repositories and the action and prompt repositories:
     - flows: create, update, delete, the root flow role, `reindexHandles`, `importFromDSL`, `rootFlow`, `flowNodes`, `flowEdges`, `node`, `getNodeActionId`
     - TNodes: `updateTNodeResult`
     - actions and prompts: `all`, `byId`, `byLabel`, and create, update, delete

     default-setup keeps its UI projections (`connectedData`, `extendedData`, action and prompt export) on top of them. `builtin-repositories.ts` is deleted.
   - **Secrets** (the SDK's `Secret`): the SDK owns a secrets repository. Selection moves onto the entity (`selected: boolean`; at most one selected per provider, enforced by the repository), replacing default-setup's `general.secrets` provider map. Host's inference key lookup uses it, and `HostSettingsRepositories` is deleted.
   - **App state:** a new entity `AppState` (one row) holds `hasOnboarded`, `version`, `packVersions`, `packSeedHashes`, `seedHash` and `seedStatFingerprint`. Host declares it (registered with the engine next to the SDK's entities), and `@abuddy/host/app-state` owns its reads and writes. The SDK and packs never read it; `hasOnboarded` reaches the renderer in the `CLIENT_CONNECTED` event, as today. Resetting settings no longer touches it.
   - **Settings** (UI settings: general, plugins): it's default-setup's data. default-setup declares the `Settings` entity and owns the settings seed format and seeder; the SDK stops declaring and seeding it. `packSettingsRegistry` (pack feature defaults) stays in `@abuddy/sdk/framework`.
   - **CLI paths:** `resolve-cli` (resolving and the `cliPaths` override) moves to default-setup's code feature, which owns the CLI integrations. The override moves from `general.secrets.cliPaths` to that feature's plugin settings.
   - **Migrations:** an app migration targeting the next release moves stored data, following `migrations/CLAUDE.md`:
     - `settings.internal` → `AppState`
     - `general.secrets` selections → `Secret.selected`
     - `general.secrets.cliPaths` → the code plugin's settings

     It's idempotent and has a spec on a copy of old-shaped data.
8. **Renames and naming.**
   - Services use the same file names in both packages (Decision 6).
   - Host-only modules are named by concern (`app-state`, `migrations`, `packs`, `bus`).
   - `packages/api` keeps its name.

## Phases

### Phase 1 — `@abuddy/ears` and the shared-instance list
- Create `packages/abuddy-ears` (Decision 2) with the engine, the core `EARS` namespace and the entity typing helpers.
- The SDK's `EARS` aliases the engine's types and adds `SDK_ENTITIES`/`SDK_REL_KINDS` (the spike's shape).
- Delete the SDK's `src/ears` engine files. `@abuddy/sdk/ears` exports only the SDK's additions (Decision 4), and `@abuddy/sdk/ears/internals` is removed; its users import `@abuddy/ears/internals`.
- Regenerate `#generated/ears` from `generate-entries` with the new imports, and update default-setup, the fixture pack and the scaffold.
- Add `SHARED_INSTANCE_PACKAGES` and derive every consumer listed in Background from it, with the guard test.
- Build and publish configuration: `packages:build`, `packages:check`, API reports for `@abuddy/ears`, `published-*` specs cover `@abuddy/ears`, changesets fixed group, `typescript-floor`.
- Follow the TYPED-EARS checklist (type tests, mutation checks, completions, report review).

**Done when:**
- Default-setup's typed-EARS specs and `facade-typing.spec.ts` pass against workspace source and the published packages, with completions unchanged.
- The SDK and `@abuddy/ears` API reports together cover the previous surface; review the diff.
- A fixture-pack unit test and its E2E write through `@abuddy/ears` imported directly and read the row back through `@abuddy/sdk`, in the harness and in the app, proving one instance.
- Mutation: removing `@abuddy/ears` from `SHARED_INSTANCE_PACKAGES` fails that test and the guard.

### Phase 2 — `@abuddy/ears/lmdb`
- Move LMDB and persistence into `@abuddy/ears/lmdb` (Decision 3), and replace `attribute-storage.ts`'s import side effect with `openLmdbStore`, called by the api's composition root.
- Host services (`app-data`, `trace-store`) take the store as an argument.
- Delete `host/src/ears`, `host/src/persistence`, `api/src/core/ears`, `api/src/core/persistence`, and the registry keys `attribute-storage`, `hydrate-sharded` and `lmdb-query`.

**Done when:**
- The persistence and host data specs pass on `@abuddy/ears/lmdb`.
- `npm run build`, E2E and a packaged-build smoke of `electron-builder --dir` boot with data persisted across a restart.
- Nothing under `@abuddy/host` or `packages/api` imports `lmdb`.
- Mutation: skipping `setPersistence` in composition fails a restart-persistence spec.

### Phase 3 — The `HostRuntime` port and SDK plumbing
- Add `HostRuntime`, `bindHost` and `bindFeHost` (Decision 5).
- Move event sends, logging and error reports into the SDK over `transport` (Decision 6), with their specs. `getAppVersion()` reads `appVersion`.
- Convert the remaining SDK readers (`rpc`, `services`, `fe/delegates`) to the bound runtime.
- The api binds `createHostRuntime`, and the renderer binds the FE port.
- `startTestRuntime` binds the in-memory runtime (its test bus as `transport`), and the harness binds with its `packs`.
- Delete `runtime/host.ts` (`registerHostModule`, `getHostModule`, `hostFn`, `hostValue`), `HOST_SERVICE_MODULES`/`registerHostServices`, and `api/src/core/router/event-emitter.ts`, `core/shared/system-errors.ts` and `core/shared/debug/logger.ts`. Run `api:update`.

**Done when:**
- No `registerHostModule`/`getHostModule` exists anywhere, and a guard test fails if one is added.
- `bindHost` twice throws.
- An unbound `services.inference` call throws naming `bindHost`.
- `HostRuntime` compiles only when complete.
- An SDK spec shows `sendToPlugin`, `reportSystemError` and `createLogger` reaching a bound test bus, and the api's log capture logging each log event once.
- All unit suites, E2E, `test:external-pack` and `test:packaged-authoring` pass.
- Mutations fail tests: a `HostRuntime` member left out of the api's binding; the harness binding without `packs`.

### Phase 4 — App runtime out of the api
- Move the migrations runner and app migrations into `@abuddy/host/migrations`, the pack lifecycle (`api/src/packs`) into `@abuddy/host/packs`, and the backend system composition into `@abuddy/host/bus` (Decision 6).
- `appData.reset()` runs the full reset (stores, pack boot hooks and boot seed, migrations). default-setup's reset actor only calls it, and `runMigrations` is removed from `@abuddy/sdk/utils`.
- `createHostRuntime` assembles the runtime. The api's tRPC procedures delegate to host.
- Move each moved module's specs with it.
- `bridge-drift`: the api pack loader builds its bridge from `SHARED_INSTANCE_PACKAGES`.

**Done when:**
- `@abuddy/host/services` holds exactly `app-data`, `trace-store`, `inference` and `index`, and a guard spec compares the directory to `HostRuntime['services']`'s keys.
- `packages/api/src` contains only `server.ts`, `setup/{websocket,config,backend}.ts`, `core/router/{trpc,context,bus-router,bus-emitter,index}.ts`, log capture and `types`, and a guard spec lists the allowed files.
- A guard fails if `@abuddy/host` imports `fastify`, `@trpc/*` or `ws`.
- A spec shows `appData.reset()` leaves an onboarded app with default settings, seeded flows and migrations applied.
- The CLI's pack commands and the harness still run without a server.
- The full check list passes.

### Phase 5 — Data ownership
- SDK repositories for the flow model, actions, prompts and secrets (Decision 7). default-setup's projections move onto them, and `builtin-repositories.ts` is deleted.
- The `AppState` entity and `@abuddy/host/app-state`. Every `settings.internal` read and write moves there, including SDK boot seed's `seedHash`, which moves to host.
- The `Settings` entity, settings seed format and seeder move to default-setup. Follow the TYPED-EARS checklist for `sdk-entities.ts`.
- `resolve-cli` and the CLI path override move to default-setup's code feature.
- App migration for stored data (Decision 7), with an idempotence spec on old-shaped data.

**Done when:**
- `repository as unknown as` appears nowhere in `packages/*/src`, and a guard fails if it's added.
- `packages/default-setup/tests/unit/settings-reset-app-state.spec.ts` is unskipped and rewritten against `AppState`. It's committed skipped today: it fails on the current code (resetting settings erases `hasOnboarded`, `packVersions` and `packSeedHashes`).
- The migration spec moves old-shaped data and a second run changes nothing.
- The app boots onboarded against a copy of pre-migration user data, with an isolated data dir.
- The full check list passes.

### Phase 6 — Docs
- Root `CLAUDE.md`: the SDK packages section, layers, `@abuddy/ears`, `HostRuntime`, data layer and migrations location.
- `packages/abuddy-sdk/TYPED-EARS.md`: where the types live now.
- `packages/default-setup/CLAUDE.md` and `packages/abuddy-testing/CLAUDE.md`.
- `docs/public-facing` (services and data, testing, getting started: `@abuddy/ears` for packs).
- A short amendment note in `goal-ears-engine-instance.md` on its superseded decisions.
- Root `CLAUDE.md` states Decision 6 (the three services, SDK plumbing over the event bus, host-only modules) where the SDK packages section lists host services today.

**Done when:** no doc, template or CLAUDE.md mentions `registerHostModule`, `getHostModule`, `runMigrations`, `@abuddy/sdk/ears/internals`, `api/src/core/persistence`, `BuiltinRepositories` or `settings.internal`.

## Deferred

- The engine as an explicit instance (`goal-ears-engine-instance.md` Decisions 1, 2, 4, 5 and 7), implemented inside `@abuddy/ears` and bound through `HostRuntime`.
- Unbundling the SDK:
  - the build toolchain (compilers, manifest, `generate-entries`) moves to `@abuddy/cli` or an `@abuddy/build` package;
  - the in-memory test host moves to `@abuddy/testing`.
- Renaming `packages/api` to reflect its transport role.
- Removing the typed EARS `NoInferType` workaround now that the floor is TypeScript 5.7 (a TYPED-EARS change).

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and commit with `git commit -- <paths>`. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`. Manual boots use a copy of user data.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit monorepo version/release metadata; `@abuddy/ears` joins the fixed release group at the group's current version.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`). This goal moves them but must not change their behaviour: run its type tests, completions check and mutation checks, and review the API report diffs.
- Migrations follow `migrations/CLAUDE.md` (next release target, idempotent guards, registered in order).
- `@abuddy/sdk`, `@abuddy/ears`, `@abuddy/ui` and `@abuddy/testing` are published: no `any` in pack-facing exports, TypeScript 5.7, `api:update` after export changes.
- The CLI suite requires `npm run packages:build` after SDK or ears source changes. default-setup's runtime (`npm run build -w @app/default-setup`) must be rebuilt before the api suites and E2E.
- Investigate failing tests before changing assertions; mutation-check every new guard, helper and test.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
