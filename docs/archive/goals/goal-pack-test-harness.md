# Goal: a pack-facing unit test harness, with dependencies' applying behaviour

> **Superseded in part.** The SDK's TypeScript floor is now 5.7 (`goal-inference-ai-sdk-7.md`, Decision 1), not the 5.3 below.

Pack authors unit-test their content, repositories and content hooks against a real in-memory EARS, without the app, and including the behaviour their dependencies own: a pack depending on default-setup content Notes in a unit test and gets default-setup's rows (NOTE shortCodes, display order, REFERENCES), the same rows the app would write.

## Background (2026-09-14, at `114d18e1b`)

- **What exists.** Default-setup's unit tests boot a host (`tests/setup.ts` imports the API's `@/setup/sdk-host-init`, then `registerPack`). External packs get `vitest` and one manifest spec from `apack init`, and nothing that can open EARS. `@apack/testing` ships the Playwright fixture and `@apack/testing/vitest` (`isolatedDataDir`).
- **The EARS engine runs without the host.** Its persistence defaults to a no-op sink. It needs an entity-type checker (`initEARSRuntime({ isEntityType })`; the default says nothing is an entity type, so `qx('Note')` reads as an id) and a `logger` host module, since `createLogger` resolves one on first use (library repository commands create one).
- **Registries a content test needs are in the SDK:** repositories (`registerRepository`, `repository`), content hooks (`_contentWriterRegistry`), appliers (`registerApplier`, `contentData`).
- **Pack code no longer imports `@apack/host`** (`114d18e1b`): repositories and content hooks use only `@apack/sdk` and Node built-ins, which makes them loadable outside the app.
- **Dependencies ship `build/`** (types, `steps.build.mjs`, `content-compilers.mjs`), published by the app for built-ins and cached in `.apack/deps/<id>/`. Their full backend runtime (`runtime/index.cjs`) keeps every npm package external and needs the app's module resolution, so tests can't load it.
- **One SDK instance.** `@apack/testing`'s published bundle inlines `@apack/sdk`. A harness must instead use the pack's installed `@apack/sdk`, or its registrations are invisible to the pack's code. `@apack/sdk/ears/internals` (`initEARSRuntime`, `clearMemory`) is exported only under the `@apack/source` condition.

## Decisions

1. **Content facet.** `apack generate-entries` writes `src/__generated__/content-runtime.ts`, exporting `contentRuntime`: the pack's id, its declared entity types and relation kinds, every repository from `features[].repositories`, and its `contentWriters`. Generated from the manifest, so it can't drift from the registration. `apack build` bundles it into `dist/build/content-runtime.mjs` with only `@apack/sdk` external (everything else bundled; `@apack/host` rejected as for other bundles). Built-in packs build it into `dist/build/` too, so the app publishes it and dependents' caches keep it with the rest of `build/`.
2. **SDK test runtime: `@apack/sdk/testing`.** A published entry (no `@apack/source` gating), for test tooling:
   - `startTestRuntime({ entityTypes })`: sets the entity-type checker, registers a console `logger` host module when none is registered, keeps no-op persistence.
   - `registerContentRuntime(contentRuntime)`: adds its entity types, registers its repositories and content hooks.
   - `resetTestData()`: clears the in-memory database.
   - The `ContentRuntime` type the generated facet is typed with.
   It exposes no `any` and supports TypeScript 5.3, like the rest of the SDK.
3. **Harness: `@apack/testing/harness`.** Runs in the pack's vitest process and imports `@apack/sdk` externally (the published bundle keeps it external for this entry):
   - `setupPackTests({ contentRuntime, packDir? })`: starts the runtime with the SDK's, the pack's and its dependencies' entity types (dependency types from `.apack/deps/<id>/snapshot.json`), registers each dependency's `build/content-runtime.mjs` and then the pack's own `contentRuntime`, and clears the database before each test.
   - `applyPack({ keys?, mode? })`: compiles the pack's content entries (its own formats and dependencies', through `compilePack` with the cached dependency manifests and build dirs; TypeScript compiler modules load with tsx) into a temp dir and content them. Only format entries are written unless `keys` names others (flows and settings need the app).
   - A missing dependency facet is an error naming the fix (`apack build` fetches dependencies).
4. **Scope.** EARS data, repositories, content hooks and applying. Systems, services other than the logger, flows and the FE stay E2E concerns (`apack test`).
5. **Scaffolding.** `apack init` adds `@apack/testing` (its Playwright peer optional), `vitest.config.ts` with `isolatedDataDir` and a `tests/setup.ts` calling `setupPackTests`, and an example spec applying the scaffold's `examples` entry and reading the rows back.
6. **Default-setup's own tests keep their host setup.** They exercise systems and services, beyond the harness's scope.

## Phases

1. **SDK test runtime** (`@apack/sdk/testing`), with unit tests and `api:update`.
2. **Content facet**: generator output, `apack build` bundle for external and built-in packs, publishing and caching through `build/`. Default-setup's facet builds; a test loads `dist/build/content-runtime.mjs` into a bare SDK test runtime and content a Note through its hooks (NOTE shortCode, REFERENCES).
3. **Harness** (`@apack/testing/harness`) and its bundle entry keeping `@apack/sdk` external.
4. **Proofs**:
   - the external fixture pack's unit tests content its memos (own markdown format and compiler module) through the harness;
   - `test:packaged-authoring`'s scaffolded pack, depending on default-setup, runs a unit test applying `default-setup:notes` and asserting NOTE shortCodes, against the facet the configured app published.
5. **Scaffolding and docs**: `apack init`, `docs/public-facing` (testing), `@apack/testing` CLAUDE.md.

**Done when:** a pack's unit test content its own and its dependency's formats through the harness with the dependency's real hooks, from the packed tarballs; every new guard and test is mutation-checked; typecheck, `api:check`, the unit suites, `test:external-pack`, `test:packaged-authoring` and the example pack pass.

## Deferred

- Unit-testing systems, services and flows with the harness, and moving default-setup's tests onto it: done in `goal-harness-systems-flows.md`.
