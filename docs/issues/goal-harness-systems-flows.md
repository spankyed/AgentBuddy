```
# Goal: unit-test systems, services and flows with the pack harness

Implement docs/issues/goal-harness-systems-flows.md on branch AS/external-test-harness
(or a branch cut from it): Background, Decisions, Phases, Constraints. Read it first.
It builds on goal-pack-test-harness.md (the data-tier harness) and takes up its
Deferred list. Decisions are final: implement them, don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final
summary, and keep going. No backward compatibility: change signatures, migrate every
in-repo test, fixture and template in the same change, and fix forward.

Finished when:
- Phases 0–6 are implemented and each meets its "Done when"; every new guard, helper
  or test is mutation-checked.
- A pack's unit tests, from the packed tarballs, send its systems events and assert
  what they emit and write, call its services with others mocked, and run a flow
  through its dependency's brain and steps with a fake model.
  `test:packaged-authoring` proves it against default-setup.
- default-setup's unit suite runs on the harness: in memory, with no `@abuddy/host`
  import, no API `@/` path and no `@/setup/sdk-host-init`.
- The app's behaviour is unchanged: bus routing, pack loading and the pack
  client-ready handshake pass their existing tests, and the full E2E suite passes.
- `npm run typecheck`, `schema:check`, `api:check` (sdk), `packages:build` +
  `packages:check`, and the api, sdk, host, cli, default-setup and renderer unit
  suites pass.
- `npm run test:external-pack`, the monorepo E2E suite, `npm run test:packaged-authoring`
  and the example pack's `abuddy test --app-root <repo>` pass.
- You give a final summary: phase → done/deferred, evidence, the spike results, and
  the conventional choices you made.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines). Commit with `git commit -- <paths>` and check
  `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- pkill/killall Electron or node; launch the app outside the test env without an
  isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit
  version/release metadata.
- change the typed EARS types (packages/abuddy-sdk/TYPED-EARS.md) to make a call
  site compile.
- call a real model provider or the real `claude`/`codex` CLIs from a unit test.
- loosen a failing assertion instead of investigating.
```

## Background

The pack harness (`@abuddy/testing/harness`, on `@abuddy/sdk/testing`) unit-tests a pack's data code: seeds, repositories and seed hooks against an in-memory EARS, including dependencies' seeding behaviour. Systems, services and flows are tested only in E2E, and default-setup's own unit tests run on the API's host init.

- **The harness covers data code only.**
  - `setupPackTests` starts the in-memory EARS and registers dependencies' `build/seed-runtime.mjs` and the pack's own seed runtime (entity types, repositories, seed hooks). It clears the database before each test (`abuddy-testing/src/harness.ts:67-91`).
  - `@abuddy/sdk/testing` registers only a console `logger` host module (`abuddy-sdk/src/testing/index.ts:52-58`).
  - The seed runtime facet has no systems, services, steps, designations or settings. Those exist only in `#generated/pack-entry`'s `registration`.
- **A system needs an actor registered as `bus`.**
  - `emit()` is pure: it returns an `OUTGOING` event (`sdk/src/helpers/actor-helpers.ts:66-71`), which the system sends to `system.get(bus)` itself.
  - The app's bus (`api/src/systems.ts`) spawns every registered system under its id (`:135-140`). It routes `INCOMING` to `system.get(id)` and `OUTGOING` to `rootEvents` only once connected (`:184-218`).
  - The same machine also runs pack activation and reload, and reads the settings repository on connect (`:112-128`).
  - The only bus test is `api/tests/unit/bus-client-connected.spec.ts`.
