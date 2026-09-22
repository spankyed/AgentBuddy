> **Written in session** `739e73df-2842-4e0f-9c86-4a88dd07ac62` (Claude Code, 2026-09-22). Resume it with `claude -r 739e73df-2842-4e0f-9c86-4a88dd07ac62`.

```
# Goal: the app shell is the host's, typed for packs, and runs in a pack's tests

Implement docs/goals/goal-host-shell.md on AS/designations-and-addressing, at or after 228228e88 — the base
its Background was surveyed at.
Before Phase 1, confirm the base: packages/renderer/src/core/actors/application.ts exports
createApplicationState, `useApplicationActor` exists in packages/abuddy-sdk/src/fe/actor-system.ts, and
`FeTransport` in packages/abuddy-sdk/src/runtime/fe-host.ts has only `sendIncoming`. If they don't, stop and
say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. Where a detail isn't specified, pick the conventional option, note it in the
final summary, and keep going. No backward compatibility in code: change signatures, move modules, migrate
every in-repo caller, test, fixture, template and doc in the same change, and fix forward. Stored user data
is the exception: it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- No pack source (default-setup, @abuddy/ui, tests/fixtures) reaches the shell's actor: `useApplicationActor`
  is gone from @abuddy/sdk, and packs use `useShell()`, typed by the SDK's `HostShell` contract.
- The shell's machine lives in @abuddy/host/fe as `createShellMachine`, takes its I/O as options, and has no
  import of tRPC, `window`, `localStorage`, the toast or the pack loader; the renderer composes it.
- Outside the renderer's client implementation, no renderer module calls `trpc.bus.*` or `trpc.packs.loaded`.
- The shell's specs run in @abuddy/host with fakes, and none of them mocks a module.
- A fixture pack's unit test opens its plugin through the real shell in @abuddy/testing, and the link
  navigation case in tests/e2e/feature-addressing.spec.ts:52 is covered by a unit test on that harness.
- npm run typecheck, npm run test:unit, npm run build, npm test, npm run test:external-pack and
  npm run test:packaged-authoring pass; npm run api:check and facade:check pass with etc/ committed.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating. Keeping
  `useApplicationActor` exported "for external packs" is a shim.
- import Vue, tRPC, `window`, `document` or `localStorage` in @abuddy/host (Decision 1).
- change `window.applicationState` or the machine id `application` that `#application.*` targets use
  (Decision 6).
```

## Background (2026-09-22, at 228228e88 on AS/designations-and-addressing)

### The precedent: the backend bus moved into the host

The backend went through this move recently, in four commits:

- **`df84b09b0`** (2026-09-14) moved the bus routing core into `@abuddy/host`. It created the injected shape as part of the move: `createBusMachine({ registry, listen, onOutgoing })` takes its I/O as options, and the API's bus composes it with the root event bus "so the pack test harness can run the same routing".
- **`a35120c5f`** (the same day) was that consumer: `startApp` in `@abuddy/testing` runs a pack's systems on the app's bus core.
- **`28be3b60b`** and **`04be5db79`** (2026-09-16) finished the split. `createAppBus(registry)` composes the bus, and the API keeps only transport, boot and composition.

The clean seams came from the move; they weren't there before it. The backend also stopped using a client of its own: SDK code sends over the bound `HostRuntime.transport`.

### The shell today

`packages/renderer/src/core/actors/application.ts` (1,170 lines) is the application actor: the app shell. It is the frontend half of the host `application` feature, whose backend half is `packages/abuddy-host/src/bus/application-system.ts`. `packages/renderer/src/main.ts:116` creates it as `applicationState`.

It owns seven concerns in one machine:
- plugins, spawning and selection
- history and breadcrumbs
- hotkeys
- panel layout
- the bus connection
- pack frontend loading
- errors and onboarding

Its I/O is imported at module level:

| I/O | Where |
|---|---|
| tRPC client: `bus.send` | `:649`, `:782` |
| tRPC client: `bus.sub` subscription | `:395` (`backendListener`) |
| tRPC client: `bus.packClientReady`, `packs.loaded` | `:180`, `:321` (`packFrontendLoader`) |
| `reconnectApiClient` and Electron's `window.electronAPI.apiStatus` | `:389`, `:428`, `:985` |
| `window` keydown/keyup/blur/focus and mousedown listeners | `:297`–`:306` (`hotkeyListener`), `:360` (`mouseListener`) |
| `localStorage` (panel sizes) | `:108` (`savedPanelSizes`), `:888` |
| `globalToast` | `:565`, `:577`, `:1163` |
| `window.__showErrorPage` | `:1001`, `:1004`, `:1146`, `:1156` |
| the pack loader's dynamic `pack://` imports (`loadPackFrontend`, `unloadPackFrontend`) | `:13`, `:327`, `:474` |

