# @abuddy/sdk

The pack-facing API, types and build tooling for AgentBuddy packs, used by built-in and external packs alike. It also holds the pack build pipeline that `@abuddy/cli` drives (`src/build/`), the seed engine the host runs (`src/seed/`), and the module-level registries the host fills when it loads a pack. The host-only side lives in `@abuddy/host`.

The root `CLAUDE.md` covers the subpath split (`/ears`, `/fe`, `/utils` vs `/utils/pure`), the `@abuddy/source` condition, `.ts` relative specifiers, and API reports. This file goes one level deeper. The typed EARS contract is in `TYPED-EARS.md`; read it before touching `src/types/entities.ts`, `src/ears/runtime.ts`, `src/ears/typed.ts`, `src/types/sdk-entities.ts` or `generateEars` in `src/build/generate-entries.ts`. Pack-facing guides: `docs/public-facing/manifest.md`, `seeds.md`, `services-and-data.md`, `testing.md`, `cli.md`.

## `src/` map

Each directory is one `package.json` export (`./<dir>` → `src/<dir>/index.ts`) unless noted.

- `actions/`: pure helpers seed actions may inline (`formatProviderError`, `buildTranscript`). It's the only bare import `compileSourceDir` allows in action and prompt sources.
- `artifacts/`, `blocks/`, `steps/`: definition types and their registries (see Registries). `steps/` also has `runtime-errors.ts` and `utils.ts`.
- `build/`: manifest schema, codegen, seed compilers and the flow DSL compiler (see Build pipeline).
- `designations/`: the role → feature id registry (`getDesignated`, `hasDesignation`).
- `ears/`: the EARS engine (`query.ts`, `transaction.ts`, `attribute-storage.ts`, `edge-store.ts`, `relation-index.ts`), typed helpers (`typed.ts`), and the repository registry (`repository.ts`). `internals.ts` is the host's hook into the engine. It is exported only under `@abuddy/source` and left out of `dist/` (`tsconfig.package.json`) and the API reports (`tsconfig.api-extractor.json`).
- `env/`: `resolveAppContext()`, the single resolver for environment and data paths.
- `fe/`: plugin contracts and the frontend state packs share with the host (`actor-system.ts`, `menu-state.ts`, `tiptap-plugins.ts`, `dsl-types.ts`, `pack-fe-registration.ts`). `./fe/contributions` maps to `fe/contribution-types.ts`.
- `framework/`: `defineSystem`, `toPackSystemDefs`, the `PackRegistration` contract (`pack-registration.ts`) and feature settings (`pack-settings.ts`).
- `helpers/`: `safeEvents`, `emit`, `Simplify`.
- `ids/`: the `bus` system id.
- `logger/`, `rpc/`: delegates that call host modules. `rpc` also defines `IncomingSystemEvents`/`OutgoingSystemEvents`.
- `runtime/`: `host.ts` is the host module table (`registerHostModule`, `getHostModule`, `hostFn`, `hostValue`) that every SDK delegate reads. `templates.ts` runs prompt function bodies (`executeTemplate`).
- `seed/`: the seed engine (see Seed engine).
- `services/`: the `services` proxy and `HostServices` (`index.ts`), plus the contracts for `appData`, `traceStore`, `inference` and `secrets`. `host-services.ts` resolves each of these from the host module of the same name. `./models` maps to `services/models.ts`.
- `testing/`: the in-memory runtime behind `@abuddy/testing/harness` (see Testing entry).
- `types/`: `EARS`, `BaseEntity`, and the entities the SDK owns (`sdk-entities.ts`: `SDK_ENTITIES`, `SDK_REL_KINDS`, `SDK_SHAPED_ENTITIES`).
- `utils/`: `index.ts` (Node), `pure.ts` (environment-agnostic), and the seeder registry and `seedData` (`seed.ts`). `./cron` and `./utils/compare-versions` are single-file exports. `internals.ts` (secret redaction's host side) is exported only under `@abuddy/source`.

## Build pipeline (`src/build/`, `@abuddy/sdk/build`)

`abuddy build` (`packages/abuddy-cli/src/commands/build.ts`) runs these pieces in order: `parseManifest`, then codegen (`generatePackFiles`), then `buildPackConfigFromManifest` and `compilePack`. It writes the snapshot and bundles itself; the FE bundler is `abuddy-cli/src/build/fe-bundler.ts`, not an SDK module.

- **Manifest schema** (`manifest-schema.ts`): the Zod `ManifestSchema` is the single source for `abuddy.json`.
  - `manifest.ts` derives `PackManifest` and the other types with `z.infer`. It also defines `PackSnapshot` (with `dependencyCommands`, the commands declared across the pack's dependency tree), `PackFlowHelpers`, `dependencyCommands()`, `seedFile`/`seedPath` and `SEED_COMPILERS_FILE`.
  - The cross-field rules live in `superRefine`:
    - Only built-in packs may have a `settings` seed or an `earlySystem`.
    - A `boot.seed` format must name a `seedFormats` entry or `<dependency>:<name>`.
    - `seedHooks` may name only the pack's own `entities`.
    - `entities`/`relKinds` may not redeclare names the SDK owns.
  - `SPECIALTY_SEED_KEYS` (`actions`, `prompts`, `flows`, `settings`) take a path. Every other seed key takes `{ path, format }` or `{ seeder }`.
  - `abuddy.schema.json` is generated from the schema by `scripts/generate-schema.ts` (`zod-to-json-schema`). Run `generate:schema` after changing the schema; CI runs `schema:check`.
- **Validation** (`validate.ts`): `parseManifest`/`validateManifest` run the schema. `validateFeatures` checks that each feature's `settings`, `system.entry` and `plugin.entry` files exist and that `designation === id`.
- **Codegen** (`generate-entries.ts`): `generatePackFiles(manifest, { packRoot, depTypes?, depSnapshots? })` returns `{ path: content }` for `src/__generated__/`. The CLI's `generate-entries` command writes the files; empty contents are dropped.
  - Pack entries and ids: `pack-entry.ts` (the `PackRegistration`; systems whose feature has designation `settings` come first), `pack-entry-fe.ts`, `system-ids.ts`, and `bus-ids.ts` (import-free so FE code can use it; ids are `<packId>.<featureId>` unless `builtIn`).
  - Typed facades: `ears.ts`, `events.ts` (`sendsTo` targets are checked against own features, dependency plugins and `HOST_PLUGIN_IDS`), `services.ts`, `repository.ts` and `repositories.ts`.
  - `pack-types.ts`: the facade dependents import, which `abuddy build` bundles into `dist/types/pack-types.d.ts`.
  - Seeding: `seeders.ts` (one `registerSeeders(<packId>, [...])` call with a seeder per seeded key, plus `setCompiledDir`/`getCompiledDir`) and `seed-runtime.ts`.
  - Flows and steps: `flow-helpers.ts` (a helper per step `dsl`, trigger track builders read from the step's `trackField`, and dependencies' helpers) and `step-types.ts`.
  - Other: `types.ts`, `contributions.ts` and `dsl-register-fe.ts`.
  - Per typed dependency, it also writes `deps/<id>.d.ts` and `deps/<id>.flow-helpers.{js,d.ts}` from the dependency's snapshot. `depTypesVersion` reads the version header that the CLI's stale-deps warning uses.
  - `mergeRegistries` merges own, dependency and SDK entities/relKinds, and throws when two packs declare the same name. `emitEARS` writes the `EARS` namespace. `emitDepTypes` is used by the CLI's `generate` command.
- **`module-exports.ts`**: `createModuleExports(packRoot, files)` builds one TypeScript program over every file a manifest `"path#export"` names: services, repositories, `packServices`, `seedHooks`, `entityShapes` sources and feature settings. The program uses the pack's `tsconfig.json`, `sourceConditions(packRoot)` and `types: []`. `exportOf(file, name)` follows alias chains and returns `{ value?: 'object' | 'function' | 'class', type }`.
  - Codegen uses it to reject a missing export, a type-only export, or a service exported as a function or class (export the object or an instance).
  - It checks entity shapes (the export must be a type) and requires feature settings to have a default export.
  - The program is created lazily, on the first `exportOf`. It needs the optional `typescript` peer and throws with an install hint when it is missing.
- **`source-conditions.ts`**: `sourceConditions(dir)` returns `['@abuddy/source']` when the pack's `@abuddy/sdk` resolves outside `node_modules` (a linked checkout), and `[]` otherwise. `bundleFile` and `createModuleExports` both use it.
- **Pack config** (`manifest-bridge.ts`): `buildPackConfigFromManifest` resolves `boot.seed` (`resolveSeeds`). Its `setup()` fills the registries that compiling validates against:
  - It registers dependency step modules (`build/steps.build.mjs`) first, then the pack's `steps.build` (or `steps.register`), `artifacts` and `blocks`.
  - A pack step type that a dependency also defines throws.
  - `resolveFeatureSettingsFromManifest` lists existing `features[].settings` files.
- **Seed compiler** (`seed-compiler.ts`): `compilePack` first clears earlier output (`clearCompiledSeeds`), then compiles each `boot.seed` entry.
  - Specialty keys use `SPECIALTY_COMPILERS` (`compilers/standard.ts`).
  - A format entry uses `compileBuiltinFormat` (`markdown-tree` or `json`, in `seeds/records.ts`) or its compiler module's export, loaded with `options.importModule`. The CLI passes a tsx loader.
  - `seeder` entries are skipped because the pack's seeder reads its own sources.
  - Compile errors (`collectErrors`, `checkRecordEntities`) are collected and thrown together, before the cross-seed `validate` step (flows against compiled action and prompt labels and `stepRegistry.all()`).
  - Output: `<key>.seed.json` per key, `media/<key>/` per key, and `seeds.json` (`SeedIndex`: `packId`, and per key `seeded`, `identity`, `count`, preview `items`).
  - `seeds/resolve.ts` resolves format refs. A dependency's compiler is `<buildDir>/seed-compilers.mjs#<name>`.
  - `seeds/markdown-tree.ts` walks markdown (YAML frontmatter; `media/` is skipped). Records get a default `sourceHash` (`withSourceHashes`).
- **Action/prompt compilation** (`compile-utils.ts`): `compileSourceDir` scans for `.ts` files with `export const meta` and bundles each with esbuild (`bundleFile`, platform `neutral`).
  - Bare package imports are an error; `@abuddy/sdk/actions` is the only one allowed, and it is inlined.
  - Node globals (`require`, `process`, `Buffer`, …) in the bundle are warnings, found by walking the AST.
  - It extracts `meta` and the `action`/`template` function body, prepends inlined helpers, strips a `services` parameter from helpers that are only called directly, and hashes the result.
- **Flow DSL** (`compilers/`):
  - Loading: `loadFlowsFromDir` imports each `.ts` default export, skipping `_*.ts` and `*.example.ts`; duplicate names or more than one `root` throw.
  - Checking: `flow-dsl-validator.ts` (`validateFlowDSL`).
  - Compiling: `flow-compiler.ts` (`compileFlowDSL` turns DSL into entity and relation rows), `flow-to-dsl.ts` (`exportFlowsToDSL`, the reverse), and `hashFlows` (`sourceHash` of `tracks` + `root`).
  - Track builders: `flow-helpers.ts` exports `entry`/`on`, which generated flow helpers re-export.

## Seed engine (`src/seed/`, `@abuddy/sdk/seed`)

The user-facing rules (change tracking, import modes, seed hooks) are in `docs/public-facing/seeds.md`. The code:

- **Registry and driver** (`utils/seed.ts`): seeders are kept per pack. `registerSeeders(packId, seeders)` replaces that pack's set (a reloaded runtime registers again), and the API's `teardownPack` calls `unregisterSeeders` (not `unregisterPack`: a reload loads the fresh module before unregistering the old one). `seedData({ compiledDir, include, mode, verbose })` reads the pack id from the directory's `seeds.json` (`seedingPackId`, which throws when it names none) and runs only that pack's seeders; a key with an empty include set is skipped. `ImportMode` is `keep-existing` | `replace-on-collision` | `wipe-and-replace`. The generated `seeders.ts` registers the pack's seeders when the pack entry imports it. `seedCollection` is an older generic helper that nothing in `src/` uses.
- **`createSeeder(options)`** (`seeder.ts`) is the generic record seeder, used for `actions`/`prompts` (identity `label`) and every format entry.
  - Rows carry `sourceHash`, `seededFields` (the field names plus a hash of their stored values) and `seedKey`. `seedKey` is `<packId>:<key>/…`, built by `childSeedKey` per tree level, with `packId` read from `seeds.json` (`seedingPackId`, which throws if it is missing).
  - `find` tries `seedKey` first, then the `find` hook or `identity` (with `parent` matched through `relKind`). An identity match that carries a `seedKey` is ignored.
  - Outcomes:
    - `keep-existing` skips the row and its subtree.
    - An existing row with no `sourceHash` is skipped as user-owned.
    - A row whose hash matches is skipped.
    - A row whose seeded fields changed is skipped as edited.
    - Otherwise the row is updated, and `clearedFields` resets fields the record no longer sets.
  - Creation is transactional by hand. `createTracked` removes the row if media copy or stamping throws. `updateTracked` restores the previous `sourceHash`/`seededFields` if the update throws.
  - Per-record errors land in `counts.errors` instead of throwing.
  - `wipe-and-replace` removes all rows of the entry's entity types, deepest first.
  - With `media`, `media/<file>` links are copied to the row's media dir and rewritten to `media://<id>/<file>`.
  - `markSeededRowUnedited` exists for migrations of rows seeded before `seededFields` existed.
- **`createFlowSeeder()`** (`flow-seeder.ts`) validates each DSL entry and applies the same skip rules, using `seededGraph` in place of `seededFields`.
  - `seededGraph` hashes the flow row's fields, its nodes' fields and the relations between them, independent of order.
  - It refuses an entry whose compiled ids collide with another pack's or a user's flow (`collidingOwner`).
  - It deletes a replaced flow, imports through `builtinRepository.flowsCommands.importFromDSL`, then stamps `seedKey` and `seededGraph`.
  - Subflow names resolve to this pack's seeded flows by seed key, and to other flows by label.
  - `wipe-and-replace` deletes every flow.
- **`createSettingsSeeder()`**: under a mode other than `keep-existing`, it calls `builtinRepository.settingsCommands.resetSettings()`.
- **Seed hooks** (`hooks.ts`): `SeedHooks` (`find`/`create`/`update`/`remove`) are keyed by entity type. `seedHookRegistry.register` throws when a different pack already owns the type.
- **`previewPackSeeds(dir)`** (`preview.ts`) reads `seeds.json` for the import dialog and lists only seeded keys.

## Registries

The registries are module-level singletons, so a process must load exactly one SDK instance. The API's pack loader and the test harness map every `@abuddy/sdk` subpath to one copy through `withModuleBridge` in `@abuddy/host/packs`. The host fills them in `abuddy-host/src/packs/pack-registration.ts` (backend) and `abuddy-host/src/fe/pack-store.ts` (frontend).

- `stepRegistry` (`steps/registry.ts`): `register` merges into an existing type facet by facet (`build`, `runtime`, `fe`, `trigger`, `kind`), so the build, runtime and FE definitions of one step combine. Also `patchRuntime`/`patchFE`, `setComponents`/`initComponents`, `isTrigger`/`triggers`, `createNodeDefaults` and `clear`.
- `artifactRegistry` (`artifacts/registry.ts`) and `blockRegistry` (`blocks/registry.ts`): keyed by `type`, last registration wins.
- `seedHookRegistry` (`seed/hooks.ts`): per entity type, owned by one pack; `unregisterAll(packId)`.
- Seeders (`utils/seed.ts`): keyed by seed key; `seedData` iterates them.
- `packSettingsRegistry` (`framework/pack-settings.ts`): validates each feature's settings (`checkFeatureSettings`: a feature may set only `plugins.<id>` and `plugins._meta.visibility.<id>`) and merges them into `getPackSettingsDefaults()`, bumping `revision` and notifying `onPackSettingsDefaultsChanged` listeners.
- Designations (`designations/index.ts`): role → id of the system or plugin that plays it. Packs read them with `getDesignated` (throws for an unknown role) and `hasDesignation`; `registerDesignations`/`unregisterDesignations` are host-only, exported only from `@abuddy/sdk/designations`.
- Repositories (`ears/repository.ts`): `registerRepository(name, value)`. The `repository` proxy throws for an unregistered name.
- Host modules (`runtime/host.ts`): `registerHostModule(key, mod)`. The `services` proxy (`services/index.ts`) resolves on every property read: host services plus `pack-registry`'s `getRegisteredServices()`.
- FE: `tiptapPluginRegistry` (`fe/tiptap-plugins.ts`, `unregisterAll(packId)`) and `registerDslType`/`getDslTypes` (`fe/dsl-types.ts`).

## Testing entry (`src/testing/`, `@abuddy/sdk/testing`)

This is the in-memory runtime that `@abuddy/testing/harness` drives (see `packages/abuddy-testing/CLAUDE.md`). It lives in the SDK so tests share the pack's registries.

- `startTestRuntime({ entityTypes })` initializes EARS with the SDK's entity types plus the given ones; calling it again adds types. It then calls `registerTestHostModules` (`host.ts`), which registers in-memory host modules (logger, `testRootEvents`, system errors, `appData`, trace store, `secrets`, and an `inference` that fails until mocked), each only if the host hasn't registered its own.
- `SeedRuntime` and `registerSeedRuntime(runtime)`: registers a pack's entity types, repositories and seed hooks. The generated `seed-runtime.ts` exports it; `abuddy build` bundles it to `dist/build/seed-runtime.mjs`.
- `resetTestData`, `entityIds`, `dropAttribute`, `takeSystemErrors`, `addTestSecret`, and `fakeInference` (`fake-inference.ts`).

## Scripts

Run these from `packages/abuddy-sdk`, or from the repo root with `-w @abuddy/sdk`.

- `npm test`: vitest over `tests/**/*.spec.ts` (`build/`, `seed/`, `ears/`, `env/`, `framework/`, `services/`, `testing/`, `utils/`), with `@abuddy/source` set in `vitest.config.ts`. The root `test:unit` doesn't run it; CI does.
- `npm run typecheck`: `tsc --noEmit`. `npm run build` is the same `tsconfig.json`, which sets `noEmit`, so it emits nothing.
- `npm run build:package`: `scripts/build-package.ts`. It compiles `dist/` with `tsconfig.package.json`, copies hand-written `.d.ts` files, and checks that every bare import in `dist` is declared and every export target was built. The root `packages:build` runs it; `npm run attw` (with the two internals excluded) runs in the root `packages:check`.
- `npm run api:check` / `api:update`: `api:build` emits declarations to `.temp/api-types`, then `scripts/api-reports.ts` compares or rewrites `etc/<entry>.api.md`, one per export with `types`.
- `npm run generate:schema` / `schema:check`: regenerate or verify `abuddy.schema.json`.

## Gotchas

- `src/build/` and `src/seed/` must not know any pack's entity types (library, notes, FAQs). `tests/build/no-pack-seed-specifics.spec.ts` rejects those names; an exception needs a reason in its `ALLOWED` table.
- Changing codegen output affects every pack. Tests covering it: `tests/build/generate-entries.spec.ts`, plus `abuddy-cli/tests/build/` (`dep-types-version`, `trigger-track-helpers`) and `default-setup/tests/unit/seed-parity/`. Regenerate default-setup with `npm run compile`.
- `esbuild` and `typescript` are optional peers. `compile-utils.ts` imports both at module load, and `module-exports.ts` loads `typescript` lazily. Pack runtime code must not import `@abuddy/sdk/build`.
- Seeded rows are found by `seedKey`, which starts with the pack id from `seeds.json`. Compiled seeds without `packId` fail to seed until the pack is rebuilt.
- `compilePack` wipes its output directory's seed files and `media/` before compiling, even if compiling then fails.
- The `services`, `repository` and host-module lookups throw when nothing is registered, so an SDK delegate called outside the app needs `startTestRuntime` or a host.
