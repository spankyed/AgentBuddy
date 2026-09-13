```
# Goal: EARS as an explicit engine instance

Implement docs/issues/goal-ears-engine-instance.md on branch AS/pack-type-facades
(or a branch cut from it). Read it first: Background, Decisions, Phases, Constraints.
Decisions are final. Where a detail isn't specified, pick the conventional option,
note it in the final summary, and keep going.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard or
  test is mutation-checked.
- The pack-facing API reports (`etc/*.api.md`) are unchanged except for the new
  `ears/engine` entry.
- The qx/tx benchmark (Phase 1) stays within the agreed tolerance at every phase.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`,
  `api:check` (sdk, ui), `packages:build` + `packages:check`, and the api, sdk,
  host, cli, default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the smoke E2E, `npm run test:packaged-authoring`
  and the example pack's `abuddy test --app-root <repo>` (8 tests) pass.
- A final summary: phase → done, evidence, benchmark numbers, conventional choices.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines); check `git diff --cached` and stage only each
  commit's files.
- npm publish, create GitHub releases, or trigger workflows.
- pkill/killall Electron or node; launch the app outside the test env without an
  isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit
  version/release metadata.
- loosen a failing assertion or the benchmark tolerance instead of investigating.
```

## Background

EARS is the in-memory entity/attribute/relation store behind `qx`, `tx` and `repository`. It lives in `packages/abuddy-sdk/src/ears/` (about 1,800 lines) as a **module-level singleton**:

- **State is ambient.** `attribute-storage.ts` (attribute store, entity index), `relation-index.ts`, `edge-store.ts`, `query.ts` (prefix cache), `graph.ts`, `blueprint.ts` and `repository.ts` (repository registry) hold module-scope Maps. Whoever shares the module instance shares the data.
- **Host access depends on module identity.** The api hydrates from LMDB, injects persistence and resets memory through write functions (`initEARSRuntime`, `setPersistence`, `putAttr`, `bulkLoadAttr`, `clearMemory`, `edgeStore`, `relationIndex`). They must act on the same Maps packs query, so `@abuddy/host` can't hold its own copy.
  - That's why `@abuddy/sdk/ears/internals` exists, exported only under the `@abuddy/source` condition and re-exported by `@abuddy/host/ears`.
  - It's the one exception to "host-only code lives in `@abuddy/host`". It needs special cases: an attw `--exclude-entrypoints`, a `tsconfig.package.json` exclusion, a bridge drift-spec policy entry and an unreachability test.
  - It also locks `@abuddy/host` to SDK source.
- **Initialization depends on import order.**
  - `packages/api/src/core/ears/attribute-storage.ts` opens the LMDB environments and calls `setPersistence` when the module loads.
  - `packages/api/src/setup/sdk-host-init.ts` relies on that: "persistence already injected by attribute-storage module load".
  - `initEARSRuntime` then sets the entity-type checker. Reordering imports can change behaviour.
- **Tests share global state.**
  - Tests reset with `clearMemory()` (default-setup `_hybrid/*`, `sdk-tiers`, `sdk-type-safety`) or re-run `initEARSRuntime` (SDK `tests/build/helpers/in-memory-ears.ts`, `round-trip.ts`).
  - Test files can't safely run in parallel against the engine.
- **Capability is expressed as module visibility.** Hiding `putAttr` behind an unpublished export doesn't state "packs may query and transact but not hydrate or clear".
- **Other engine users.** The CLI runs the engine in memory when it compiles and decompiles flows (`build/compilers/flow-to-dsl.ts` uses `qx` and `edgeStore`). At runtime, pack code reaches the api's bundled instance through the SDK bridge (`packages/api/src/packs/pack-loader.ts`).

Alternatives considered and rejected:
- **Move engine state into `@abuddy/host`, with the SDK delegating through the host module registry.** The SDK would have no standalone engine, breaking the CLI flow compiler, SDK tests and pack unit tests.
- **Publish the write API** (a separate `@abuddy/ears` package, or `ears/internals` marked `@internal`). Packs could call lifecycle operations that act on the app's live module state.

## Decisions

Final.

1. **The engine is an instance.**
   - `createEarsEngine({ persistence?, isEntityType })` returns an engine that owns all its stores and caches.
   - No EARS module keeps data at module scope.
   - Constructor arguments replace `initEARSRuntime` and `setPersistence`.
   - The default persistence is the no-op sink used today.
2. **Holding the instance is the capability.** The engine has two faces:
   - `engine.query`: `qx`, `tx`, the query helpers, the `repository` registry and the read APIs packs use today.
   - `engine.admin`: bulk load and hydration hooks, clearing, direct attribute and relation writes, `edgeStore`, `relationIndex`, and the entity-type checker.

   `createEarsEngine` is published. Calling it gives a new, empty engine and grants no access to the app's data.
3. **Installation goes through the host module registry.**
   - The creator registers `engine.query` under `'ears'` (`registerHostModule`, already `@internal`).
   - The SDK's free functions (`qx`, `tx`, `repository`, `defineEars`, the `find*` helpers) resolve it once and cache the reference.
   - Pack-facing signatures and the generated facades don't change.
4. **Packs never receive `admin`.** Only the code that created the engine holds it: the api at boot, the CLI compiler, and tests.
5. **No implicit default engine.**
   - Calling `qx`/`tx` with no engine installed throws a clear error naming the fix.
   - A silent in-memory fallback would hide boot-order bugs in the app.
6. **Where the code lives.**
   - The engine stays in `@abuddy/sdk`, exposed as the published entry `@abuddy/sdk/ears/engine` (`createEarsEngine` and the `EarsEngine`, `EarsQuery` and `EarsAdmin` types).
   - `@abuddy/sdk/ears/internals` and its source-only export are deleted.
   - `@abuddy/host/ears` keeps the LMDB delegates and gains hydration wiring written against `EarsAdmin`.
   - No new package.
7. **Pack unit tests get `setupEars(options?)`.**
   - It lives in `@abuddy/sdk/ears/engine`, creates and installs a fresh engine, and returns it.
   - The scaffold's example unit test uses it.
8. **Trust model is unchanged.** Packs run in-process, so a pack could register its own engine, as it could any host module today. The change defines contract and correctness, not a security boundary.
9. **The SDK bridge stays.** It also shares the step, artifact and block registries and the host module registry itself. Removing it isn't part of this goal.

## Phases

### Phase 1 — Safety net
- **Engine contract tests** in `packages/abuddy-sdk/tests/ears/`, black-box against today's public API:
  - `tx` create, update and delete, with the ids and fields returned;
  - relations: link, unlink, `linksTo`, `relatedTo`, `linkSymmetric`, cycle detection;
  - roles: grant, revoke, `withRole`;
  - query builder terminals and ordering;
  - blueprints and `spawn`;
  - repository registration;
  - the exact order and payload of persistence-sink calls for a sequence of writes;
  - hydration through bulk load, followed by queries.
- **Benchmark** (`packages/abuddy-sdk/bench/ears.bench.ts`, Vitest bench): hydrate a realistic graph of 50k entities, 200k attributes and 100k relations, then time:
  - `qx` by type with a `where` and `pickAll`;
  - relation traversal;
  - `tx` batches of 1,000 creates.

  Record the baseline in this doc. The tolerance is +10% median per case; investigate anything beyond it.

**Done when:** contract tests pass on the current singleton and fail under targeted mutations (e.g. a dropped index update, a skipped sink call). The baseline is recorded.

### Phase 2 — Factory underneath, same behaviour
- Convert each engine module into a factory closing over its state, and compose `createEarsEngine` from them.
- Temporarily keep a module-level default instance behind today's exports (including `ears/internals`), so no caller changes.
- Pass cross-module dependencies (persistence, entity-type checker, relation index) through the factory, not module imports.

**Done when:** no EARS module outside the temporary default holds data at module scope (a test greps the modules for top-level `new Map`/`new Set`/`let` state). Contract tests, benchmark, all unit suites and E2E pass unchanged.

### Phase 3 — The host owns the instance
- **api boot:** create the LMDB sinks and policy explicitly, then `createEarsEngine({ persistence, isEntityType })`. Register `engine.query` and keep `engine.admin` for hydration, reset and backup/restore. Remove the import-time `setPersistence` in `core/ears/attribute-storage.ts` and the ordering reliance in `sdk-host-init.ts`.
- **Host code:** `@abuddy/host/ears` exposes hydration and reset helpers taking `EarsAdmin`. Migrate the api (`core/ears`, `core/persistence`, `scripts/db/*`) and default-setup (`database` feature, tests) off the imported write functions onto the admin handle.
- **Runtime hygiene:** the SDK bridge keeps bridging `@abuddy/sdk/ears`; the installed query face is what pack code reaches.

**Done when:** no production code imports `ears/internals` write functions. Reordering the imports in `sdk-host-init.ts` doesn't change boot, shown by a test that boots the host modules in a different order and checks that hydration and queries work. All suites and E2E pass.

### Phase 4 — Tooling and tests go explicit
- The CLI flow compiler and decompiler create and install a private engine per compile.
- SDK tests replace `in-memory-ears.ts` and `round-trip.ts` with `createEarsEngine`/`setupEars`.
- default-setup tests replace `clearMemory()` resets with a fresh engine per test.
- Add `setupEars` to `@abuddy/sdk/ears/engine` and to the scaffold's unit test template. Document it in `docs/public-facing/services-and-data.md`.
- Run the default-setup and SDK suites with file parallelism enabled, and keep it enabled if they pass.

**Done when:** no test calls `clearMemory` or `initEARSRuntime`, and the scaffolded pack's unit test uses `setupEars`. Suites pass, with parallelism enabled where it holds.

### Phase 5 — Remove the default instance and the hook
- Delete the temporary default instance, `src/ears/internals.ts`, the `./ears/internals` export, the attw `--exclude-entrypoints`, the `tsconfig.package.json` exclusion, the drift-spec policy entry and the unreachability assertion for the hook.
- Add a test that `qx`/`tx` throw a clear error when no engine is installed.
- Update the host-only check: the packed SDK still ships no host-only module, and `@abuddy/sdk/ears/engine` resolves with types in node16 and bundler.
- Run `npm run api:update`. Only `ears.engine.api.md` may be added; other pack-facing reports stay unchanged.
- Docs: root `CLAUDE.md` (SDK packages section), `docs/issues/goal-sdk-types-architecture.md` (implementation notes) and the data-layer docs.

**Done when:** `@abuddy/host` builds against SDK exports only, needing no source-only entry. The benchmark is within tolerance. Everything in "Finished when" passes.

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and stage only that commit's files. Never push or tag.
- Never publish externally, create GitHub releases or trigger workflows.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`. Manual API boots: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node --conditions=@abuddy/source dist/server.js`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit monorepo version/release metadata.
- Rebuild `packages/default-setup/dist/dev-entry.cjs` (`node packages/default-setup/dev-build.mjs`) before running the api suites.
- Investigate failing tests and benchmark regressions before changing assertions or tolerances; mutation-check every new guard or test.
- Pack-facing API signatures (`qx`, `tx`, `repository`, `defineEars`, the generated facades) must not change.
- No polling or hacky workarounds.