- **SDK paths that need host modules the harness doesn't register:**

  | Host module | What needs it | Where |
  |---|---|---|
  | `event-emitter` | `sendToPlugin`, `sendToSystem`, `sendToBrainSystem` | `sdk/src/services/index.ts:17-59` |
  | `bus-emitter` (via `initRpc()`) | `rootEvents`, used by the browser, code and logs systems and by `reportStepRuntimeError` | `sdk/src/steps/runtime-errors.ts:31` |
  | `pack-registry` | the `services` proxy | `sdk/src/services/index.ts:99-121` |
  | `system-errors`, `version`, `migrations` | `@abuddy/sdk/utils` | |
  | `app-data`, `trace-store` | host services | |

  - `getDesignated` throws for an unregistered designation. Only `registerPack` registers them (`abuddy-host/src/packs/pack-registration.ts:134-139`).
- **Flows need default-setup's brain and settings systems in one actor system.**
  - `startBrain` sends to `settings` (`default-setup/src/features/brain/be/system.ts:108-165`). Flow tracks send `TNODE_SPAWNED` to `brain` (`flow-system.ts:264` onward).
  - Steps run through `stepRegistry` handlers with the `services` proxy (`extensions/steps/action/runtime.ts:20-92`).
  - The `llm` step calls `@abuddy/sdk/inference` `generateText` (`llm/runtime.ts:72-81`). The model client imports `ai` directly (`extensions/services/model-client/index.ts:16`).
  - Schedules start a real `croner` job (`services/scheduler.ts`).
  - Steps without a runtime handler complete after a fixed `setTimeout(100)` (`node-handlers/index.ts:15-30`). query, transform, create and update have no runtime.
- **No test runs a system, the brain or a flow.** Tests fake services per file (`codex-handle-revert.spec.ts:3-66`, `handle-fork-stress.spec.ts:43-84`) and the switch step with a fake actor (`brain-switch-node.spec.ts:20-28`). There is no fake model, and no helper that captures emitted events.
- **default-setup's 51 test files run on the API's host init.**
  - `tests/setup.ts` imports `@/setup/sdk-host-init`, which opens real LMDB stores and registers 14 host modules (`api/src/setup/sdk-host-init.ts:20-39`), then registers `pack-entry`'s registration.
  - `vitest.config.ts` resolves `@/` into both default-setup and the API.
  - Groups: 5 FE, 8 services, 7 seed actions, 7 flows/brain/steps, 6 repositories/host data, 6 seeds, 8 type-level, 4 build/CLI.
  - The build/CLI files test CLI and host code: `pack-cli`, `pack-generate`, `pack-protocol`, `monaco-defs-config`.
  - `host-data-services` tests the host's LMDB-backed `appData` and `traceStore`.
  - The seed-parity harness uses `@abuddy/host/ears` (`clearMemory`, `getAllEntities`, `qx`, `dropAttr`).
- **A dependency's full backend runtime is published.**
  - `dist/runtime/index.cjs` is published by the app for built-ins and cached in `.abuddy/deps/<id>/`.
  - It's CommonJS, with `@abuddy/sdk/*` and `SHARED_DEPS` external and everything else inlined. default-setup's inlines `ai`, `@ai-sdk/*` and croner.
  - The app loads it with `withHostResolution` and `SDK_BRIDGE` (`api/src/packs/pack-loader.ts:60-89, 234-276`), which point its `require('@abuddy/sdk/…')` at the host's module instances.
  - A plain `require` in a vitest process would load a second SDK instance: split registries and a split EARS store.
- **Packaging.**
  - The harness bundle keeps `@abuddy/sdk`, `vitest` and `tsx` external and inlines `@abuddy/host` (`scripts/bundle-package.ts:35-45, 83-109`). Host code in the harness therefore runs on the pack's SDK.
  - `@abuddy/sdk/testing` is public API: no `any`, TypeScript 5.3, no host imports.
  - `harness-requires-source.ts` must list every harness export (`abuddy-cli/tests/build/testing-source-entry.spec.ts`).
  - The seed runtime load check blocks `ai` and `@ai-sdk/*` (`abuddy-cli/src/build/seed-runtime-check.ts`). Systems and services can't join the seed facet.

## Decisions

Final.

