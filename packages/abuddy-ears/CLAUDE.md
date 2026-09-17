# @abuddy/ears

EARS, the entity-attribute-relation graph store behind AgentBuddy's data: the engine, the core `EARS` types, the typed facades, the persistence port, and the LMDB store (`@abuddy/ears/lmdb`). It's the bottom layer: it imports no `@abuddy/*` package and knows no packs and no SDK entity names (those are the SDK's, in `@abuddy/sdk/types`). The SDK, host, api, packs and tests import it. The root `CLAUDE.md` ("SDK packages", "Data layer") has the one-paragraph view; this file covers how the package works.

## Package basics

- Published like `@abuddy/sdk`: its workspace `package.json` is the manifest, and each export resolves `src/` under the `@abuddy/source` condition and `dist/` otherwise. Exports: `.` (the engine, types and persistence port) and `./lmdb` (the LMDB store). It's in the changesets fixed group (`.changeset/config.json`) and supports TypeScript 5.7 and later (`packages/typescript-floor`).
- `lmdb` is an optional peer dependency (a dev dependency here). Only `src/lmdb/` loads it; the app installs it (`packages/api` depends on it).
- Relative imports name the `.ts` source; `tsc` (`rewriteRelativeImportExtensions`) writes `.js`. `sideEffects: false`, and no module does anything on import.
- It's a shared-instance package (`SHARED_INSTANCE_PACKAGES` in `@abuddy/host/build/shared-deps`): packs, dependency runtimes, the app and tests load one copy, so the installed engine is the same everywhere. The pack loader's bridge and the harness bridge provide every export except `./lmdb` (`APP_ONLY_EXPORTS`). Pack frontends don't share it: they inline the constants and helpers they import.

## Module map (`src/`)

| File | What it holds |
|---|---|
| `index.ts` | The root entry: `createEarsEngine`, `installEngine`/`installedEngine`, the free functions, the persistence port, `EARS`, the typed facades |
| `engine.ts` | `createEarsEngine({ persistence?, isEntityType })` and the faces' types (`EarsEngine`, `EarsQuery`, `EarsAdmin`). It composes the factories below |
| `installed.ts` | The installed engine: `installEngine(query)` (returns the one it replaced; `undefined` uninstalls), `installedEngine()` (throws `NO_ENGINE_INSTALLED`, naming `bindHost`, `startTestRuntime` and `installEngine`) |
| `attribute-storage.ts` | `createAttributeStorage`: attributes, the entity index, roles, and every write's call to the persistence sink. The free functions exported from here (`getAll`, `grantRole`, `destroyEntity`, …) read the installed engine |
| `relation-index.ts`, `edge-store.ts`, `relations.ts` | The relation index by kind, relation writes over it (`createEdgeStore`), and relation reads (`findRelations`, `getRelationStats`) |
| `query.ts` | `createQx`: the query builder (`qx`, exported untyped as `untypedQx`), `b64Encode`/`b64Decode` |
| `transaction.ts`, `transaction-helpers.ts` | `createTx`: the transaction builder (`tx`); `createEntityWithDefaults`, `updateEntity`, `createRelation` |
| `query-helpers.ts`, `entity-utils.ts` | The finders (`findById`, `findWhere`, …), counters and label helpers |
| `graph.ts`, `blueprint.ts` | Graph walks (`descendants`, `topoSort`, `wouldCreateCycle`, `linkSymmetric`, …) and blueprints (`bp`, `spawn`) |
| `repository.ts`, `repository-errors.ts` | The repository registry (`repository`, `registerRepository`), `RepositoryError`/`RepositoryErrorCode` |
| `entities.ts`, `runtime.ts`, `typed.ts` | The typed contract (change-controlled, see below): the core `EARS` namespace (`Entity = { Relation }`, `RelKind = { Custom }`), `BaseEntity`/`EntityShapes`/`ShapeOf`/`EntityNameArg`; `PersistenceSink`, `noopSink`, `EARSRuntimeDeps`, `QueryBuilder`/`TransactionBuilder`, `isEntityType`; `defineEars` and the `Typed*` facade types |
| `persistence/policy.ts`, `persistence/sharded-router.ts` | The persistence port: `Partition`, `PartitionPolicy`, `makePolicy`; `makeShardedPersistence`, the sink routing each write to its partition's sink |
| `lmdb/` | `@abuddy/ears/lmdb`: `store.ts` (`openLmdbStore`), `envs.ts` (environments), `adapter.ts` (`makeLmdbAdapter`, the LMDB sink), `hydrate.ts` (`hydrateSharded`), `query.ts` (`LmdbQuery`, direct reads without hydrating) |
| `utils.ts` | Private helpers (`isPlainObject`, the id suffix) |

## The engine

- **An instance.** `createEarsEngine({ persistence, isEntityType })` returns a new, empty engine that owns its stores, indexes, caches and repository registry. Each module is a factory closing over its state (`createAttributeStorage`, `createRelationIndex`, `createQx`, `createTx`, …), and `engine.ts` passes each its dependencies (the sink, the relation index, the entity-type checker). No module keeps data at module scope; the one module-level variable is the installed engine, a reference. `persistence` defaults to `noopSink`. `isEntityType` tells an entity type from an id (`tx('Note')` creates a Note).
- **Two faces; holding the engine is the capability.**
  - `engine.query` (`EarsQuery`): `qx`, `tx`, the finders, attribute and role reads, relation reads, graph walks, `spawn`, and the repository registry. Packs reach it only through the installed engine.
  - `engine.admin` (`EarsAdmin`): `clear`, `bulkLoadAttr`, direct attribute and relation writes (`putAttr`, `addRelation`, …), the relation index and its writes, `edgeStore`, `queryEntitiesByRole`, the entity-type checker and `repositories()`. Only the creator holds it: the api's composition root (hydration through `/lmdb`, and `createHostRuntime`'s `appData` reset, backup and restore), the CLI's flow compiler and decompiler (a private engine per compile), and `@abuddy/sdk/testing`.