It imports no Vue. `route-trailer.ts`, its other import, is plain XState, and `@abuddy/host` already depends on `xstate`.

Its four specs (`packages/renderer/src/core/actors/__tests__/application-{pack-plugins,shell-state,system-error,pack-loading}.spec.ts`) each `vi.mock('@/core/trpc')` to run it.

### How packs reach the shell

The shell is a de facto public API, and it is untyped:

- **`useApplicationActor(): AnyActorRef`** (`packages/abuddy-sdk/src/fe/actor-system.ts:9`) returns `inject('applicationActor')!`, which `main.ts:169` provides.
- **The SDK port** is a second path to the same actor: `FeHostRuntime.application: AnyActorRef` (`packages/abuddy-sdk/src/runtime/fe-host.ts:33`).
- **`openPlugin`** (`packages/abuddy-sdk/src/fe/navigation.ts`) reads `snapshot.context.plugins`, `activePlugin.id` and `defaultToggles.canvas` untyped, and sends `SELECT_PLUGIN` and `DEFAULT_TOGGLE`. It throws for a ref no plugin is registered at, so a link to an external pack's plugin clicked before that pack's frontend has loaded throws rather than opening once it loads (PR #196 review, item 11). The SDK can't tell a pack still loading from a mistyped ref; only the shell knows which pack frontends are still loading, and it already waits for a plugin that way for a popout and for the plugin last open (`pendingPluginId`).
- **`pluginActor`** (`actor-system.ts:27`) reads `application.system.get(ref)`.

Pack call sites, all with `state: any` selectors and unchecked sends:

| File | Reads | Sends |
|---|---|---|
| `default-setup/src/features/settings/fe/canvas/tabs/PluginsTab.vue` | `context.plugins`, `context.pluginVisibility` | `SET_PLUGIN_VISIBILITY` |
| `default-setup/src/features/code/fe/features/commit/CommitPanel.vue` | | `RESTORE_CHAT` (twice) |
| `default-setup/src/features/code/fe/features/pull-request/PullRequestPanel.vue` | | `RESTORE_CHAT` (twice) |
| `default-setup/src/features/code/fe/canvas/QuickOpenPalette.vue` | `context.panelSizes` | |
| `default-setup/src/features/threads/fe/chat/chat.vue` | `hasTag('onboarding')`, `context.panelSizes.canvasHeight` | `RESIZE_PANEL` |
| `default-setup/src/extensions/blocks/display/LinkBlock.vue` | | whatever a link's `data` holds, when `target === 'application'` |
| `default-setup/src/extensions/app/Welcome.vue` | | `CLOSE_DEV_LETTER` |
| `abuddy-ui/src/components/KeyboardShortcutInput.vue` | | `HOTKEYS_RECORDING_START`/`_END` |

Nothing stops a pack sending the shell's internal events (`BUS_SUBSCRIBED`, `PACK_PLUGINS_UNLOADED`). This breaks the rule in the root CLAUDE.md that no pack code looks up another plugin's actor: a feature offers what others need as composables from its `fe/public.ts`. The host's own plugin is the one exception.

`LinkBlock.vue`'s `'application'` target is a bare name, and no link data in the repo uses it (`git grep "target: 'application'"` finds only the type at `:32`).

### Where the renderer uses tRPC

- `bus.send`: the SDK's frontend transport wraps it (`packages/renderer/src/core/fe-host.ts`, `feTransport.sendIncoming`). The shell (`:649`, `:782`), the Packs plugin (`packages/renderer/src/packs/state.ts:98`, `:111`, `:120`, `:150`, `:154`, `:158`) and `packages/renderer/src/packs/pack-install.ts:24` call tRPC directly instead.
- `bus.sub`, `bus.packClientReady` and `packs.loaded`: the shell only.
- `secrets.*`: already behind the `SecretsClient` port (`packages/renderer/src/core/secrets-client.ts`).

### Tests

- **Pack frontend tests** bind `startFeTestRuntime` (`packages/abuddy-sdk/src/testing/fe-runtime.ts:36`), whose shell is `{} as never`. No pack test can exercise `openPlugin`, `navigateToPlugin`, `PluginScope`, or any of the call sites above.
- **Environment:** default-setup's unit tests run in `environment: 'node'`, and the renderer's in `jsdom`.
- **E2E:** 11 files under `tests/e2e` and `packages/abuddy-testing/src` read `window.applicationState` (`main.ts:130`).

## Why, and how we'll know

The user sees no change: no new behaviour and no speed target. The wins are safety for pack authors, testability, and cleaner ownership. Strongest first:

1. **Packs can't break, or be broken by, the shell without a compile error.** Today eight pack components read the shell's state as `any` and can send it any event, internal ones included. Renaming a context field (`panelSizes`, say) breaks the chat panel and `openPlugin` at runtime, with no compile error. With a typed contract checked on both sides, a mismatch fails the typecheck, and external packs get a published API instead of an accident they depend on.
2. **Pack frontends can be tested without E2E.** Today anything that navigates, opens a plugin or reads shell state can only be tested by launching Electron. A real shell in a `node` test, next to the bus `startApp` runs, turns minutes-long app launches into tests that take seconds. This is the frontend version of `a35120c5f`.
3. **The shell can be tested on its own.** Its I/O is injected and its seven concerns are separate modules, so its specs run on fakes instead of mocking the tRPC module.
4. **One seam between the frontend and the backend.** `FeClient` and `SecretsClient` replace three ways of talking to the API, so reconnect handling and error reporting live in one place.
5. **Ownership matches the layer rule.** The host owns both halves of its `application` feature, and the renderer is composition. On its own this is the weakest of the five.

| Win | Success looks like |
|---|---|
| Typed contract | No shell selector typed `any` in pack sources. Removing an event from the machine fails the typecheck, which a mutation check proves. `etc/fe.api.md` shows the shell API and no raw actor. |
| Pack frontend tests | A fixture pack's `node` unit test opens its plugin and reads shell state. At least one interaction that only E2E covers today moves to a unit test: the link navigation case at `tests/e2e/feature-addressing.spec.ts:52` ("a link to another plugin opens it and hands it the events"). |
| Shell testability | The host's shell specs run on fakes with no `vi.mock`. A shell change is verified by the host suite without E2E. |
| One seam | Only the client implementation calls tRPC for the bus, and reconnect has a test. |
| No regressions | The E2E suite passes with none of the 11 files that read `window.applicationState` edited for the move. |

**Where the payoff sits.** Phases 1 and 2 pay off on their own, through types and one seam. Phase 3, the largest, pays off mainly through Phase 4: a move whose harness never replaces an E2E test has only changed where a file lives. So Phase 4, with at least one E2E-only case moved to a unit test, is the bar. If the goal stops early, stop after Phase 2 rather than after Phase 3.

## Decisions

Final.

1. **The shell is host-owned app runtime.**
   - `createShellMachine` lives in `@abuddy/host/fe`, as the frontend half of the host `application` feature.
   - The renderer composes it (`createAppShell`, the counterpart of `createAppBus`) and binds it.
   - `@abuddy/host` stays free of Vue, tRPC and browser globals. Everything else arrives as options (Decisions 3 and 4).
2. **Packs reach the shell through a typed SDK contract, never its actor.**
   - `@abuddy/sdk/fe` defines `HostShell`: the state packs may read (plugins, active plugin, plugin visibility, panel sizes, whether the app is onboarding) and the events they may send.
   - `useShell()` exposes that state and named commands (`restoreChat()`, `resizeCanvas(size)`, `setPluginVisible(ref, visible)`, `startHotkeyRecording()`/`endHotkeyRecording()`, `closeDevLetter()`).
   - `useApplicationActor` and the `'applicationActor'` provide are deleted: one path to the shell, the bound port.
   - `FeHostRuntime.application` is typed against the contract, so `openPlugin`, `pluginActor` and `PluginScope` read it typed.
   - The shell machine is checked against `HostShell` at compile time, as the backend application system is against `HostPluginEvents`.
3. **One frontend client port.** `FeTransport` becomes `FeClient`, covering:
   - sending a message
   - subscribing to messages sent out, and to the connection's lifecycle
   - `packClientReady(packId)`
   - `loadedPacks()`

   The renderer implements it over tRPC, and Electron's API status and reconnect stay inside that implementation. `SecretsClient` stays its own port.
4. **The shell's other I/O are options.** Each has the renderer's implementation and a fake for tests:
   - `packFrontends`: load and unload a pack's frontend (the renderer's `pack://` imports)
   - `storage`: saved panel sizes
   - `notify`: toasts and the error page
   - `target`: where the key and mouse listeners attach; with none, none attach
