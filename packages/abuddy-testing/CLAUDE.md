# @abuddy/testing

Reusable Playwright E2E test fixture for AgentBuddy, a unit test harness for packs' data code, and vitest helpers for unit tests that use AgentBuddy's on-disk stores. Extracted from the monorepo's test infrastructure so both the host app and external packs share the same test code.

## Architecture

This module (`packages/abuddy-testing/src/index.ts`) is the single source of truth for the E2E fixture. It exports:

- **`test`** and **`expect`** — Playwright test objects with three custom fixtures (`electronApp`, `appPage`, `app`) pre-configured. Uses auto-detection to find the AgentBuddy root.
- **`createTest(options?)`** — Factory function returning `{ test, expect }` with explicit configuration (for when auto-detection isn't enough).
- **`AppHelper`** — TypeScript interface for the `app` fixture's high-level API.

### How the monorepo uses it

`tests/e2e/fixtures/app.ts` is a 2-line file:
```ts
export { test, expect } from '@abuddy/testing';
export type { AppHelper } from '@abuddy/testing';
```

All test files (`tests/e2e/*.spec.ts`: `smoke`, `navigation`, `secrets`, `import-pack-seeds`, `dev-reload`, `plugin-sends`) import from `./fixtures/app`. `@abuddy/testing` is the `packages/abuddy-testing` workspace package, and its three entries resolve its built bundle under every condition — so the repo's own E2E runs the same fixture a pack does, and `npm test` runs `packages:ensure` first to build it from the checkout's current sources.

### How external packs use it

External packs add `@abuddy/testing` and `@playwright/test` as devDependencies (`abuddy init-tests` does this) and import directly:
```ts
import { test, expect } from '@abuddy/testing';
```

## Vitest: isolated data dirs (`@abuddy/testing/vitest`)

Unit tests that open EARS or the media store need `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR`. `isolatedDataDir(prefix)` creates a throwaway data dir for the run and returns the vitest settings that use it:

```ts
import { defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';

const dataDir = isolatedDataDir('my-pack-tests-');

export default defineConfig({
  test: {
    env: dataDir.env,                                          // ABUDDY_ENV=test, ABUDDY_USER_DATA_DIR=<run dir>
    globalSetup: dataDir.globalSetup,                          // gives workers the project root; removes the run dir when the run ends
    setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],   // first: each worker uses <run dir>/worker-<n>
  },
});
```

The run's dir is named `<prefix><pid>-XXXXXX`; `isolatedDataDir` first removes dirs with its prefix whose process is gone, left by runs that crashed before their teardown. The per-worker split matters when spec files run in parallel: without it, a spec resetting the media store deletes another worker's files mid-test. The entry uses only Node built-ins (`src/vitest.ts`, `vitest-worker.ts`, `vitest-teardown.ts`), so it loads without the `@abuddy/source` condition. The bundle ships the three as separate entries, since vitest loads the worker and teardown modules by path. The global setup also `provide`s the vitest project's root (`PROJECT_ROOT_KEY`), which the harness `inject`s to find the pack. A pack's config sets no `resolve.conditions`: a pack resolves the `@abuddy` packages' published `dist` whether they came from the registry or a checkout link, so there is nothing to select, and `check:specifiers` fails a pack config that declares the `@abuddy/source` condition. This is the config `abuddy init` scaffolds (`abuddy-cli/src/commands/init.ts`). default-setup's `vitest.config.ts` uses `isolatedDataDir` and is a pack config too: it also declares no condition, and `npm run typecheck:pack` and `npm run test:external-pack` run `packages:ensure` first so the `dist` it reads is current.

## Keeping a checkout's packages current

A pack loads the `@abuddy` packages' built `dist`, and in a checkout that `dist` is built on demand, so
something has to bring it up to date before a pack's code compiles or runs against it. One rule decides
that — `@abuddy/host/build/packages-built`, the fingerprint-and-stamp freshness check — reached through
several entry points. They are not competing mechanisms. They are two kinds, and each covers a way in
that the others don't. This table is the record, because most of the doors are npm scripts and JSON
carries no comments.

**Fixers** run before the process starts, so they rebuild and carry on.

| # | Door | Covers | Where |
|---|---|---|---|
| 1 | `npm run packages:ensure &&` in a root script | a repo command: `test`, `test:smoke`, `test:e2e`, `test:external-pack`, `typecheck`, `typecheck:pack`, `compile`, `prebuild` | root `package.json` |
| 2 | that workspace's `pretest` | `npm test -w @abuddy/cli` and `npm test -w @app/default-setup` run directly, which no root script wraps | each package's `package.json` |
| 3 | `ensureCheckoutPackages(packRoot)` | `abuddy build`, `abuddy test`, `abuddy dev` — from any directory, for a pack whose packages are a checkout's | `abuddy-cli/src/build/checkout-packages.ts`, called from `commands/{build,test,dev}.ts` |
| 4 | the `Build publishable packages` step | CI, whose typecheck step already built them through `typecheck:pack` | `.github/workflows/ci.yml` |

**Checkers** run inside a process that has already started, where the modules are loaded and rebuilding
mid-run would be wrong. All they can do is fail, and say what to run.

| # | Door | Covers | Where |
|---|---|---|---|
| 5 | `assertCheckoutPackagesFresh()` | a pack author's bare `npx vitest` or `npx playwright test`, with no CLI in front of it | `src/checkout-freshness.ts`, called from `setupPackTests` and the `electronApp` fixture |
| 6 | a throw while the module loads | the CLI's own `published-*` specs run without their `pretest` (`npx vitest`, a watch run) | `abuddy-cli/tests/helpers/published-packages.ts` |

Three things follow.

- **A new entry point needs a fixer in front of it, not another copy of the rule.** Every door above calls
  the same check; what differs is only when it runs and whether it can repair what it finds.
- **A fixer belongs to the command a user runs, not to a function a watch loop calls.** `abuddy dev`
  rebuilds the pack through `build()` on every file change, and the check reads every source of all five
  packages, so `abuddy build` refreshes in `buildCommand` while `build()` stays clean. Both placements
  are pinned by `abuddy-cli/tests/build/checkout-packages.spec.ts`.
- **A checker must not try to repair.** Its process has already resolved and loaded modules; a rebuild
  underneath it would leave half of two builds in memory. `assertCheckoutPackagesFresh` reports a build
  running beside it separately for that reason, and says to wait rather than to start another.

One path is deliberately not in the table twice. `npm start` reaches door 3, because its
`prebuild:be:dev` builds the built-in pack with `abuddy build --skip-fe`, and that command ensures —
so the script carries no prefix of its own. `prebuild` does carry one: `npm run build -ws` fans out
across the workspaces in no guaranteed order, so nothing there can be relied on to ensure first.

For an installed pack there is no checkout above it, every one of these is a no-op, and what npm
delivered is what there is.

One thing that is *not* a door here, though it looks like one: `scripts/api-report-stamp.ts`
(`npm run check:api-stamp`, run by `npm run typecheck`) also fingerprints files with
`fingerprintInputs`. It answers a different question — whether the committed API reports still match
the declarations they were generated from — and it reads the built `dist`, which the doors above are
what keep current. Reusing the hashing primitive is not the same as being another entry point to this
rule, so it does not belong in the tables above and must not be folded into them.

### What a running dev app does and doesn't pick up

`npm start` leaves two halves of the built-in pack on different clocks, and knowing which is which saves
an afternoon.

**Follows your SDK and UI source, live.** The renderer's Vite config declares the condition
(`resolve.conditions` and its `ssr` twin), so editing `@abuddy/sdk`, `@abuddy/ears` or `@abuddy/ui`
source hot-reloads the browser with no build step. The API's tsup build declares it too
(`esbuildOptions.conditions`), and built-in packs' backends are bundled into the API, so the pack's
running code follows source as well.

**Frozen at the moment the command ran.** Everything `abuddy build` produced for the pack, because a
pack build resolves the packages' `dist`: the compiled seeds (`*.seed.json`), the facade types
(`dist/types/pack-types.d.ts`), the step build and the seed runtime (`dist/build/`). `npm start` builds
those once, through door 3, and nothing rebuilds them while the app runs.

The one that bites in practice is the facade. `packages/default-setup/tsconfig.json` declares no
condition — it is a pack config — so **your editor type-checks default-setup against the packages'
`dist`**. Change an SDK type and the editor keeps showing the old one until something rebuilds it. Any
command with a door does (`npm run typecheck`, `typecheck:pack`, `compile`), or `npm run packages:ensure`
on its own. This is the cost single mode trades for: a pack, the built-in one included, compiles against
the layout a pack author has, and in a checkout that layout is only as current as the last build.



## Unit test harness (`@abuddy/testing/harness`)

A pack's unit tests run its code without the app: seeds, repositories and seed hooks against an in-memory EARS, and with `registration` its systems, services, steps and flows, all including its dependencies' behaviour. The registered packs are the test file's own: `harness.ts` creates a registry (`createPackRegistry()` from `@abuddy/host/packs`) per test file, registers the pack and its dependencies in it with no guard against an earlier registration, binds it for the SDK's lookups and hands it to `startApp` (`setAppPacks`). `abuddy init` scaffolds the setup (`vitest.config.ts` with `isolatedDataDir`, `tests/setup.ts` passing `seedRuntime` and `registration`, an example seed test); `abuddy add feature` scaffolds a system test, adding `tests/setup.ts` (and `vitest.config.ts` when vitest has no config, devDependencies) to a pack without it. Published declarations import only published packages (`Message` from `@abuddy/sdk/events`, never `@abuddy/host`). Pack-facing guide: `docs/public-facing/testing.md`.

- **`setupPackTests({ seedRuntime, registration?, seeders?, packDir? })`** — from a vitest setup file. `packDir` defaults to the nearest `abuddy.json` at or above the injected vitest project root (else the working directory).
  - Starts `@abuddy/sdk/testing`'s runtime (`startTestRuntime`), which creates and installs an in-memory EARS engine (`createEarsEngine`; `resetTestData` before each test installs a fresh one, keeping the registered repositories) checking the SDK's, the host's (`AppState`, `@abuddy/host/app-state`), pack's and dependencies' entity types, and the in-memory app it binds (`@abuddy/sdk/src/testing/host.ts`): `testRootEvents` as the bus behind `sendToPlugin`/`sendToSystem`/`onConnected`/`onIncoming`, loggers and `onLog` (each log event printed to the console), the `SYSTEM_ERROR` events `reportError` sends (recorded for `takeSystemErrors`), version `0.0.0-test`, `appData` (reset, and `hasOnboarded`/`completeOnboarding` over the host's `AppState` row, as in the app), a trace store over the in-memory database, `secrets` (metadata only, emptied by `resetTestData`), and an `inference` that fails until a test mocks it with `mockInference`.
  - A test that needs a database of its own (tooling, a compiler) creates it with `createEarsEngine` from `@abuddy/ears` and passes it where the API takes one (`exportFlowsToDSL(dir, { engine })`), leaving the installed engine alone.
  - Binds it (`bindHost`) with `packs`: the test file's registry, with the current test's `mockService` mocks over its services (`@abuddy/sdk/testing`'s `testPacks` stand-in sits over it).
  - Data tier (no `registration`): registers each dependency's `build/seed-runtime.mjs`, then the pack's own seed runtime with its `seeders`, in the registry, each as a registration (entity types, repositories, seed hooks, seeders).
  - Runtime tier (`registration`): loads each dependency's `.abuddy/deps/<id>/runtime/index.cjs` with `src/dependency-runtime.ts`, points it at `runtime/seeds`, and registers it and the pack's registration (which carries the pack's seeders) in the registry.
  - Before each test it empties the database and media store, and fails a concurrent test that can run alongside another (vitest runs a suite's consecutive concurrent children together; a lone `it.concurrent` passes): the database, mocks and apps are per file.
  - After each test it stops apps, clears mocks, and fails the test on system errors the test didn't take; every step runs even when an earlier one throws.
- **Dependency runtimes load on the pack's SDK.** `withModuleBridge` (`@abuddy/host/packs`, shared with the API's pack loader) maps every export of the shared-instance packages (`@abuddy/sdk`, `@abuddy/ears`: `sharedInstanceSpecifiers` from `@abuddy/host/build/shared-deps`), `xstate` and `zod` to the namespaces the test process imported. A subpath whose optional peer isn't installed maps to a module that throws on use. npm packages the runtime keeps external that the pack doesn't install (default-setup's `node-pty`, `playwright`, …) load as modules that throw on use.
- **`seedPack({ keys?, mode? })`** — compiles the chosen seed entries (by default every entry naming a format and no pack seeder) with `compilePack` (with the registry's steps as its definitions), registering tsx's loader while the SDK's compilers import pack TypeScript (`#generated/*`), and seeds them with `seedData`. Returns the counts of the compiled keys.
- **`startApp({ systems })`** (`src/app.ts`) — the named registered systems under `@abuddy/host/bus`'s `createBusMachine` (the API's bus core), on `testRootEvents`.
  - Members: `connect`, `send`, `emitted`, `nextEmit` (5 s default), `settle`, `runFlow` (10 s default), `flowTrace`, `system`, `stop`. Bare system ids resolve as given, then as `<packId>.<id>` for the pack under test; an external dependency's systems need their full bus id.
  - `connect` sends `CLIENT_CONNECTED` to every running system: the test bus sets no `clientLoadedPacks`, so no pack waits for `PACK_CLIENT_CONNECTED`. `send` routes whether or not a client connected. `sendToPlugin` goes through the bus (`OUTGOING`; the bus hears it through `testRootEvents.onPluginSend`), delivered only once connected, so `emitted` holds nothing sent before a client connected (`abuddy-cli/tests/harness/dependency-runtime.spec.ts`).
  - Events for systems (client events, `sendToSystem`, `fire` steps, schedule ticks) reach them from `startApp`, as in the app; only sends to plugins wait for a client (`connect`, or `CLIENT_CONNECTED` from any app's `connect`, which reaches every running bus). The bus's state (`awaitingClient`, `clientSeen`) is its own.
  - The first app to start (none running) calls every registered pack's `boot.onInit` (the registry's `getBootHooks`, registration order: dependencies first) before its bus starts, as the API does at boot after hydrating and before starting the systems. A failing `onInit` shuts the packs down again and fails `startApp`.
  - `stop` stops the bus, rejects pending waits with "The test app stopped" (marking in-flight calls handled, so a wait nobody awaits isn't an unhandled rejection), and, once no app runs, calls every registered pack's `boot.onShutdown`, as the API does when it tears a pack down. So each test's apps run between one `onInit` and one `onShutdown`. Stopped actors never reach their own cleanup (default-setup's `killBrain`), so module-level state (cron jobs, ad-hoc brain listeners, the flow actor registry) is cleared there: default-setup's `features/hooks.ts` (whose `onInit` ensures the Settings entity, safe on each test's emptied database).
  - After `stop`, `connect`, `send`, `nextEmit`, `settle` and `runFlow` reject with "The test app stopped" (already handled, so `void app.nextEmit(…)` isn't an unhandled rejection) and `system` throws it; `emitted` and `flowTrace` still read what the app recorded.
  - `settle` waits zero-delay timer turns until xstate's inspection reports no activity.
  - `runFlow` and `flowTrace` drive default-setup's brain (designated `brain`). The brain runs the declared root flow (`root: true`, imported with `importFlows` or seeded) from `startApp`, and subflows it spawns. `runFlow` never grants the root role or restarts the brain: it sends `TRIGGER_BRAIN_EVENT` (global, as a client does) and waits on the brain's `TNODE_SPAWNED`/`TNODE_UPDATED` reports for the running flow with that label (root or subflow); without an event, it returns the entry tracks that flow ran. The reports are recorded from the bus's inspection, so trace reports from before a client connected are seen, and `runFlow` doesn't connect the app. `runFlow` returns only the tracks its event triggered; tracks started by their `fire` steps need `settle()` and `flowTrace`. Steps whose runtime sets `waits` (keep-alive) count as finished-waiting. Trace node rows are captured as reported, since the brain clears them when it stops. `flowTrace` finds a subflow by its flow's label (the subflow step's `flowRef`). `runFlow`'s timeout covers its sends and settling too.
- **`startShell({ plugins, defaultPlugin?, designations? })`** (`src/shell.ts`) — the host's own shell (`createShellMachine` from `@abuddy/host/fe`, inlined like the rest of the host) with the test pack's plugins registered in a fresh `createFePackRegistry()`, bound through `startFeTestRuntime` so `navigateToPlugin`, `openPlugin` and `useShell()` reach it. The SDK reads roles, steps, artifacts and blocks through a bound frontend host whenever one is bound, so the frontend registry it binds answers those from the backend's registered packs first (`backendFirst`), and the pack's systems keep finding the brain and its steps while a shell runs (`default-setup/tests/unit/harness-shell-lookups.spec.ts`). It refuses to start when a frontend host is already bound (`startFeTestRuntime`, or another shell in the test). Plugins are passed as state machines, since plugin modules import `.vue` files. Its `ShellClient` is `testRootEvents`: sends are incoming messages a `startApp` app's bus routes, and outgoing messages reach the plugins' actors — held from the client's creation until the shell subscribes, because over the in-memory bus a plugin asking for its data as it's spawned is answered before the shell's connection listener exists, where a socket would deliver it later. It connects at once (with a `CLIENT_CONNECTED` for the shell), loads no external pack frontends, stores nothing, and records what it would tell the user in `notices`. The harness stops shells after each test (`stopRunningShells`), before apps. Proofs: `tests/fixtures/external-pack/tests/unit/shell.spec.ts` (opening by name with events, `useShell()` reading it, a refused ref, a plugin's round trip to its system) and `default-setup/tests/unit/link-navigation.spec.ts` (the Logs link opening Settings on the Logs plugin, with the app's settings system running).
- **`resetTestData()`** — the SDK's (a fresh engine keeping the registered repositories, the secrets emptied) plus the media store, which is what a test between tests expects; the harness calls it before each test, and a test reseeding mid-run calls it itself. **`testMediaPath(entityId?)`** names that store, or one row's folder in it, for a test asserting on seeded media — the paths themselves are the app's (`_getMediaPath`), which is why they live here and not in a pack.
- **`takeSystemErrors()`** — re-exported from `@abuddy/sdk/testing`: return and clear the `SYSTEM_ERROR` events systems reported (`message`, `source`, `stack`, …). A test that leaves one fails with `<source>: <message>`.
- **Exported types:** `PackTestOptions`, `SeedPackOptions`, `SeedRuntime`, `StartShellOptions`, `TestShell`, `TestPlugin`, `StartAppOptions`, `TestApp`, `FlowRun` (`eventTNodeIds`, `steps`), `FlowStepTrace`, `RunFlowOptions`, `PluginEvent`, `Message`.
- **`importFlows(dsl)`** — compiles flow DSL (steps name the SDK's actions and prompts by label) and imports it through the SDK's `flowRepository`, as the flow seeder does; `root: true` declares the root flow the brain starts with. It needs no dependency on default-setup.
- **`registerPack(registration)`, `unregisterPack(packId)`** — another pack in the test file's registry, as the app registers an installed one (its commands, feature settings, seeders, …); default-setup's `library-commands`, `pack-settings-defaults` and `seed-parity/edited-flows` specs use it.
- **`mockService(name, impl)`** — overlays a service in `services` for the current test; it throws outside a test (`beforeAll`, module scope), where the mock would lapse after the first test.
- **`addTestSecret(provider, label)`** — stores a key's metadata (no value) in the test host's in-memory `services.secrets`, by the host's selection rules; emptied with the rest of the test data.
- **`mockInference(reply, replies?)`** — mocks `services.inference` for the current test with `fakeInference(reply, replies)` (text, agents, and `embedding`, `image`, `speech`, `transcript` and `relevance` replies; `calls` kinds `text`, `embedding`, `image`, `speech`, `transcription`, `reranking`) (`@abuddy/sdk/testing`) and returns the fake, whose `calls` a test asserts.
- **One SDK and engine instance.** The harness imports `@abuddy/sdk` and `@abuddy/ears` externally (the published bundle keeps the shared-instance packages external for this entry and declares them peer dependencies; `scripts/bundle-package.ts` `sharedExternalEntries`) and inlines `@abuddy/host`, so its registrations are the ones the pack's code and dependency runtimes see. `setupPackTests` first checks that the pack's `@abuddy/ears` is the copy its `@abuddy/sdk` loads (`src/shared-ears.ts`, `abuddy-cli/tests/harness/shared-ears.spec.ts`): with versions that don't match, npm nests another copy under the SDK, the test runtime would install its engine there, and the pack's code would find none; the harness fails naming both copies, or asks to install `@abuddy/ears` when the pack has none. It then calls `assertCheckoutPackagesFresh` (`src/checkout-freshness.ts`), which fails naming `npm run packages:ensure` when this bundle is older than the checkout's sources — a stale bundle would load and silently test the previous `@abuddy/host`, which it inlines. For an installed package there is no checkout above it and the check is a no-op (`abuddy-cli/tests/build/checkout-freshness.spec.ts`, and `checkout-packages.spec.ts` for the checkout a pack's packages come from).
- **The seed runtime facet** (`src/__generated__/seed-runtime.ts`, bundled by `abuddy build` into `dist/build/seed-runtime.mjs` with only the shared-instance packages, `@abuddy/sdk` and `@abuddy/ears`, external) holds the pack's entity types, relation kinds, repositories and seed hooks. Everything it imports must load in a plain Node process: no `@abuddy/host` (rejected at build), no native modules, no optional SDK peers. `abuddy build` checks this for every pack (`abuddy-cli/src/build/seed-runtime-check.ts`).
- **Proofs:**
  - `tests/fixtures/external-pack` unit-tests its memo seeds, its memos system, a memo flow on default-setup's brain, its `boot.onInit`/`onShutdown` pair around a test's apps (`boot-hooks.spec.ts`), and the harness's isolation (mocks, waits and calls ended by stop, events for systems before a client connects), run by `test:external-pack`.
  - `default-setup/tests/unit/harness-app-stop.spec.ts`: a real schedule (an action step) ticks while its app runs and stops with it.
  - `abuddy-cli/tests/harness/harness-setup.spec.ts`: `vitest run --root <pack>` from elsewhere, tests that run concurrently rejected (a lone concurrent test isn't), a second `setupPackTests` in one process (vitest `isolate: false`) rejected naming why, `abuddy add feature` adding the setup to a pack without one.
  - `abuddy-cli/tests/cli/scaffold-unit-test-setup.spec.ts`: that setup keeps any config vitest loads (`vitest.config.*`, `vite.config.*`), adds `@abuddy/testing` at the pack's `@abuddy/sdk` range (the two release at one version, and `@abuddy/testing` peers on `^<version>`), and names the upgrade for an `@abuddy/testing` without `./harness` or off the SDK range, or a vitest before 3.
  - `test:packaged-authoring` also type-checks the packed declarations with `skipLibCheck: false`, failing unless tsc checked the probe and every error is in other packages' declarations.
  - `abuddy-cli/tests/harness/dependency-runtime.spec.ts` runs default-setup's systems, and the app's settings beside them, from a dependent pack.
  - `test:packaged-authoring` runs a system test, a service test with structured output and an `llm` flow, with `inference` mocked by `mockInference`, all from the packed tarballs.
  - default-setup's own unit suite runs on the harness.

## Setup for external packs

```bash
cd /path/to/my-pack
abuddy init-tests    # playwright.config.ts + tests/e2e/smoke.spec.ts; adds @abuddy/testing + @playwright/test
npm install
abuddy test          # first run asks which app to test against
```

No monorepo checkout, `ABUDDY_ROOT`, symlinks or PATH changes are needed.

## Which app the tests run in

`abuddy test` (source: `packages/abuddy-cli/src/commands/test.ts`, `src/app/`) resolves the app, in order:

1. `--app-root <path>` — a local AgentBuddy checkout (installed and built)
2. `--app beta` — the newest AgentBuddy Beta release (from `spankyed/AgentBuddy` releases) whose version satisfies the pack's `hostVersion`. The zip is verified against its published `.sha256` and cached per version in the CLI cache dir (`~/Library/Caches/abuddy-cli/apps/beta/<version>` on macOS). macOS arm64 only.
3. `ABUDDY_APP=beta` (the env form of `--app beta`, for CI), then `ABUDDY_ROOT` — a local checkout
4. The saved choice in the CLI config (`~/Library/Preferences/abuddy-cli/config.json` on macOS)
5. First run in an interactive terminal: asks for a checkout path or the beta download and saves the answer

Without a TTY (CI, or `CI` set) it never prompts and fails with those options.

It then runs the Playwright CLI that the pack's `@abuddy/testing` resolves (never `npx playwright`), so the runner and the fixture share one `@playwright/test`. It passes the fixture:

- `ABUDDY_ROOT` (checkout) or `ABUDDY_APP_EXECUTABLE` (packaged app, e.g. `AgentBuddy Beta.app/Contents/MacOS/AgentBuddy Beta`)
- `PACK_DIR` — the pack directory
- `ABUDDY_CLI` — its own bin, which the fixture uses to build the pack
- `NODE_OPTIONS` without `--conditions=@abuddy/source`: the runner, the fixture and the app it launches all load the `@abuddy` packages' built `dist`, as a pack does. `abuddy test` first runs the checkout's `packages:ensure` when the pack's packages are a checkout's (`abuddy-cli/src/build/checkout-packages.ts`), so that `dist` is the checkout's current sources; the Playwright and vitest entries check it again themselves for a run started directly.

Every non-Playwright arg is forwarded (`abuddy test -g "renders"`, `abuddy test smoke`).

## How the fixture finds AgentBuddy

The fixture launches, in priority order: `createTest({ appExecutable })`, `createTest({ appRoot })`, `ABUDDY_APP_EXECUTABLE`, `ABUDDY_ROOT`, then the monorepo enclosing `@abuddy/testing` (auto-detected by walking up to `packages/entry-point.mjs`). A checkout is validated first (`packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, `packages/renderer/dist`) so a stale or unbuilt checkout gets a clear list of what's missing.

## Fixture lifecycle

### Worker setup (`electronApp` fixture, shared across tests)

0. **Isolated data dir** — every worker creates a fresh temp dir (`$TMPDIR/abuddy-e2e-*`) and launches the app with `ABUDDY_USER_DATA_DIR` pointing at it. Nothing leaks between runs, other installed packs never load, and the developer's `abuddy-test` dir is untouched. The dir is removed after the worker finishes (`E2E_KEEP_DATA=1` keeps it and logs its path). Boot time is unchanged (~1.4–1.9s launch → connected, logged as `[e2e] app connected …`).

1. **Pack build/install** (if `PACK_DIR` is set):
   - Parse `abuddy.json` from `PACK_DIR` → extract pack `id` and `pluginIds`
   - Always rebuild the pack with `abuddy build` (a stale `dist/` would otherwise be tested silently), including while `abuddy dev` runs for that pack: its marker means a dev server is up, not that `dist/` is current (N4 in `docs/archive/issues/postmortem-external-pack-calendar-extraction.md`). `PACK_ARCHIVE` skips the build and installs that packed `.tgz` as it is, so a run can exercise the artifact a release ships (`tests/scripts/test-packaged-authoring.sh` step 8), and is refused when it is older than the pack's `dist/`; everything else still comes from `PACK_DIR`
   - Install it into the worker's data dir with `installPackFromLocal()` — the same stage → verify → place bundle path users get — passing `hostVersion`: the launched app's version (`src/app-version.ts`: the checkout's `package.json`, or the packaged app's `Resources/app/package.json` / `resources/app/package.json`), so a pack whose manifest `hostVersion` excludes it fails to install
   - It passes no `packFormat`. Whether the app can read a pack's build is the app's to decide, and it decides at boot, naming which side is older; the fixture reports that verdict (step 6) instead of forming its own. It has no way to form one: the app's `host.json` is written at its first boot, after this install, the CLI running the fixture needn't be the app's, and inferring the app's format from an artifact it ships (a built-in pack's snapshot) refuses good packs whenever that artifact is the stale one. `packs/runtime/load-messages.spec.ts` pins that a refusal reaches the fixture as a line it matches
   - Build uses `ABUDDY_CLI` (set by `abuddy test`), else the `@abuddy/cli` the pack resolves, else the checkout's; it runs as `node <bin> build`
   - After the app connects, the fixture fails the test if the pack's installed-packs entry has a `lastError` (its data failed to seed)

2. **Launch Electron** — for a checkout, resolves `electron` from the checkout's `node_modules` and calls `_electron.launch({ executablePath, args: [appRoot], cwd: appRoot })`; for a packaged app, launches its executable with no args. Packs never need `electron` installed. The env (`src/launch-env.ts`) is the runner's without `ELECTRON_RUN_AS_NODE` (set when the app-bundled `abuddy` runs on the app's runtime; inherited, it would start Electron as plain Node) and without the `@abuddy/source` condition in `NODE_OPTIONS`, plus `PLAYWRIGHT_TEST=true`, which makes the app use the `test` environment (a packaged beta included), and `ABUDDY_USER_DATA_DIR`.

3. **Debug logging** (if `DEBUG_E2E=1`): pipes Electron's stdout/stderr to the test terminal with `[electron]` prefix

### Test setup (`appPage` fixture, per test)

4. **Find main window** — polls Electron windows for `window.applicationState` (the XState actor). Distinguishes the main renderer from the splash screen. 45s timeout. Sets the viewport to 1400×900.

5. **Wait for connected state** — checks `applicationState.getSnapshot().value` for `{ running: 'connected' }` or onboarding state. Bypasses onboarding via `window.__disableOnboardingUI()` if detected.

6. **Pack backend check** (if `PACK_DIR` is set) — waits for the loader's verdict on the pack, read from the app's output. Those lines are a contract, `PACK_LOAD_MESSAGES` in `@abuddy/host/packs`, imported by both the loader that writes them and this fixture, so a reword is a change to both. It is the only signal a backend-only pack leaves: it registers no plugin, and the loaded packs the renderer is served leave out packs with no frontend files.
6. **Pack plugin waiting** (if `PACK_DIR` is set) — for each plugin ID from the manifest, waits for it to appear in `applicationState.getSnapshot().context.plugins`. A `console.error` listener detects `[pack-loader] Failed to load FE entry pack://<packId>/...` for the pack under test and fails the test immediately with the captured renderer and Electron/API errors, instead of timing out. A plugin that never registers also fails with those errors attached.

### Test setup (`app` fixture, per test)

7. **Provide AppHelper** — wraps the page with high-level methods (`navigate`, `screenshot`, `getState`, etc.). Screenshots go to the resolved `screenshotDir`.

### Teardown

- Per-test: `pageerror` and `console` listeners are removed
- Per-worker: `electronApp.close()` shuts down Electron

## API reference

### Fixtures

| Fixture       | Scope  | Description |
|---------------|--------|-------------|
| `electronApp` | worker | Launched Electron app (shared across tests in a worker) |
| `appPage`     | test   | Main renderer Page (waits for `running.connected`, bypasses onboarding) |
| `app`         | test   | `AppHelper` — high-level API |

### AppHelper methods

| Method | Description |
|--------|-------------|
| `screenshot(name)` | Save PNG to screenshots directory as `{name}.png` |
| `navigate(pluginId)` | Send `SELECT_PLUGIN` event, wait for `activePlugin` match, 500ms render delay |
| `getState()` | Returns `snapshot.value` (e.g. `{ running: 'connected' }`) |
| `getContext()` | Returns `{ activePluginId, pluginIds }` |
| `sendEvent(event)` | Send any event object to `applicationState` |
| `waitForState(check, ms?)` | Wait for dot-separated state path (e.g. `'running.connected'`), default 10s |
| `waitForPlugin(pluginId, ms?)` | Wait for a plugin to appear in the plugin list, default 30s |

### `createTest(options?)`

Factory for when auto-detection isn't enough:

```ts
import { createTest } from '@abuddy/testing';

const { test, expect } = createTest({
  appRoot: '/custom/path/to/AgentBuddy',      // override app root resolution
  screenshotDir: './my-screenshots',            // override screenshot output directory
});
```

## Screenshots

Screenshot output location depends on context:

| Context | Screenshot directory |
|---------|---------------------|
| `PACK_DIR` is set | `{PACK_DIR}/tests/screenshots/` |
| `screenshotDir` option passed | The specified directory |
| Default (monorepo) | `{cwd}/tests/screenshots/` |

## Environment variables

| Variable | Description |
|----------|-------------|
| `ABUDDY_ROOT` | A built AgentBuddy checkout to launch. Set by `abuddy test` for checkouts; auto-detected inside the monorepo. |
| `ABUDDY_APP_EXECUTABLE` | A packaged AgentBuddy executable to launch. Set by `abuddy test --app beta`. |
| `ABUDDY_CLI` | The abuddy bin that builds the pack. Set by `abuddy test`. |
| `ABUDDY_APP` | `beta`: `abuddy test` and `abuddy build` use the newest matching AgentBuddy Beta (CI; the scaffolded release workflow sets it). |
| `PACK_DIR` | Path to an external pack directory. Triggers build/install and plugin waiting. |
| `PACK_ARCHIVE` | A packed `<id>-<version>.tgz` to install instead of building `PACK_DIR`, so the run tests what a release ships. Refused when it is older than the pack's `dist/`: skipping the rebuild is for testing the shipped artifact, not for testing a stale one. |
| `E2E_KEEP_DATA` | Set to `1` to keep each worker's temp data dir for debugging. |
| `PLAYWRIGHT_TEST` | Set automatically to `'true'` by the fixture. The app resolves the `test` environment (`abuddy-test` name, lock and data dir), crashes on uncaught errors, and runs headless (suppresses window display and splash screen). |
| `ABUDDY_USER_DATA_DIR` | Optional. Overrides the app's data dir (e.g. an isolated temp dir); read through `@abuddy/sdk/env`. |
| `DEBUG_E2E` | Set to `1` to pipe Electron stdout/stderr to the test terminal. |

## Running tests

```bash
abuddy test                          # the saved app (asks on first run)
abuddy test --app-root ~/AgentBuddy  # a local checkout
abuddy test --app beta               # the newest matching AgentBuddy Beta
abuddy test -g "renders"             # Playwright args are forwarded
```

From the AgentBuddy monorepo, run Playwright directly (the app is auto-detected):

```bash
npm test                                              # monorepo E2E
PACK_DIR=/path/to/my-pack npm test -- tests/e2e/scratch
```

## Key implementation details

- **Electron binary resolution**: for a checkout the fixture uses `createRequire(appRoot + '/package.json')` to resolve `electron` from its `node_modules`; a packaged app is its own executable. Packs don't need `electron` installed.
- **App root validation**: `validateAppRoot()` checks for `packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, and `packages/renderer/dist` before attempting to launch. Missing files produce a clear error listing exactly what's needed, rather than an opaque Electron crash.
- **Data dir alignment**: The fixture installs into `resolveAppContext({ env: 'test', userDataDir }).packsDir` for the worker's temp dir and passes that dir as `ABUDDY_USER_DATA_DIR`. The Electron app launched with `PLAYWRIGHT_TEST=true` infers the `test` environment in `packages/main/src/app-context.ts`, which sets the app name and `userData` from the same resolver (`@abuddy/sdk/env`) and passes `ABUDDY_ENV` / `ABUDDY_USER_DATA_DIR` to the API process, so both sides always agree.
- **Pinned viewport**: the fixture sets the main window viewport to 1400×900. The window's default size depends on whether main was built in dev or production mode, so without this, layout and `toHaveScreenshot` baselines differ between `npm start` builds and `npm run build`/CI.
- **Pack manifest caching**: `getPackManifest()` reads and parses `abuddy.json` once per process, cached at module scope. Plugin IDs are the `features[].id` of features with a `plugin` (the manifest's `plugin` has no `id`).
- **Dev server marker**: `abuddy dev` writes `{devUserDataDir}/pack-dev-servers/{packId}.json` containing `{ port, pid }` for the dev app's HMR. The E2E fixture ignores it: tests always run a fresh build in an isolated data dir.
- **`pack://` protocol**: Custom Electron protocol (`packages/main/src/modules/pack-protocol/PackProtocol.ts`) that reads the marker through `devServerUrl` (`@abuddy/host/packs/dev-server`) and proxies to the Vite dev server if present, otherwise serves files from disk.