- **Installation.** The free functions (`untypedQx`, `tx`, `find*` through the facades, `repository`, `registerRepository`, `spawn`, `findRelations`, `isEntityType`, …) act on `installedEngine()`. `bindHost` (`@abuddy/sdk/runtime`) installs the app's `HostRuntime.ears`; `startTestRuntime` (`@abuddy/sdk/testing`) creates and installs a test engine and `resetTestData()` installs a fresh one, carrying the registered repositories over; tooling installs its own (`installEngine(createEarsEngine({ isEntityType }).query)`) or passes one (`exportFlowsToDSL(dir, { engine })`) and puts the previous one back. With none installed, a use throws `NO_ENGINE_INSTALLED`. There's no default engine.
- **Repositories.** The registry is the engine's (`query.repository`, `query.registerRepository`). A pack's repositories arrive in its registration (`PackRegistration.repositories`), and the host registry's `registerPack` registers them with the installed engine; pack code reads them through `#generated/repository` or `services.repository`, the same object. Reading an unregistered name throws.
- **Typed facades.** `defineEars<Shapes, Names>()` returns `qx`, `tx`, `find*`, `createEntityWithDefaults`, `updateEntity` and `getAttr` typed against a shape map, each acting on the installed engine. Packs don't call it: `abuddy generate-entries` writes `#generated/ears` with it, over the pack's shapes, its dependencies' and the SDK's.
- The trust model: packs run in-process. The faces define the contract, not a security boundary.

## Persistence

- `PersistenceSink` is the port: the engine calls it on every create, destroy, attribute write and relation write (`onCreateEntity`, with the type when `tx(type)` created it; `onPutAttrArray`, an attribute's whole value list after each write; `onDropAttr`, `onAddRelation`, …). Every method is required: a sink that stores nothing implements it as a no-op (`noopSink`). Bulk loads (`admin.bulkLoadAttr`, `admin.addToIndex`) don't.
- `makePolicy({ excludedEntityTypes })` says which partition an entity or relation lives in (`primary`, or `volatileBackup` for excluded types and relations touching them). `makeShardedPersistence` routes each call to its partition's sink. The host builds the policy from the registered packs (its registry's `partitionPolicy`, which follows registration).
- `openLmdbStore({ paths, policy, engine })` (`@abuddy/ears/lmdb`) opens both partitions' environments and returns the store: `sink` (the sharded LMDB sink, which the engine is created with), `envs`, `isOpen()`, `hydrate(options?)` (loads the hydrated partitions into `engine()`, the admin face), `query(partition)` (`LmdbQuery`), `close()`, `reopen()` and `reset()` (deletes the files and opens them empty; the engine's memory is the caller's to clear). `engine` is a function because the engine is created after the store, with its sink. Nothing opens on import.
- The api's composition (`openAppStore()`, `packages/api/src/setup/backend.ts`) is the one production caller: it opens the store, creates the engine with `store.sink` and binds the app. Host code (`@abuddy/host/services`, `/backup`) takes the store and the admin face as arguments.