5. **Split by concern as it moves.** Modules under `packages/abuddy-host/src/fe/shell/` for plugins and selection, history and breadcrumbs, layout, hotkeys, connection, and pack frontends. A concern that owns a listener or subscription is a child actor.
6. **What stays in the renderer:**
   - the Vue components
   - the composition (`createAppShell`) and the port binding
   - `window.applicationState`, which the E2E fixture reads
   - the machine id `application`, which `#application.*` targets use
   - the Packs plugin's frontend (Vue, `renderer/src/packs`); only its tRPC sends move onto `FeClient`
7. **`LinkBlock.vue`'s `target === 'application'` branch is deleted.** A link's target is a plugin's ref or `'external'`. Done in `abb036161`, with default-setup's 0.3.15 migration pointing stored bare targets at `default-setup/<id>`.
8. **`@abuddy/testing` runs the real shell for pack frontend tests,** over the in-memory bus `startApp` uses. It runs without a DOM (no `target`), so it works in default-setup's `node` environment. `startFeTestRuntime` no longer defaults the shell to `{} as never`.
9. **Opening a plugin is the shell's command, and it waits for a pack still loading.**
   - `openPlugin(ref, event?)` sends the shell `OPEN_PLUGIN { plugin, events }` (part of `HostShell`) instead of reading its context and sending it `SELECT_PLUGIN` and `DEFAULT_TOGGLE` itself.
   - The shell opens a registered plugin and hands its actor the events, as `openPlugin` does today.
   - For a ref that isn't registered while external pack frontends are still loading (the loaded packs not yet read, or a load running or queued), it parks the request, as it parks `pendingPluginId`, and opens it when that pack's plugins arrive.
   - Once every pack frontend has settled and the ref still names no plugin, the request is refused through `notify`, naming the ref. A request whose pack is unloaded while it waits is dropped.
   - `openPlugin` no longer throws for an unregistered ref, since the answer only exists after loading; a ref that isn't `<packId>/<featureId>` at all is still refused at the call.

