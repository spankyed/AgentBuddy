# E2E Tests

Playwright tests that launch the full Electron app, interact with the XState application state machine, and take screenshots for visual verification.

## Quick start

```bash
npm test                              # All tests
npm test -- smoke                    # Single file
npm test -- -g "screenshot"          # By test name grep
DEBUG_E2E=1 npm test                  # Electron process output to terminal
```

Screenshots saved to `tests/screenshots/{name}.png` (gitignored).

## Rules for agents

- **Never kill processes by broad pattern** (`pkill -f Electron`, `pkill -f node`, `killall Electron`, …). The user runs dev and prod AgentBuddy alongside tests, and a broad kill takes those down. If a test run hangs, stop only the process you started (its PID).
- **E2E runs alongside dev and prod apps.** Tests use the `abuddy-test` app name and a fresh temp data dir per worker (`$TMPDIR/abuddy-e2e-*`, via `ABUDDY_USER_DATA_DIR`), so no running app needs to be closed first. Don't claim otherwise — just run the tests.
- **Investigate a failing assertion before changing it.** Find out why it fails (`DEBUG_E2E=1`, `app.getContext()`, probing actor state with `appPage.evaluate`) and fix the cause. Loosening one to go green once removed the only backend check and hid the real cause (docs/archive/issues/postmortem-external-pack-calendar-extraction.md, item 1).
- **The app under test is built, not source.** `npm test` does not rebuild it, so a backend edit is not in
  the run until `npm run build:be`. See [Debugging the running app](#debugging-the-running-app), which also
  covers instrumenting a path and getting the output back.
- **Each worker starts from an empty data dir, but tests in a worker share it.** Anything a test creates is visible to later tests in the same run; assert on unique values and clean up what you create. `E2E_KEEP_DATA=1` keeps the dir for inspection.

## How the fixture works

The test infrastructure lives in `@abuddy/testing` (source: `packages/abuddy-testing/src/index.ts`). The local `tests/e2e/fixtures/app.ts` is a thin re-export. Tests import from `./fixtures/app` so the indirection is invisible.

### Startup lifecycle

When a test worker starts, the fixture runs this sequence:

1. **Resolve the app** — `resolveApp()` (when `createTest()` runs, at import) takes the first of: `createTest({ appExecutable })`, `createTest({ appRoot })`, `ABUDDY_APP_EXECUTABLE`, `ABUDDY_ROOT`, then auto-detection, walking up from the `@abuddy/testing` package directory for `packages/entry-point.mjs` (always works inside the monorepo). An executable must exist. A checkout goes through `validateAppRoot()`, which checks for `packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist` and `packages/renderer/dist` and throws listing what's missing.

2. **Pack setup** (only when `PACK_DIR` is set):
   - Read `abuddy.json` from `PACK_DIR` to get the pack ID and plugin IDs
   - Always rebuild the pack with `node <abuddy bin> build` (the bin is `ABUDDY_CLI`, else the `@abuddy/cli` the pack resolves, else the checkout's)
   - Install it into the worker's temp data dir with the pack installer (stage → verify → place), passing the launched app's version (the checkout's `package.json`, or the packaged app's `Resources/app/package.json`) so a pack whose `hostVersion` excludes it fails to install

3. **Launch Electron** — for a checkout, resolves `electron` from the checkout's `node_modules` (so external packs don't need `electron` installed) and launches `_electron.launch({ executablePath, args: [<appRoot>], cwd: appRoot })`; a packaged app launches its executable with no args. The env is the runner's minus `ELECTRON_RUN_AS_NODE` (inherited from an app-bundled `abuddy`, it would start Electron as plain Node) and minus the `@abuddy/source` condition in `NODE_OPTIONS`, plus `PLAYWRIGHT_TEST=true` and `ABUDDY_USER_DATA_DIR=<worker dir>` (`src/launch-env.ts`). `PLAYWRIGHT_TEST` selects the `test` environment, a packaged build included; the app runs headless (no window display or splash screen) and crashes on uncaught exceptions.

4. **Find main window** — `findMainWindow()` polls all Electron windows for `window.applicationState` (the XState actor exposed on the renderer's `window`). This distinguishes the main renderer from the splash screen. Timeout: 45s. The viewport is then pinned to 1400×900, since the window's default size differs between dev and production builds of main.

5. **Wait for connected state** — `page.waitForFunction()` checks `applicationState.getSnapshot().value` for `{ running: 'connected' }` or `{ onboarding: ... }` (45s). If onboarding is detected, calls `window.__disableOnboardingUI()` then waits for `running.connected`.

6. **Check the pack's seeding** (only when `PACK_DIR` is set) — if the pack's entry in the test data dir's `installed-packs.json` has a `lastError` (its data failed to seed), the fixture fails with it.

7. **Wait for pack plugins** (only when `PACK_DIR` is set) — For each plugin ID from the manifest, waits for it to appear in `applicationState.getSnapshot().context.plugins`. If the renderer logs `[pack-loader] Failed to load FE entry pack://{packId}/…` for the pack under test, the test fails immediately. That failure, and a plugin that never registers, include the captured renderer errors and Electron/API error lines, so `DEBUG_E2E=1` is rarely needed to find the cause.

8. **Provide the `appPage` and `app` fixtures** to the test.

### Teardown

After each test, `pageerror` and `console` listeners are removed to prevent accumulation. After all tests in the worker complete, `electronApp.close()` shuts down the Electron process.

## Fixture API

Three fixtures are provided, each at a different scope:

| Fixture        | Scope  | Description |
|----------------|--------|-------------|
| `electronApp`  | worker | The launched Electron app (shared across tests in a worker) |
| `appPage`      | test   | The main renderer Page (waits for `running.connected`, bypasses onboarding) |
| `app`          | test   | `AppHelper` — high-level API below |

### AppHelper methods

```ts
app.screenshot(name)             // Save PNG to tests/screenshots/{name}.png
app.navigate(pluginId)           // Send SELECT_PLUGIN + wait for activePlugin match + 500ms render delay
app.getState()                   // Returns snapshot.value (e.g. { running: 'connected' })
app.getContext()                 // Returns { activePluginId, pluginIds }
app.sendEvent(event)             // Send any event to applicationState
app.waitForState(check, ms?)     // Wait for dot-separated state path (e.g. 'running.connected')
app.waitForPlugin(pluginId, ms?) // Wait for a plugin to appear in the plugin list (default 30s)
```

### Direct page access

`appPage` is a standard Playwright `Page`. Use it for DOM queries:

```ts
await appPage.locator('.some-selector').click();
await appPage.waitForSelector('.loaded-indicator');
```

## Plugin IDs

Available for `app.navigate()`: `threads` (default), `code`, `notes`, `browser`, `library`, `flows`, `actions`, `prompts`, `brain`, `database`, `logs`, `settings`.

## Writing tests

Import from the local fixtures, not from `@playwright/test`:

```ts
import { test, expect } from './fixtures/app';

test('verify my change', async ({ app }) => {
  await app.navigate('code');
  await app.screenshot('code-after-change');
});
```

## Ad-hoc testing (scratch file)

For one-off visual verification, use `tests/e2e/scratch.spec.ts` (gitignored — won't be committed):

```ts
import { test, expect } from './fixtures/app';

test('check something', async ({ app, appPage }) => {
  await app.navigate('notes');
  await appPage.locator('.note-item').first().click();
  await app.screenshot('scratch-notes-detail');
});
```

Run with: `npm test -- tests/e2e/scratch`

Create it fresh each time you need to visually verify something. Delete when done.

## Debugging the running app

Use this when a bug only appears in the real app — a hang, a dropped event, something whose cause you
can't settle by reading. Reading twice and guessing twice costs more than one instrumented run: two
separate explanations for one such bug were argued from the source and both were wrong, and a single
`console.error` in the failing path settled it in one cycle
(`fix(packs): list a pack before registering its contributions`, whose message records both wrong answers).

### The app under test is built, not source

This is the thing that wastes a cycle. `npm test` runs `packages:ensure` and then Playwright — it does
**not** rebuild the app. Electron launches built output, so an edit to backend source is not in the run
unless you rebuild first:

| You edited | Rebuild with |
|---|---|
| `packages/abuddy-host/src/**`, `packages/abuddy-sdk/src/**`, `packages/api/src/**` | `npm run build:be` (bundles them into the API) |
| `packages/renderer/src/**` | `npm run build -w @app/renderer` |
| `packages/main/src/**`, `packages/preload/src/**` | `npm run build -w @app/main`, `-w @app/preload` |
| a built-in pack (`packages/default-setup/**`) | `npm run compile` |

A first instrumented run that prints nothing usually means this, not that the line wasn't reached.

### Getting output back

`DEBUG_E2E=1` pipes the Electron and API stdout/stderr into the test terminal. `console.error` from the
API process arrives prefixed `[API Server Error]:`, `console.log` as `[API Server]:`.

Pick a unique tag so you can extract the lines whatever else is logging, and print a timestamp — the
app is several processes and the interleaving is what you are usually trying to establish:

```ts
console.error(`[DROPDBG] t=${Date.now()} plugin=${pluginId} keys=[${[...map.keys()].join('|')}]`);
```

```bash
npm run build:be && DEBUG_E2E=1 npm test -- tests/e2e/plugin-sends.spec.ts --grep "restarted pack" \
  2>&1 | grep -oE "\[DROPDBG\] t=[0-9]+ .*" | head -20
```

`--grep "<title substring>"` runs one test, which keeps a cycle at seconds rather than minutes.

Print **state, not just arrival**. "It was dropped" says nothing; the keys of the map it was checked
against, at a timestamp, says which moment the code was in. Instrument both sides of a suspected
window — the thing that moves and the thing that observes it — so the ordering is in the output rather
than in your head.

### Putting it back

Instrumentation is temporary and must not reach a commit. Copy the file to your scratchpad first, and
restore from that copy rather than by hand or with `git checkout`:

```bash
SC=<your scratchpad>
cp packages/abuddy-host/src/bus/machine.ts "$SC/machine.orig"
# …instrument, build, run, read…
cp "$SC/machine.orig" packages/abuddy-host/src/bus/machine.ts
git status --porcelain   # confirm nothing of yours is left behind
```

`git checkout -- .` has wiped a session's uncommitted work in this repo. Restore the one file you
touched, never the tree.

### Driving the app, not just watching it

The fixture is an app driver: `app.navigate(pluginId)`, `app.sendEvent(...)`, `app.getContext()`,
`app.waitForState(...)`, and `appPage.evaluate()` for anything reachable from the renderer. A scratch
test (see above) that navigates to the screen, does the thing and waits is usually a faster reproducer
than the real test you are chasing, and it is gitignored.

For backend endpoints the renderer doesn't call, read the port and token from the page and `fetch`
them from the test — `tests/e2e/plugin-sends.spec.ts` does this for `POST /dev/reload`.

## Testing external packs

There are two ways to test external packs:

### 1. From the pack's own repo (preferred for pack developers)

Pack developers can write and run E2E tests without the AgentBuddy repo. The fixture is `@abuddy/testing`. See `packages/abuddy-testing/CLAUDE.md` for the full guide.

```bash
cd /path/to/my-pack
abuddy init-tests          # scaffold config + sample test, add @abuddy/testing + @playwright/test
npm install
abuddy test                # first run: choose a local checkout or the AgentBuddy Beta download
abuddy test --app beta     # CI: never prompts, use --app beta or --app-root <path>
```

### 2. From this repo (quick iteration)

Set `PACK_DIR` to test an external pack using the monorepo's test runner. No setup needed in the pack — the fixture handles everything:

```bash
# Run against a scratch test
PACK_DIR=/path/to/my-pack npm test -- tests/e2e/scratch

# Run against any test file
PACK_DIR=/path/to/my-pack npm test -- tests/e2e/smoke
```

#### What happens when `PACK_DIR` is set

1. **Read manifest** — parses `abuddy.json` from `PACK_DIR` to get the pack ID and plugin IDs
2. **Isolated data dir** — creates `$TMPDIR/abuddy-e2e-*` for the worker
3. **Build**: always runs `abuddy build` in the pack directory (fails the run if the build fails)
4. **Install** — installs the built pack into that data dir through the pack installer; no other packs are present
5. **Launch Electron** — starts the app, which discovers the pack in its packs directory
6. **Check seeding** — fails if the pack's installed-packs entry has a `lastError`
7. **Wait for plugins** — for each plugin ID from the manifest, waits up to 30s for it to appear in `applicationState.context.plugins`. Fails immediately, with the captured errors, if the pack's FE entry fails to load.

The in-repo fixture pack at `tests/fixtures/external-pack` exercises this whole path from its own directory: `npm run test:external-pack`.

### Finding plugin IDs

Plugin IDs are the `features[].id` of the pack's `abuddy.json` features that declare a `plugin` (the manifest's `plugin` object has no `id` of its own).

## Renderer globals

The renderer exposes on `window`:

- `applicationState` — full XState actor (`.send()`, `.getSnapshot()`, `.system`)
- `__disableOnboardingUI()` — sends `ONBOARDING_COMPLETE` (fixture calls this automatically)

## Environment variables

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_TEST=true` | Set automatically by the fixture; crashes on uncaught errors and runs headless (no window display) |
| `DEBUG_E2E=1` | Pipes Electron stdout/stderr to the test terminal |
| `PACK_DIR=/path/to/pack` | Builds the pack, installs it into the worker's isolated data dir, waits for plugins before tests run |
| `E2E_KEEP_DATA=1` | Keep each worker's temp data dir (path is logged) |
| `ABUDDY_ROOT=/path/to/AgentBuddy` | A built AgentBuddy checkout to launch (auto-detected inside the monorepo) |
| `ABUDDY_APP_EXECUTABLE=/path/to/exe` | A packaged AgentBuddy executable to launch (set by `abuddy test --app beta`); wins over `ABUDDY_ROOT` |
| `ABUDDY_CLI=/path/to/abuddy.mjs` | The abuddy bin that builds `PACK_DIR` (set by `abuddy test`) |
| `ABUDDY_APP=beta` | Read by `abuddy test` (and `abuddy build`), not the fixture: use the newest matching AgentBuddy Beta without prompting (CI) |

## Key events for sendEvent()

```ts
{ type: 'SELECT_PLUGIN', pluginId: string }   // Switch active plugin
{ type: 'NAVIGATE_BACK' }                     // History back
{ type: 'NAVIGATE_FORWARD' }                  // History forward
{ type: 'DEFAULT_TOGGLE', area: 'canvas' }    // Toggle canvas visibility
{ type: 'TOGGLE_INSPECTION_PANEL' }           // Toggle side panel
{ type: 'MAXIMIZE_CHAT' }                     // Maximize chat panel
{ type: 'RESTORE_CHAT' }                      // Restore chat panel size
```

## File map

| File | Purpose |
|------|---------|
| `fixtures/app.ts` | Thin re-export from `@abuddy/testing` |
| `smoke.spec.ts` | Basic tests: app launches, reaches connected state, plugins load, default screenshot, per-worker isolated data dir |
| `navigation.spec.ts` | Navigate between plugins, screenshot each |
| `secrets.spec.ts` | Settings → Secrets: adds and selects API keys, and checks the key strings reach no log, stored file or renderer state |
| `import-pack-seeds.spec.ts` | Settings → Import Pack Seeds: compiles default-setup's notes and library entries into a seeds directory, previews it, imports a selection, re-imports in keep-existing mode |
| `plugin-sends.spec.ts` | Backend sends to plugins through the bus: the code system's file watcher and terminal output, and the browser system's startup data after a pack reload, reach their plugins (recorded with `applicationState.system.inspect`) |
| `api-access.spec.ts` | The API refuses WebSocket connections and `POST /dev/reload` without the run's token (the socket offers it as a subprotocol, not in the URL), takes them with it, and survives a malformed upgrade request |
| `dev-reload.spec.ts` | `POST /dev/reload` of the built-in pack re-seeds changed seed data and resends startup data |
| `db-cli.spec.ts` | `abuddy db` on the running app's data dir (`electronApp`'s `userData`): a query reads it with a stale-data warning, `exec` and `reset` are refused |
| `scratch.spec.ts` | Ad-hoc test file (gitignored — create as needed) |
| `packages/abuddy-testing/src/index.ts` | The actual fixture source (shared between monorepo and external packs) |
