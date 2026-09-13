# @abuddy/testing

Reusable Playwright E2E test fixture for AgentBuddy. Extracted from the monorepo's test infrastructure so both the host app and external packs share the same fixture code.

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

All test files (`smoke.spec.ts`, `navigation.spec.ts`) import from `./fixtures/app`. `@abuddy/testing` is the `packages/abuddy-testing` workspace package (`@abuddy/sdk/testing` remains as a deprecated re-export).

### How external packs use it

External packs add `@abuddy/testing` and `@playwright/test` as devDependencies (`abuddy init-tests` does this) and import directly:
```ts
import { test, expect } from '@abuddy/testing';
```

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
2. `--app beta` — the newest AgentBuddy Beta release (from `spankyed/AgentBuddy-releases`) whose version satisfies the pack's `hostVersion`. The zip is verified against its published `.sha256` and cached per version in the CLI cache dir (`~/Library/Caches/abuddy-cli/apps/beta/<version>` on macOS). macOS arm64 only.
3. `ABUDDY_ROOT` — a local checkout
4. The saved choice in the CLI config (`~/Library/Preferences/abuddy-cli/config.json` on macOS)
5. First run in an interactive terminal: asks for a checkout path or the beta download and saves the answer

Without a TTY (CI, or `CI` set) it never prompts and fails with those options.

It then runs the Playwright CLI that the pack's `@abuddy/testing` resolves (never `npx playwright`), so the runner and the fixture share one `@playwright/test`. It passes the fixture:

- `ABUDDY_ROOT` (checkout) or `ABUDDY_APP_EXECUTABLE` (packaged app, e.g. `AgentBuddy Beta.app/Contents/MacOS/AgentBuddy Beta`)
- `PACK_DIR` — the pack directory
- `ABUDDY_CLI` — its own bin, which the fixture uses to build the pack

Every non-Playwright arg is forwarded (`abuddy test -g "renders"`, `abuddy test smoke`).

## How the fixture finds AgentBuddy

The fixture launches, in priority order: `createTest({ appExecutable })`, `createTest({ appRoot })`, `ABUDDY_APP_EXECUTABLE`, `ABUDDY_ROOT`, then the monorepo enclosing `@abuddy/testing` (auto-detected by walking up to `packages/entry-point.mjs`). A checkout is validated first (`packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, `packages/renderer/dist`) so a stale or unbuilt checkout gets a clear list of what's missing.

## Fixture lifecycle

### Worker setup (`electronApp` fixture, shared across tests)

0. **Isolated data dir** — every worker creates a fresh temp dir (`$TMPDIR/abuddy-e2e-*`) and launches the app with `ABUDDY_USER_DATA_DIR` pointing at it. Nothing leaks between runs, other installed packs never load, and the developer's `abuddy-test` dir is untouched. The dir is removed after the worker finishes (`E2E_KEEP_DATA=1` keeps it and logs its path). Boot time is unchanged (~1.4–1.9s launch → connected, logged as `[e2e] app connected …`).

1. **Pack build/install** (if `PACK_DIR` is set):
   - Parse `abuddy.json` from `PACK_DIR` → extract pack `id` and `pluginIds`
   - Always rebuild the pack with `abuddy build` (a stale `dist/` would otherwise be tested silently)
   - Install it into the worker's data dir with `installPackFromLocal()` — the same stage → verify → place bundle path users get
   - Build uses `ABUDDY_CLI` (set by `abuddy test`), else the `@abuddy/cli` the pack resolves, else the checkout's; it runs as `node <bin> build`
   - After the app connects, the fixture fails the test if the pack's registry entry has a `lastError` (its data failed to seed)

2. **Launch Electron** — for a checkout, resolves `electron` from the checkout's `node_modules` and calls `_electron.launch({ executablePath, args: ['.'], cwd: appRoot })`; for a packaged app, launches its executable directly. Both get `PLAYWRIGHT_TEST=true`, which makes the app use the `test` environment (a packaged beta included). Packs never need `electron` installed.

3. **Debug logging** (if `DEBUG_E2E=1`): pipes Electron's stdout/stderr to the test terminal with `[electron]` prefix

### Test setup (`appPage` fixture, per test)

4. **Find main window** — polls Electron windows for `window.applicationState` (the XState actor). Distinguishes the main renderer from the splash screen. 45s timeout.

5. **Wait for connected state** — checks `applicationState.getSnapshot().value` for `{ running: 'connected' }` or onboarding state. Bypasses onboarding via `window.__disableOnboardingUI()` if detected.

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
| `PACK_DIR` | Path to an external pack directory. Triggers build/install and plugin waiting. |
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
npx playwright test                                   # monorepo E2E
PACK_DIR=/path/to/my-pack npx playwright test tests/e2e/scratch
```

## Key implementation details

- **Electron binary resolution**: for a checkout the fixture uses `createRequire(appRoot + '/package.json')` to resolve `electron` from its `node_modules`; a packaged app is its own executable. Packs don't need `electron` installed.
- **App root validation**: `validateAppRoot()` checks for `packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, and `packages/renderer/dist` before attempting to launch. Missing files produce a clear error listing exactly what's needed, rather than an opaque Electron crash.
- **Data dir alignment**: The fixture installs into `resolveAppContext({ env: 'test', userDataDir }).packsDir` for the worker's temp dir and passes that dir as `ABUDDY_USER_DATA_DIR`. The Electron app launched with `PLAYWRIGHT_TEST=true` infers the `test` environment in `packages/main/src/app-context.ts`, which sets the app name and `userData` from the same resolver (`@abuddy/sdk/env`) and passes `ABUDDY_ENV` / `ABUDDY_USER_DATA_DIR` to the API process, so both sides always agree.
- **Pinned viewport**: the fixture sets the main window viewport to 1400×900. The window's default size depends on whether main was built in dev or production mode, so without this, layout and `toHaveScreenshot` baselines differ between `npm start` builds and `npm run build`/CI.
- **Pack manifest caching**: `getPackManifest()` reads and parses `abuddy.json` once per process, cached at module scope. Plugin IDs are extracted from `features[].plugin.id` with fallback to `features[].id`.
- **`.dev` signal file**: Written by `abuddy dev` at `{devPacksDir}/{packId}/.dev` containing `{ port, pid }` for the dev app's HMR. The E2E fixture ignores it: tests always run a fresh build in an isolated data dir.
- **`pack://` protocol**: Custom Electron protocol (`packages/main/src/modules/pack-protocol/PackProtocol.ts`) that checks for `.dev` and proxies to the Vite dev server if present, otherwise serves files from disk.
