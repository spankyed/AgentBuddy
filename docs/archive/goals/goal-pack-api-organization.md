> **Done** (merged in #187). The text below is the plan as written; [`goal-package-boundaries.md`](../../goals/goal-package-boundaries.md) followed it and replaced several of its interim pieces (the host module registry, `runMigrations` in the SDK). For the current layout, see the root `CLAUDE.md`.

```
# Goal: organize the pack-facing API — one typed way to send, log and run actions

Implement docs/goals/goal-pack-api-organization.md on a branch cut from the current integration
branch (c187956e5 or later): Background, Spike results, Decisions, Phases, Constraints. Read it
first. It runs before docs/goals/goal-package-boundaries.md. Decisions are final: implement them,
don't reopen them or stop to ask. Where a detail isn't specified, pick the conventional option,
note it in the final summary, and keep going. No backward compatibility: change signatures,
migrate every in-repo caller, test, fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- Pack code has one typed way per direction: `broadcastToPlugin`/`emit` (backend → frontend) and
  `sendToSystem` (frontend → backend, backend → backend), from `#generated/events`. No pack source
  uses `rootEvents`, `trpc.bus.send.mutate`, `@abuddy/sdk/rpc` or `console.*` in backend code, and
  a guard rejects them.
- Logging is `createLogger` and errors are `reportError`, both in `@abuddy/sdk/logger`.
- Action code runs in one sandbox (`params`, `services`, `z`, `flowId`) with a logger named after
  the action, whether a flow step or the actions page runs it.
- `@abuddy/sdk/templates`, `@abuddy/sdk/events` and `@abuddy/sdk/env` hold what their names say;
  `@abuddy/sdk/rpc` is gone and `@abuddy/sdk/utils` holds only utilities.
- `npm run typecheck`, `schema:check`, `api:check` (sdk), `packages:build` + `packages:check`, and
  the api, sdk, host, cli, default-setup and renderer unit suites pass.
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
- change the typed EARS types (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- change when events reach the client (connection gating): that's goal-package-boundaries.md Phase 3.
- loosen a failing assertion instead of investigating.
```

## Background

Packs reach the app's messaging, logging and action running through several overlapping paths. Counts are pack source in default-setup and the fixture pack; "action uses" are occurrences in default-setup's seed actions, which get only `params`, `services`, `z` and `flowId`.

- **Five ways to send an event.**
  - **Backend → frontend:**
    - `system.get(bus).send(emit(pluginId, event))` inside a system (8 files). It goes through the bus actor, which drops `OUTGOING` until a client connects (`abuddy-host/src/bus/index.ts`, `connected` state).
    - `broadcastToPlugin` from `#generated/events` (3 files) writes straight to `rootEvents` through the api's `core/router/event-emitter.ts`, ignoring the connection.
    - `services.emitter.broadcastToPlugin` (53 action uses) does the same, untyped.
    - `rootEvents.emitOutgoing(emit(pluginId, …).event)` (118 calls in the code and browser systems, `@abuddy/sdk/rpc`) does the same, bypassing the typed facade.
  - **Frontend → backend:** `trpc.bus.send.mutate({ systemId, type, … })` (191 calls) from `@abuddy/sdk/rpc`, untyped, plus 7 hand-copied `const sendToBackend = …` helpers in code frontend files. Every system declares its incoming events (`defineSystem(id)<Incoming, Outgoing>()`), but nothing types these sends.
  - `sendToSystem`, `sendToBrainSystem`, `onIncoming` and `onOutgoing` live in `@abuddy/sdk/services`. `emit` lives in `@abuddy/sdk/helpers`, and `defineEvents`/`HostPluginEvents` in `@abuddy/sdk/services`.
- **`rootEvents` and `trpc` are pack-facing plumbing.**
  - Backend: 11 files use `rootEvents` directly (`emitOutgoing` ×122, `onConnected` ×2, `onIncoming` ×2, the logs system's `onLog` ×1).
  - Frontend: `trpc` comes from `@abuddy/sdk/rpc`. In the renderer a Vite alias (`packages/renderer/vite.config.ts:116`) swaps that module for the renderer's own client; pack frontends get it as the `sdkRpc` global.
- **Four ways to log, two ways to report errors.**
  - Logging: `createLogger` (26 files), `createInspectLogger` (4 files; a namespace-toggled `inspect`), `services.logger` (27 files, 34 action uses; one shared logger with no action name) and raw `console.*` in 15 backend files, which the api's log capture picks up.
  - Errors: `reportSystemError` (`@abuddy/sdk/utils`) and `reportStepRuntimeError` (`@abuddy/sdk/steps/runtime-errors.ts`) each build a log event and an outgoing event themselves.
- **Two action sandboxes.** The action step runs action code with `(params, services, z, flowId)` (`extensions/steps/action/runtime.ts`). The actions page (`features/actions/be/services/action.ts`) runs it with `(params, services)`, no `z` or `flowId`.
- **Entry points mixing concerns.**
  - `@abuddy/sdk/rpc`: backend transport, frontend client and event types.
  - `@abuddy/sdk/runtime`: the host module registry and template execution. The api's bridge maps it as `_sdkTemplates`.
  - `@abuddy/sdk/utils`: pure and Node utilities, plus host-backed `reportSystemError`, `getAppVersion` and `runMigrations`.
  - `@abuddy/sdk/helpers`: actor helpers plus `emit`.
  - `api/src/core/shared/actor-helpers.ts` duplicates the SDK's `safeEvents`, `emit` and `sendParentSafe`.
- **No lint setup exists.** CLAUDE.md names Oxlint and ESLint, but there's no config or lint script. Import rules are enforced by `scripts/check-import-specifiers.ts` (`npm run check:specifiers`).

## Spike results (2026-09-15)

Throwaway worktree `spike/pack-api-organization` (from `c187956e5`, uncommitted, in the session scratchpad; discard with `git worktree remove`). Rewrite the implementation on the goal branch; don't reuse the spike's code.

**What was built:**
- **`@abuddy/sdk/events`**, holding `emit`, `broadcastToPlugin`, `defineEvents`, `HostPluginEvents`, `IncomingEventsOf` and `defineSystemSends`.
- **Generator:** `#generated/events` gained `PackSystemEvents` (system id → incoming events, read from each system's default export) and a typed `sendToSystem`. All 12 default-setup systems and the fixture's `memos` system switched from `const x: SystemEntry = {…}` to `const x = {…} satisfies SystemEntry`.
- **Transport:** an `event-transport` host module (`sendIncoming`) registered by the api (`rootEvents.emitIncoming`), the renderer (`trpc.bus.send.mutate`) and the test host.
- **Migrations:** notes (27 sends) and memos frontends moved to `sendToSystem`, and the 118 `rootEvents.emitOutgoing` calls to `broadcastToPlugin`.
- **Action sandbox:** one runner, `runActionCode`, used by both action runners.
- **Entry split:** `@abuddy/sdk/templates` split from `runtime`.

**Results:** typecheck (including the frontend), `packages:build`/`packages:check`, the api (133), sdk (200), host (77), cli (307), default-setup (545 + 3 skipped) and renderer (4) suites, `npm run build`, E2E (7), `test:external-pack` and `test:packaged-authoring` passed.

**Findings that shape the implementation:**
1. **A type annotation erased the incoming events.** `const entry: SystemEntry = …` widens the spec, so its phantom `_incoming` type is lost. `satisfies SystemEntry` keeps it, and the generator types each system as `IncomingEventsOf<typeof import(entry).default>` through `import type __system_x from '…/system.js'`. Wrong sends failed to compile: an unknown event type, a missing field, an unknown system.
   - The missing-field error is long and unreadable, because the event parameter is checked against every event of the system. Phase 1 types the event by its `type` first (see Decision 2).
2. **Frontend bundles reject SDK modules outside the shared list.** `#generated/events` importing `@abuddy/sdk/services` or a new `@abuddy/sdk/events` failed the pack frontend bundler: "Pack FE code inlines an @abuddy/sdk module that depends on the host module registry". Two changes fixed it:
   - the event facades live in the frontend-safe `@abuddy/sdk/events`, with no `services` import;
   - that entry joins `SDK_FE_MODULES` (`@abuddy/host/build/shared-deps.ts`) as the `sdkEvents` global.
3. **A new SDK entry needs the app's bridge.** The fixture pack's backend runtime failed to load in the app (`Cannot find module '@abuddy/sdk/events'`, all 6 memos E2E tests) until `@abuddy/sdk/events` was added to `SDK_BRIDGE` in `api/src/packs/pack-loader.ts`. The harness passed without it because it derives its bridge from the SDK's exports. `sdk-bridge-drift.spec.ts` does catch a missing entry (checked by removing it: two tests fail naming `SDK_BRIDGE`), so run the api suite after adding any entry.
4. **Packs without systems have no `bus-ids.ts`.** The generated `sendToSystem` block must be emitted only when the pack has systems; otherwise the second fixture pack in `test:external-pack` failed to typecheck (`Cannot find module './bus-ids.js'`).
5. **`as any` hid undeclared events.** 117 of the 118 `emitOutgoing` calls converted mechanically. Removing the casts in `code/be/features/prompts.ts` showed `codePrompts.PROMPT_SELECTED`, `codePrompts.PROMPT_UPDATED` and `codePrompts.CODE_ERROR` missing from `OutgoingCodeEvents`. The frontend declares and handles all three. Declaring them made the sends type-check.
6. **One sandbox works through the services proxy.** Wrapping `services` in a Proxy that returns a named logger for `logger` kept every other service (a spec read `services.repository` through it). The actions page gained `z`.
7. **The templates split** needed the new export, two default-setup imports and the api bridge entry; the harness bridge followed automatically.

**Not spiked (proved in their phases):**
- `PackSystemEvents` composed from dependencies (a pack sending to default-setup's systems) and bundled into dependents' facade types;
- completions for `sendToSystem`;
- the logger and error consolidation and `onLog`;
- the console guard.

## Decisions

Final.

1. **`@abuddy/sdk/events` is the one home for messaging.**
   - It holds:
     - `emit`, `broadcastToPlugin`, `sendToSystem`, `sendToBrainSystem`
     - `onConnected`, `onIncoming`
     - `defineEvents` (typed plugin and system sends)
     - `HostPluginEvents`, `IncomingEventsOf`, `IncomingSystemEvents`, `OutgoingSystemEvents`, `PluginEvents`
   - It's frontend-safe (no Node or `services` imports), a `SDK_FE_MODULES` entry (`sdkEvents`) and an `SDK_BRIDGE` entry.
   - `@abuddy/sdk/services` and `@abuddy/sdk/helpers` stop exporting these.
   - `services.emitter` is built from `events` and typed with the pack's generated maps (the `Services` type and the Monaco action editor follow).
2. **Typed sends both ways, generated.**
   - `#generated/events` exports:
     - `PackEvents` (plugin → events it receives)
     - `PackSystemEvents` (system → events it receives: the pack's own and its dependencies', via their facade types)
     - `emit`, `broadcastToPlugin` and `sendToSystem` from `defineEvents<PackEvents, PackSystemEvents>(busId)`
   - Systems declare entries with `satisfies SystemEntry`, and the `abuddy add feature` template and docs follow.
   - `sendToSystem(systemId, event)` narrows the event by its `type` before checking its fields, so a missing field names the chosen event's type.
   - Systems are named by pack and feature (revised after review): the pack's own by feature id, a dependency's as `<dependency>/<feature>`, and in actions, which run outside any pack, every system as `<pack>/<feature>`, resolved by the host. The generated `sendToSystem` maps each name to the id the system runs under, so an own feature may share a dependency system's name.
   - Every pack gets `sendToSystem`; one without systems sends to its dependencies' (revised after review, which found frontend-only packs had no typed way to reach a dependency).
   - `pack-types.ts` includes `PackSystemEvents`, so dependents compose it.
3. **One way per direction in pack code.**
   - `broadcastToPlugin` everywhere, or `emit` inside a system's actions.
   - `sendToSystem` from frontend and backend.
   - Actions use `services.emitter.broadcastToPlugin`/`sendToSystem`, now typed.
   - The 118 `rootEvents.emitOutgoing` calls, the 191 `trpc.bus.send.mutate` calls and the 7 local `sendToBackend` helpers are replaced.
   - `check:specifiers` rejects in pack sources:
     - `@abuddy/sdk/rpc` imports
     - `rootEvents`
     - `trpc.bus`
     - `emit`/`broadcastToPlugin`/`sendToSystem` from anywhere but `#generated/events` (extending today's rule)
4. **One transport for sends, bound per environment (interim).**
   - `events` sends through an `event-transport` host module: `sendIncoming` and `sendOutgoing`, plus `onConnected` and `onIncoming`.
   - Registered by the api (over `rootEvents`), the renderer (over its tRPC client) and the test host (over `testRootEvents`).
   - Delivery behaviour doesn't change. `goal-package-boundaries.md` Phase 3 replaces this host module with `HostRuntime.transport` and `bindFeHost`, and routes backend sends through the bus actor.
5. **Observability in `@abuddy/sdk/logger`.**
   - **One logger:** `createLogger(source, { debug? })` replaces `createInspectLogger`; `inspect` becomes `debug` gated by the namespace toggle.
   - **One error report:** `reportError({ error, source, title?, operation?, entityId?, severity?, step? })` replaces `reportSystemError` and `reportStepRuntimeError`. With `step` (TNode, node, flow and event ids) it also records the error on the TNode, as the step runtime does today.
   - **Log subscription:** `onLog(callback)` replaces the logs system's `rootEvents.onLog`.
   - **No raw console:** `check:specifiers` gains a rule rejecting `console.*` in pack backend code (`features/*/be`, `extensions`, excluding tests); the 15 files move to loggers.
6. **One action sandbox.**
   - `runActionCode(actionFn, { label, params, services, flowId? })` in default-setup (`extensions/steps/action/sandbox.ts`) runs action code with `params`, `services`, `z` and `flowId`.
   - `services.logger` is `createLogger('action:<label>')`.
   - The action step and the actions page both use it.
7. **App info and navigation.**
   - `getAppVersion` moves to `@abuddy/sdk/env`.
   - `fe/delegates.ts` becomes `fe/navigation.ts` (`navigateToPlugin`, `openInAppBrowser`, `useState`).
8. **Entry points say what they hold.**
   - `@abuddy/sdk/templates` holds `executeTemplate`, `createTemplateResolver` and `TemplateResolver`. `@abuddy/sdk/runtime` keeps only the host registry, for the host, until goal-package-boundaries.md replaces it.
   - `@abuddy/sdk/rpc` is removed: event types go to `events`, and `rootEvents` moves under `@abuddy/sdk/runtime` marked `@internal`.
   - (Revised after review) The SDK holds no API client and the renderer's Vite alias is removed: `secretsClient`, the one frontend use, calls a narrow `secrets-client` host module the renderer registers. The `trpc` host module keys (the renderer's client, the api's server builders) are deleted.
   - `@abuddy/sdk/utils` loses `reportSystemError` (Decision 5) and `getAppVersion` (Decision 7). `runMigrations` stays until goal-package-boundaries.md Phase 4.
   - `api/src/core/shared/actor-helpers.ts` is deleted in favour of the SDK's helpers.
9. **Scope.**
   - In: pack-facing messaging, logging, error reporting, action sandbox, app info, navigation and entry points.
   - Out:
     - the renderer's own sends to the host `packs` system (`renderer/src/packs/state.ts`), which is host code on its own client
     - connection gating and the host runtime port (goal-package-boundaries.md Phase 3)
     - `runMigrations` and app reset (Phase 4 there)
     - data ownership (Phase 5 there)

## Phases

### Phase 1 — `@abuddy/sdk/events` and typed system sends
- Create `@abuddy/sdk/events` (Decision 1): package export, `SDK_FE_MODULES`, `SDK_BRIDGE`, API report.
- Add the `event-transport` host module in the api, renderer and test host (Decision 4).
- Generator (Decision 2):
  - `PackSystemEvents` with dependencies, and type-first event narrowing;
  - generated for every pack (a pack without systems sends to its dependencies');
  - included in `pack-types.ts` and the snapshot.
- Switch every system entry to `satisfies SystemEntry`, including the fixture pack, the example pack's source (edit files only, no `npm install`) and the `abuddy add feature` template.

**Done when:**
- A default-setup type spec rejects an unknown system, an unknown event type and a missing field (naming the event type) for `sendToSystem`, and accepts a correct send.
- `facade-typing.spec.ts` checks system-id and event-type completions for `sendToSystem` under bundler and node16, against workspace source and the published package.
- The fixture pack sends to default-setup's `settings` system through its typed `sendToSystem` in a unit test.
- A pack with no systems still builds and typechecks.
- Mutations fail tests: removing `@abuddy/sdk/events` from `SDK_FE_MODULES` fails the fixture FE build; removing it from `SDK_BRIDGE` fails `sdk-bridge-drift.spec.ts`.

### Phase 2 — Migrate sends and remove raw paths
- Frontend: the 191 `trpc.bus.send.mutate` calls and 7 local `sendToBackend` helpers become `sendToSystem`.
- Backend: the 118 `rootEvents.emitOutgoing` calls become `broadcastToPlugin`. Remove every `as any` on sent events, and declare the events it hid (`codePrompts.PROMPT_SELECTED`, `PROMPT_UPDATED`, `CODE_ERROR`, and any others found).
- `rootEvents.onConnected`/`onIncoming` become `onConnected`/`onIncoming` from `events`.
- `services.emitter` is built from `events`, and default-setup's seed actions typecheck against it.
- `check:specifiers` rules (Decision 3).

**Done when:**
- No pack source (default-setup, fixture pack, example pack, CLI templates) matches the rejected patterns, and each new rule fails on a planted violation (mutation).
- The code, browser, notes and memos flows pass their E2E and unit tests.
- A seed action using `services.emitter.broadcastToPlugin` with a wrong event type fails typecheck.

### Phase 3 — Observability and the action sandbox
- `createLogger(source, { debug })`, `reportError`, `onLog` (Decision 5). Migrate the 4 `createInspectLogger` users, `reportSystemError` and `reportStepRuntimeError` callers, the logs system's subscription, and the 15 `console.*` backend files.
- `runActionCode` (Decision 6) for the action step and the actions page.
- Add the console rule to `check:specifiers`.

**Done when:**
- An SDK spec shows `reportError` with `step` context emits the log event, the outgoing error event and the TNode error.
- A default-setup spec shows the logs system receives a log through `onLog`.
- The console rule fails on a planted `console.log` (mutation).
- A default-setup spec shows an action's `services.logger` logs under `action:<label>`, both runners pass `z`, and `services.repository` is reachable through the sandbox's services.

### Phase 4 — App info, navigation and entry points
- `getAppVersion` → `@abuddy/sdk/env`. `fe/delegates.ts` → `fe/navigation.ts`.
- `@abuddy/sdk/templates` split; `@abuddy/sdk/rpc` removed (Decision 8); `utils` narrowed.
- `api/src/core/shared/actor-helpers.ts` deleted.
- Bridges, `SDK_FE_MODULES`, API reports and published-types specs follow.

**Done when:**
- The published SDK has no `./rpc` entry (a published-exports spec).
- Every bridged specifier resolves (`sdk-bridge-drift.spec.ts`).
- `api:check` is updated and the report diffs are reviewed.
- The full check list passes.

### Phase 5 — Docs
- `docs/public-facing`:
  - **features:** events, sending to systems from the frontend
  - **services and data:** `services.emitter` and `services.logger` in actions
  - **seeds:** the action sandbox
  - **testing:** `takeSystemErrors`, logging
- CLAUDE.md files:
  - root: the key patterns section on events, and the SDK packages list
  - default-setup
  - `abuddy-testing`
- `goal-package-boundaries.md`: its Background inventory is updated to the organized surface.

**Done when:** no doc, template or CLAUDE.md mentions `trpc.bus.send.mutate`, `rootEvents` for packs, `createInspectLogger`, `reportSystemError`, `reportStepRuntimeError` or `@abuddy/sdk/rpc`.

## Deferred

- Routing every backend send through the bus actor, so sends before a client connects behave the same (goal-package-boundaries.md Phase 3).
- Replacing `event-transport` with `HostRuntime.transport` and the frontend port (goal-package-boundaries.md Phase 3).
- Real lint tooling (Oxlint/ESLint config and a lint script); this goal uses `check:specifiers` rules.

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and commit with `git commit -- <paths>`. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit monorepo version/release metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`); this goal doesn't touch them. The generated facades' completions are checked by `facade-typing.spec.ts`: extend it for `sendToSystem`.
- Every new SDK entry needs its `package.json` export, `SDK_BRIDGE` entry (`api/src/packs/pack-loader.ts`), `SDK_FE_MODULES` entry if frontend code uses it, and `api:update`. Run the api suite (`sdk-bridge-drift.spec.ts`) after adding one.
- The CLI suite requires `npm run packages:build` after SDK source changes. default-setup's runtime (`npm run build -w @app/default-setup`) must be rebuilt before the api suites and E2E.
- Investigate failing tests before changing assertions; mutation-check every new guard, helper and test.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