## Phases

### Phase 1 — a typed shell contract (Decisions 2 and 7)

- Add `HostShell` and `useShell()` to `@abuddy/sdk/fe`.
- Type `FeHostRuntime.application`, `openPlugin` and `pluginActor` against the contract.
- Migrate the 8 call sites in Background, and delete `useApplicationActor` and `main.ts:169`'s provide.
- Delete `LinkBlock.vue`'s `'application'` branch.
- With `useApplicationActor` gone, pack code has no path to the actor: `boundFeHost` is exported only from `@abuddy/sdk/runtime/internals`, which isn't published. Keep it that way; `etc/fe.api.md` and `etc/runtime.api.md` record it.
- Type-check the renderer's machine against `HostShell`.
- Run `npm run api:update`.

**Done when:**
- `git grep useApplicationActor` matches nothing outside docs/archive.
- `git grep "state: any" -- '*.vue'` finds no selector on the shell.
- A type test fails if the renderer's machine stops accepting a `HostShell` event.
- The settings, commit, pull-request, chat and welcome flows pass their E2E specs.

**Mutation:** remove `RESTORE_CHAT` from the machine and the type test fails.

### Phase 2 — one frontend client port (Decision 3)

- Replace `FeTransport` with `FeClient`, and implement it in `packages/renderer/src/core/fe-host.ts` over tRPC and the Electron API-status bridge.
- The shell, `packs/state.ts` and `packs/pack-install.ts` send, subscribe and read loaded packs through it.
- The shell's specs replace `vi.mock('@/core/trpc')` with a fake client.
- Run `npm run api:update`.

**Done when:**
- `git grep -E "trpc\.(bus|packs)" packages/renderer/src` matches only the client implementation.
- No shell spec mocks `@/core/trpc`.
- The E2E suite passes, including a reconnect case: an existing spec, or a new one in `tests/e2e` that restarts the API and sees the window resubscribe.