## Typed contract

`entities.ts`, `runtime.ts` and `typed.ts` are part of the typed EARS contract with the SDK's `types/entities.ts` and `types/sdk-entities.ts` and the generated `PackShapes`/`EntityName`. Editor completions and error messages depend on their exact form. Read `packages/abuddy-sdk/TYPED-EARS.md` and follow its checklist before changing them. The SDK's `EARS` namespace aliases this package's types and adds the SDK's entities and relation kinds.

## Guards

- `check:specifiers` (`scripts/check-import-specifiers.ts`): `findUpwardImports` (this package imports no `@abuddy/*`, in sources, tests, scripts and its `package.json`), `findLmdbImports` (only `src/lmdb/` imports `lmdb`; host, api, packs and pack tests never import `lmdb`, and packs never import `@abuddy/ears/lmdb`), `findSharedPackageLists` (the shared-instance list's consumers derive from `SHARED_INSTANCE_PACKAGES`), and the pack-source rule rejecting `registerRepository` from `@abuddy/ears`.
- `tests/no-module-state.spec.ts`: no module-level `new Map`/`Set`/`WeakMap`/`WeakSet`/`Array`, `[]`, `{}` or `let` in `src/`, except the installed engine.
- `tests/no-engine-state-access.spec.ts`: no code or test in the repo names the removed module-state entry points or imports an admin write from `@abuddy/ears`.
- The typed-EARS specs live in default-setup (`typed-query-builder`, `branded-entity-id`, `entity-shape-registry`, `sdk-type-safety`) and in the CLI (`facade-typing.spec.ts`, against workspace source and the published packages); `published-exports.spec.ts` and `published-sdk-types.spec.ts` cover the packed package.

## Tests (`tests/`)

- `contract/`: black-box specs of the public API, written before the engine became an instance (changed since only where a pinned result was a bug: `getSchemaStats` counts each kind's relations): `transactions` (`tx` create, update, delete, the ids and fields returned), `relations` (link, unlink, `linksTo`, `relatedTo`, `linkSymmetric`, cycle detection, roles), `queries` (query builder terminals and ordering, blueprints and `spawn`, repository registration) and `persistence` (the exact order and payload of sink calls, hydration through bulk load). They reach the engine only through `engine-under-test.ts` (`freshEngine`); `helpers.ts` has `recordingSink()`. A few specs pin existing quirks; they say so.
- `installed-engine.spec.ts`: the free functions throw with no engine installed; two engines in one process share nothing.
- `is-entity-type.spec.ts`: `isEntityType` follows the installed engine's checker.
- `lmdb/`: `persistence` (the LMDB adapter, the sharded router, `LmdbQuery`) and `store` (`openLmdbStore`: writes reach LMDB through `store.sink`, and a store opened again hydrates them).
- Test files run in parallel (`fileParallelism: true`): each creates its own engines.

## Benchmark

`bench/ears.bench.ts` hydrates an app-sized graph (50k entities, 200k attributes, 100k relations) into an engine's admin face, then times `qx` by type with a `where` and `pickAll`, a relation traversal, and `tx` batches of 1,000 creates. Run it with `npm run bench -w @abuddy/ears`. The baseline is recorded in `docs/goals/goal-package-boundaries.md` (Phase 6); the tolerance is +10% median per case, and anything beyond it needs investigating before an engine change lands.

## Scripts

- `npm run typecheck -w @abuddy/ears` (`npm run typecheck:ears` at the root): `tsc --noEmit` over `src`, `tests`, `bench` and `scripts`.
- `npm test -w @abuddy/ears` (part of `npm run test:unit`), `npm run bench -w @abuddy/ears`.
- `npm run build:package -w @abuddy/ears` (`scripts/build-package.ts`, part of `npm run packages:build`): `dist/` from `tsconfig.package.json`, checking every export target was built. `npm run packages:check` runs publint and attw on it.
- `npm run api:check` / `npm run api:update` (from `packages/abuddy-ears`): the API reports `etc/index.api.md` and `etc/lmdb.api.md`. Review their diff with any export change; pack-facing exports have no `any`.