1. **Two tiers, one harness.**
   - `setupPackTests({ seedRuntime })` stays the data tier.
   - `setupPackTests({ seedRuntime, registration })` adds the runtime tier: the pack's own `#generated/pack-entry` registration (systems, services, steps, designations, feature settings) and each dependency's full runtime.
   - Seed-only tests stay fast and never load `ai`.
2. **Dependencies' runtimes load through the app's bridge.**
   - `SDK_BRIDGE` and `withHostResolution` move from `api/src/packs/pack-loader.ts` into `@abuddy/host/packs`, taking the SDK module namespaces to bridge as an argument.
   - The API passes its own. The harness, which inlines host code, passes the pack's `@abuddy/sdk` namespaces.
   - An SDK subpath whose optional peer isn't installed is bridged lazily and fails only when used, naming the missing peer.
   - A dependency's registration is applied with host `registerPack`, as in the app. Its `boot` hooks and `seedManifest` don't run, and `setCompiledDir` points at the dependency's cached seeds.
3. **One bus implementation.**
   - The bus's routing core moves into `@abuddy/host` as `createBusMachine({ onOutgoing })`. The core covers: spawn the registered systems, route `INCOMING` to `system.get(id)` and `OUTGOING` to the sink, the connected state with `CLIENT_CONNECTED`, and the pack client-ready handshake.
   - `api/src/systems.ts` composes pack activation, reload and the settings-backed connect event on top.
   - The harness runs the same core with a recording sink.
4. **A test host in `@abuddy/sdk/testing`.** `startTestRuntime` registers in-memory host modules for everything a system, service or step reaches:
   - `event-emitter` and `bus-emitter` (with `initRpc`), both wired to the test bus;
   - `system-errors`, recorded, and a test fails on one it didn't expect;
   - `version` and `migrations`, as no-ops;
   - `app-data`: reset is `resetTestData`; backup export and import throw, naming them unsupported in tests;
   - `trace-store`, in memory.

   `pack-registry` comes from the harness (host `@abuddy/host/packs`). Nothing exported uses `any`, and it compiles on TypeScript 5.3.
5. **Harness API for systems** (`@abuddy/testing/harness`):
   - `const app = await startApp({ systems })` spawns the named registered systems under the test bus; `'*'` spawns all. A bare feature id maps to the pack's bus id (`<packId>.<featureId>`), as `#generated/bus-ids` does.
   - `app.connect()` sends `CLIENT_CONNECTED`. `app.send(systemId, event)` routes like `trpc.bus.send`.
   - `app.emitted(pluginId?)` lists the recorded outgoing events. `await app.nextEmit(pluginId, type)` waits for one.
   - `await app.settle()` drains queued actor work and zero-delay raises.
   - The harness stops the app after each test.
6. **Services.**
   - `services` resolves to the real registered services. Host services (`logger`, `emitter`, `repository`, `appData`, `traceStore`) come from the test host.
   - `mockService(name, impl)` replaces one service for the current test and restores it after. It's typed from the pack's `Services`, and an implementation may give only the methods the test uses.
7. **A model seam, not a mocked `ai`.**
   - `@abuddy/sdk/inference` resolves models through a `model-provider` host module. The app's default builds the AI SDK providers it builds today.
   - default-setup's model client moves onto `@abuddy/sdk/inference` and stops importing `ai`.
   - `@abuddy/sdk/testing` exports `fakeModel(respond)`: scripted text, streams and tool calls, with every prompt recorded.
8. **Flows.**
   - `await app.runFlow(label, { event?, data? })` needs `brain` and `settings`, from the pack or a dependency.
     - It starts the brain if it isn't running and sends `TRIGGER_BRAIN_EVENT` to the flow.
     - It resolves once the triggered track's step TNodes have all completed or failed, and returns them with their outputs.
   - `app.flowTrace(label)` reads those TNodes afterwards.
   - Schedule triggers go through the scheduler service, so `mockService('scheduler', …)` or vitest fake timers drive them.
   - Steps without a runtime handler complete on the next microtask instead of after `setTimeout(100)`. The brain E2E must pass unchanged with it.
