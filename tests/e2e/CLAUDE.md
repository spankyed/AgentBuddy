# E2E Tests

Playwright tests that launch the full Electron app, interact with the XState application state machine, and take screenshots for visual verification.

## Quick start

```bash
npm test                              # All tests
npx playwright test smoke             # Single file
npx playwright test -g "screenshot"   # By test name grep
DEBUG_E2E=1 npm test                  # Electron process output to terminal
```

Screenshots saved to `tests/screenshots/{name}.png` (gitignored).

## Rules for agents

- **Never kill processes by broad pattern** (`pkill -f Electron`, `pkill -f node`, `killall Electron`, …). The user runs dev and prod AgentBuddy alongside tests, and a broad kill takes those down. If a test run hangs, stop only the process you started (its PID).
- **E2E runs alongside dev and prod apps.** Tests use the `abuddy-test` app name, single-instance lock and data dir (`~/Library/Application Support/abuddy-test/`), so no running app needs to be closed first. Don't claim otherwise — just run the tests.
- **Investigate a failing assertion before changing it.** Find out why it fails (`DEBUG_E2E=1`, `app.getContext()`, probing actor state with `appPage.evaluate`) and fix the cause. Loosening one to go green once removed the only backend check and hid the real cause (docs/issues/postmortem-external-pack-calendar-extraction.md, item 1).
- **The test data dir persists across runs.** Anything a test creates accumulates; assert on unique values and clean up what you create.
- **`abuddy` may be a shell alias** for opening the installed app. Call `node_modules/.bin/abuddy` by path.

## How the fixture works

The test infrastructure lives in `@abuddy/sdk/testing` (source: `packages/abuddy-sdk/src/testing/index.ts`). The local `tests/e2e/fixtures/app.ts` is a thin re-export. Tests import from `./fixtures/app` so the indirection is invisible.

### Startup lifecycle

When a test worker starts, the fixture runs this sequence:

1. **Resolve and validate app root** — `resolveAppRoot()` checks `ABUDDY_ROOT` env var, then auto-detects by walking up from the SDK package directory looking for `packages/entry-point.mjs`. Inside the monorepo, auto-detection always works. Once resolved, `validateAppRoot()` checks for required files (`packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, `packages/renderer/dist`) and throws a clear error if anything is missing.

2. **Pack setup** (only when `PACK_DIR` is set):
   - Read `abuddy.json` from `PACK_DIR` to get the pack ID and plugin IDs
   - Check for a `.dev` signal file in the dev packs directory (`~/Library/Application Support/abuddy-dev/packs/{packId}/.dev`). If present, `abuddy dev` is running — skip build/sync
   - If no `.dev` signal: always rebuild the pack (using the `abuddy build` CLI binary), then sync the pack files to the test packs directory (`~/Library/Application Support/abuddy-test/packs/`; recursive copy, skipping symlinks, `node_modules`, and `.git`)

3. **Launch Electron** — resolves the `electron` binary from `appRoot/node_modules/electron` (so external packs don't need `electron` installed), then launches with `_electron.launch({ executablePath, args: ['.'], cwd: appRoot })` and `PLAYWRIGHT_TEST=true`. The Electron app starts the same as dev mode but headless (no window display or splash screen) and with error handling set to crash immediately on uncaught exceptions.

4. **Find main window** — `findMainWindow()` polls all Electron windows for `window.applicationState` (the XState actor exposed on the renderer's `window`). This distinguishes the main renderer from the splash screen. Timeout: 45s.

5. **Wait for connected state** — `page.waitForFunction()` checks `applicationState.getSnapshot().value` for `{ running: 'connected' }` or `{ onboarding: ... }`. If onboarding is detected, calls `window.__disableOnboardingUI()` then waits for `running.connected`.

6. **Wait for pack plugins** (only when `PACK_DIR` is set) — For each plugin ID from the manifest, waits for it to appear in `applicationState.getSnapshot().context.plugins`. If the renderer logs `[pack-loader] Failed to load FE entry pack://{packId}/…` for the pack under test, the test fails immediately. That failure, and a plugin that never registers, include the captured renderer errors and Electron/API error lines, so `DEBUG_E2E=1` is rarely needed to find the cause.

7. **Provide the `appPage` and `app` fixtures** to the test.

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

Run with: `npx playwright test tests/e2e/scratch`

Create it fresh each time you need to visually verify something. Delete when done.

## Testing external packs

There are two ways to test external packs:

### 1. From the pack's own repo (preferred for pack developers)

Pack developers can write and run E2E tests without touching the AgentBuddy repo. The fixture is available as `@abuddy/sdk/testing`. See `packages/abuddy-sdk/src/testing/CLAUDE.md` for the full external pack testing guide.

```bash
cd /path/to/my-pack
abuddy init-tests                                        # scaffold config + sample test, link SDK
npm i -D @playwright/test
export ABUDDY_ROOT=/path/to/AgentBuddy                   # add to shell profile
abuddy test                                              # run tests
```

### 2. From this repo (quick iteration)

Set `PACK_DIR` to test an external pack using the monorepo's test runner. No setup needed in the pack — the fixture handles everything:

```bash
# Run against a scratch test
PACK_DIR=/path/to/my-pack npx playwright test tests/e2e/scratch

# Run against any test file
PACK_DIR=/path/to/my-pack npx playwright test tests/e2e/smoke
```

#### What happens when `PACK_DIR` is set

1. **Read manifest** — parses `abuddy.json` from `PACK_DIR` to get the pack ID and plugin IDs
2. **Check for `abuddy dev`** — looks for a `.dev` signal file at `~/Library/Application Support/abuddy-dev/packs/{packId}/.dev`
   - **If `.dev` exists** (`abuddy dev` is running): skips build/sync entirely — the pack is already installed and served by the Vite dev server via the `pack://` protocol
   - **If no `.dev`**: continues to step 3
3. **Build**: always runs `abuddy build` in the pack directory (fails the run if the build fails)
4. **Sync** — copies the pack files (excluding `node_modules`, `.git`, symlinks) to the test packs directory (`~/Library/Application Support/abuddy-test/packs/{packId}/`)
5. **Launch Electron** — starts the app, which discovers the pack in its packs directory
6. **Wait for plugins** — for each plugin ID from the manifest, waits up to 30s for it to appear in `applicationState.context.plugins`. Fails immediately, with the captured errors, if the pack's FE entry fails to load.

The in-repo fixture pack at `tests/fixtures/external-pack` exercises this whole path from its own directory: `npm run test:external-pack`.

### Finding plugin IDs

Plugin IDs come from the pack's `abuddy.json` → `features[].plugin.id` (or `features[].id` as fallback).

## Renderer globals

The renderer exposes on `window`:

- `applicationState` — full XState actor (`.send()`, `.getSnapshot()`, `.system`)
- `__disableOnboardingUI()` — sends `ONBOARDING_COMPLETE` (fixture calls this automatically)

## Environment variables

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_TEST=true` | Set automatically by the fixture; crashes on uncaught errors and runs headless (no window display) |
| `DEBUG_E2E=1` | Pipes Electron stdout/stderr to the test terminal |
| `PACK_DIR=/path/to/pack` | Syncs pack to dev packs dir (builds if no `dist/`), waits for plugins before tests run |
| `ABUDDY_ROOT=/path/to/AgentBuddy` | Path to the AgentBuddy monorepo (auto-detected inside the monorepo) |

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
| `fixtures/app.ts` | Thin re-export from `@abuddy/sdk/testing` |
| `smoke.spec.ts` | Basic tests: app launches, reaches connected state, plugins load, default screenshot |
| `navigation.spec.ts` | Navigate between plugins, screenshot each |
| `scratch.spec.ts` | Ad-hoc test file (gitignored — create as needed) |
| `packages/abuddy-sdk/src/testing/index.ts` | The actual fixture source (shared between monorepo and external packs) |