**Mutation:** make the fake client drop sends, and a shell spec fails.

### Phase 3 — move, inject and split (Decisions 1, 4, 5, 6 and 9), after Phase 2

- Build `createShellMachine({ packs, client, packFrontends, storage, notify, target })` in `packages/abuddy-host/src/fe/shell/`, split per Decision 5, and export it from `@abuddy/host/fe`.
- The renderer's `createAppShell` composes it with the real implementations, and `main.ts` creates and binds it.
- Move the four specs to `packages/abuddy-host/tests/fe/shell/`, running on fakes.
- Opening a plugin moves into the shell (Decision 9): `OPEN_PLUGIN` joins `HostShell`, `openPlugin` sends it, and the shell parks a request for a plugin whose pack frontend is still loading. Specs, on the fake `packFrontends`: a request made while a pack loads opens its plugin with the events once it arrives; one for a ref no pack provides is refused through `notify` once loading settles; one whose pack unloads while it waits is dropped.
- Update `packages/renderer/CLAUDE.md`, `packages/abuddy-host/CLAUDE.md` and the root CLAUDE.md's layer table.

**Done when:**
- `packages/renderer/src/core/actors/application.ts` holds no machine.
- `git grep -E "from ['\"](vue|@/)|window\.|localStorage" packages/abuddy-host/src/fe` matches nothing, with a boundary spec in `packages/abuddy-host/tests` enforcing it.
- The host shell specs pass with no `vi.mock`.
- A link to an external pack's plugin clicked before that pack's frontend loads opens it once it loads (the host shell spec above, and the E2E link case with the pack's load delayed).
- The full E2E suite passes.

**Mutation:** import `localStorage` from a shell module and the boundary spec fails. Make the shell refuse an unregistered ref at once instead of parking it, and the waiting spec fails.

### Phase 4 — the shell in pack tests (Decision 8), after Phase 3

- `@abuddy/testing` gains a frontend harness that binds the real shell over the in-memory bus `startApp` runs, with the test pack's frontend registered.
- `startFeTestRuntime` binds a working shell by default.
- A fixture pack (`tests/fixtures`) adds a unit test that opens its plugin with `navigateToPlugin` and reads `useShell()` state.
- `packages/abuddy-testing/CLAUDE.md` documents it.

- Cover the link navigation case at `tests/e2e/feature-addressing.spec.ts:52` with a unit test on the harness: a link block's target opens the plugin and hands it the link's events. Keep the E2E case only if it checks something the unit test can't (rendering, the real window), and say which.

**Done when:**
- The fixture's test passes under `npm run test:external-pack`, and `test:packaged-authoring` still passes.
- A unit test on the harness covers link navigation, and fails when `openPlugin` stops handing the plugin its events.

**Mutation:** make the harness skip spawning plugin actors, and the fixture test fails.

## Deferred

- **Moving the Packs plugin's frontend (`renderer/src/packs`) into the host.** It is Vue components and state; only its sends change (Phase 2).
- **Mounting pack Vue components in pack unit tests.** Phase 4 exercises machines, navigation and `useShell()` state, not rendering.
- **A client other than Electron.** `FeClient` makes one possible; nothing here builds one.

## Constraints

- **Git:**
  - Commit each phase as it finishes, in logical chunks, with conventional messages and no attribution lines.
  - Check `git diff --cached` first, and commit with `git commit -- <paths>`.
  - Push, tag and open PRs only on request.
- **Publishing:** no npm publishing, GitHub releases or triggered workflows.
- **Data and processes:** no real data dirs; no broad pkill; E2E runs in the `abuddy-test` namespace.
- **Standing rules:** preload, the example pack and release metadata keep their usual rules. The typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- **Published packages:**
  - no `any` in `@abuddy/sdk`'s pack-facing surface, which `HostShell` and `useShell()` are
  - the TypeScript 5.7 floor
  - `api:update` after export changes
  - `Object.hasOwn` and `Error.cause` broke the shared-source lib floor before, so run the full typecheck after touching `sdk` source
- **Checks:** run suites one at a time, never concurrently; investigate failing tests; mutation-check new guards.
- **External packs are first-class:** keep the fixture packs, the example pack and `test:packaged-authoring` passing.