9. **default-setup's tests move onto the harness.**
   - `tests/setup.ts` calls `setupPackTests({ seedRuntime, registration })`. `vitest.config.ts` and `tsconfig.test.json` drop the API paths.
   - Tests of host or CLI code move to their package:
     - `host-data-services` → `abuddy-host/tests`;
     - `pack-cli`, `pack-generate`, `pack-protocol`, `monaco-defs-config` → the package whose code they test.
   - The seed-parity harness uses SDK test helpers: `resetTestData`, `untypedQx`, and new `@abuddy/sdk/testing` `entityIds()` and `dropAttribute()`.
   - Hand-built service fakes become `mockService`. `brain-switch-node` and the flow routing tests (`codex-flow-routing`, `mode-name-routing`) run their flows with `runFlow`.
   - `check:specifiers` rejects `@abuddy/host` and API `@/` imports in default-setup's tests, as it does in pack sources.
10. **Scope.**
    - In: backend systems, services, flows and steps, including dependencies'.
    - Out:
      - FE plugins, which vitest already covers;
      - the real CLIs, which stay behind `mockService`, with the gated `_hybrid` integration tests unchanged;
      - persistence (LMDB), which stays in API and host tests.

## Phases

### Phase 0 — Spikes (throwaway branch or worktree)

Record the results in a "Spike results" section of this doc before Phase 1.

**A. Dependency runtime in vitest.** In default-setup's vitest process, load `dist/runtime/index.cjs` through a bridge built from the SDK namespaces vitest imported. Record:
1. Whether there's one SDK instance. A repository the runtime registers must be visible through test code's `repository`, and a row it writes must be visible to `qx`.
2. Whether there's one xstate. An actor from the runtime's machine must be spawnable under a test-code parent.
3. What happens with an optional peer that isn't installed. Test code must import `@abuddy/sdk/inference` and the runtime must load; the failure must come only on use.

**B. Bus core.** Spawn the fixture pack's `memos` system under a copy of the bus routing core with a recording sink. Record whether `CLIENT_CONNECTED` produces `MEMOS_CONNECTED`, and whether `ADD_MEMO` writes the row and records `MEMO_ADDED`.

If A.1 or A.2 fails, stop and record why in this doc. If B needs more than the routing core, record what and extend Decision 3's core by that.

**Done when:** the spike results are recorded and both spikes pass.

### Phase 1 — Host pieces

- Extract `createBusMachine` into `@abuddy/host`, with `api/src/systems.ts` composing on top. Behaviour stays unchanged.
- Move `SDK_BRIDGE` and `withHostResolution` into `@abuddy/host/packs`, with `api/src/packs/pack-loader.ts` passing its SDK namespaces.
- Add the test host modules to `@abuddy/sdk/testing` (Decision 4), plus `entityIds()` and `dropAttribute()`. Run `api:update`.

**Done when:** `bus-client-connected.spec.ts`, the pack-loader and `sdk-bridge-drift` specs and the E2E suite pass unchanged. A `@abuddy/sdk/testing` spec shows `sendToPlugin`, `rootEvents` and `reportSystemError` working after `startTestRuntime`.

### Phase 2 — Systems

- `setupPackTests({ registration })`: registers the pack's registration and loads each dependency's cached runtime through the bridge (Decision 2). A missing runtime is an error naming the fix (`abuddy build`).
- `startApp` with `connect`, `send`, `emitted`, `nextEmit`, `settle`, and a stop after each test.
- Add each new export to `harness-requires-source.ts`.
- The fixture pack gains `tests/unit/memos-system.spec.ts`:
  - connect → `MEMOS_CONNECTED` with the seeded memos;
  - `ADD_MEMO` → a Memo row and `MEMO_ADDED`.

**Done when:** the fixture's system spec passes in `test:external-pack`. A dependency-runtime spec shows a pack depending on default-setup spawning default-setup's `settings` system and reading its connect event. Both are mutation-checked (a dropped bridge entry, a lost `OUTGOING` route).

