# Goal: a pack-facing unit test harness, with dependencies' seeding behaviour

Pack authors unit-test their seeds, repositories and seed hooks against a real in-memory EARS, without the app, and including the behaviour their dependencies own: a pack depending on default-setup seeds Notes in a unit test and gets default-setup's rows (NOTE shortCodes, display order, REFERENCES), the same rows the app would write.

## Background (2026-09-14, at `114d18e1b`)

- **What exists.** Default-setup's unit tests boot a host (`tests/setup.ts` imports the API's `@/setup/sdk-host-init`, then `registerPack`). External packs get `vitest` and one manifest spec from `abuddy init`, and nothing that can open EARS. `@abuddy/testing` ships the Playwright fixture and `@abuddy/testing/vitest` (`isolatedDataDir`).
- **The EARS engine runs without the host.** Its persistence defaults to a no-op sink. It needs an entity-type checker (`initEARSRuntime({ isEntityType })`; the default says nothing is an entity type, so `qx('Note')` reads as an id) and a `logger` host module, since `createLogger` resolves one on first use (library repository commands create one).
- **Registries a seed test needs are in the SDK:** repositories (`registerRepository`, `repository`), seed hooks (`seedHookRegistry`), seeders (`registerSeeder`, `seedData`).
- **Pack code no longer imports `@abuddy/host`** (`114d18e1b`): repositories and seed hooks use only `@abuddy/sdk` and Node built-ins, which makes them loadable outside the app.
- **Dependencies ship `build/`** (types, `steps.build.mjs`, `seed-compilers.mjs`), published by the app for built-ins and cached in `.abuddy/deps/<id>/`. Their full backend runtime (`runtime/index.cjs`) keeps every npm package external and needs the app's module resolution, so tests can't load it.
- **One SDK instance.** `@abuddy/testing`'s published bundle inlines `@abuddy/sdk`. A harness must instead use the pack's installed `@abuddy/sdk`, or its registrations are invisible to the pack's code. `@abuddy/sdk/ears/internals` (`initEARSRuntime`, `clearMemory`) is exported only under the `@abuddy/source` condition.

## Decisions

1. **Seed facet.** `abuddy generate-entries` writes `src/__generated__/seed-runtime.ts`, exporting `seedRuntime`: the pack's id, its declared entity types and relation kinds, every repository from `features[].repositories`, and its `seedHooks`. Generated from the manifest, so it can't drift from the registration. `abuddy build` bundles it into `dist/build/seed-runtime.mjs` with only `@abuddy/sdk` external (everything else bundled; `@abuddy/host` rejected as for other bundles). Built-in packs build it into `dist/build/` too, so the app publishes it and dependents' caches keep it with the rest of `build/`.
2. **SDK test runtime: `@abuddy/sdk/testing`.** A published entry (no `@abuddy/source` gating), for test tooling:
   - `startTestRuntime({ entityTypes })`: sets the entity-type checker, registers a console `logger` host module when none is registered, keeps no-op persistence.
   - `registerSeedRuntime(seedRuntime)`: adds its entity types, registers its repositories and seed hooks.
   - `resetTestData()`: clears the in-memory database.
   - The `SeedRuntime` type the generated facet is typed with.
   It exposes no `any` and supports TypeScript 5.3, like the rest of the SDK.
3. **Harness: `@abuddy/testing/harness`.** Runs in the pack's vitest process and imports `@abuddy/sdk` externally (the published bundle keeps it external for this entry):
   - `setupPackTests({ seedRuntime, packDir? })`: starts the runtime with the SDK's, the pack's and its dependencies' entity types (dependency types from `.abuddy/deps/<id>/snapshot.json`), registers each dependency's `build/seed-runtime.mjs` and then the pack's own `seedRuntime`, and clears the database before each test.
   - `seedPack({ keys?, mode? })`: compiles the pack's seed entries (its own formats and dependencies', through `compilePack` with the cached dependency manifests and build dirs; TypeScript compiler modules load with tsx) into a temp dir and seeds them. Only format entries are seeded unless `keys` names others (flows and settings need the app).
   - A missing dependency facet is an error naming the fix (`abuddy build` fetches dependencies).
4. **Scope.** EARS data, repositories, seed hooks and seeding. Systems, services other than the logger, flows and the FE stay E2E concerns (`abuddy test`).
5. **Scaffolding.** `abuddy init` adds `@abuddy/testing` (its Playwright peer optional), `vitest.config.ts` with `isolatedDataDir` and a `tests/setup.ts` calling `setupPackTests`, and an example spec seeding the scaffold's `examples` entry and reading the rows back.
6. **Default-setup's own tests keep their host setup.** They exercise systems and services, beyond the harness's scope.

## Phases

1. **SDK test runtime** (`@abuddy/sdk/testing`), with unit tests and `api:update`.
2. **Seed facet**: generator output, `abuddy build` bundle for external and built-in packs, publishing and caching through `build/`. Default-setup's facet builds; a test loads `dist/build/seed-runtime.mjs` into a bare SDK test runtime and seeds a Note through its hooks (NOTE shortCode, REFERENCES).
3. **Harness** (`@abuddy/testing/harness`) and its bundle entry keeping `@abuddy/sdk` external.
4. **Proofs**:
   - the external fixture pack's unit tests seed its memos (own markdown format and compiler module) through the harness;
   - `test:packaged-authoring`'s scaffolded pack, depending on default-setup, runs a unit test seeding `default-setup:notes` and asserting NOTE shortCodes, against the facet the configured app published.
5. **Scaffolding and docs**: `abuddy init`, `docs/public-facing` (testing), `@abuddy/testing` CLAUDE.md.

**Done when:** a pack's unit test seeds its own and its dependency's formats through the harness with the dependency's real hooks, from the packed tarballs; every new guard and test is mutation-checked; typecheck, `api:check`, the unit suites, `test:external-pack`, `test:packaged-authoring` and the example pack pass.

## Deferred

- Unit-testing systems, services and flows with the harness.
- Moving default-setup's tests onto the harness.