### Phase 3 — Services and the model seam

- `mockService` (Decision 6).
- `model-provider` host module and the `@abuddy/sdk/inference` resolution through it. The app registers the current providers.
- default-setup's model client moves onto `@abuddy/sdk/inference`.
- `fakeModel` in `@abuddy/sdk/testing`.
- Proofs:
  - `codex-handle-revert` and `handle-fork-stress` run their actions through `services` with `mockService`, replacing their hand-built fakes;
  - an `llm` step test asserts the prompt `fakeModel` received and the output it returned.

**Done when:** those tests pass and are mutation-checked. No unit test imports `ai` or sets an API key. The app still reaches its providers (the E2E suite and a manual chat check against a copy of user data).

### Phase 4 — Flows

- `runFlow` and `flowTrace` (Decision 8).
- The microtask completion for steps without a runtime handler.
- The scheduler seam.
- Proofs:
  - the fixture pack adds a flow (an event trigger, then an action step that writes a memo) and unit-tests it with `runFlow`, on default-setup's brain and steps loaded as its dependency's runtime;
  - `brain-switch-node`, `codex-flow-routing` and `mode-name-routing` run their flows instead of calling a handler with a fake actor or inspecting DSL.

**Done when:** those tests pass and are mutation-checked (a switch branch taken wrongly, a trigger dropped). The brain E2E and the full E2E suite pass with the microtask completion.

### Phase 5 — Move default-setup's tests

- New `tests/setup.ts`, `vitest.config.ts` and `tsconfig.test.json` (Decision 9).
- Relocate the host and CLI tests.
- Move the seed-parity harness onto the SDK test helpers.
- Replace every remaining hand-built service fake with `mockService`.
- Extend `check:specifiers` to default-setup's tests.

**Done when:**
- default-setup's suite passes with no `@abuddy/host` import, no API path and no LMDB directory created.
- The relocated tests pass in their packages.
- The `check:specifiers` guard fails on an added `@abuddy/host/ears` import (mutation).

### Phase 6 — Scaffolding and docs

- `abuddy init`'s `tests/setup.ts` passes `registration`. `abuddy add feature` scaffolds a system spec on `startApp`.
- `test:packaged-authoring` adds a system test and a flow test against default-setup from the packed tarballs.
- Docs:
  - the `docs/public-facing` testing page: tiers, `startApp`, `mockService`, `fakeModel`, `runFlow`;
  - `@abuddy/testing` CLAUDE.md;
  - default-setup CLAUDE.md;
  - `goal-pack-test-harness.md`'s Deferred list.

**Done when:** a freshly scaffolded pack's system spec passes, `test:packaged-authoring` passes with the new tests, and the docs describe no host init for pack tests.

## Deferred

- FE plugin tests on the harness (plugin state machines with the recorded bus as their backend).
- Running the real `claude`/`codex` CLIs in harness tests.
- A persistence-backed tier (LMDB in a temp dir) for packs that test restarts.

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and commit with `git commit -- <paths>`. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit monorepo version/release metadata.
- Pack code and pack tests import only `@abuddy/sdk`, `@abuddy/ui` and `@abuddy/testing`; `@abuddy/host` stays host-only. The typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- `@abuddy/sdk/testing` and the harness are published: no `any` (`published-sdk-any.spec.ts`), TypeScript 5.3 (`packages/typescript-floor`), `api:update` after export changes.
- The CLI suite requires `npm run packages:build` after SDK source changes. default-setup's runtime (`node packages/default-setup/dev-build.mjs`) must be rebuilt before the API suites and E2E.
- Investigate failing tests before changing assertions; mutation-check every new guard, helper and test.
- No backward compatibility: no shims or fallbacks for the old test setup; migrate every in-repo test and fix forward. No polling or hacky workarounds: `settle`, `nextEmit` and `runFlow` wait on actor and brain events, not on timers.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
