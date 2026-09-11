# @abuddy/sdk/testing

Reusable Playwright E2E test fixture for AgentBuddy. Extracted from the monorepo's test infrastructure so both the host app and external packs share the same fixture code.

## Architecture

This module (`packages/abuddy-sdk/src/testing/index.ts`) is the single source of truth for the E2E fixture. It exports:

- **`test`** and **`expect`** — Playwright test objects with three custom fixtures (`electronApp`, `appPage`, `app`) pre-configured. Uses auto-detection to find the AgentBuddy root.
- **`createTest(options?)`** — Factory function returning `{ test, expect }` with explicit configuration (for when auto-detection isn't enough).
- **`AppHelper`** — TypeScript interface for the `app` fixture's high-level API.

### How the monorepo uses it

`tests/e2e/fixtures/app.ts` is a 2-line file:
```ts
export { test, expect } from '@abuddy/sdk/testing';
export type { AppHelper } from '@abuddy/sdk/testing';
```

All test files (`smoke.spec.ts`, `navigation.spec.ts`) import from `./fixtures/app`. The SDK resolves `@abuddy/sdk/testing` via the `"./testing"` export path in `packages/abuddy-sdk/package.json`.

### How external packs use it

External packs import directly:
```ts
import { test, expect } from '@abuddy/sdk/testing';
```

Since external packs depend on `@abuddy/sdk` (linked or installed), the import resolves through the SDK's `package.json` exports.

## Prerequisites

E2E tests launch the full Electron app from source. This requires a **local clone of the AgentBuddy monorepo** with dependencies installed and packages built:

```bash
git clone <agentbuddy-repo> /path/to/AgentBuddy
cd /path/to/AgentBuddy && npm install && npm run build
```

The fixture resolves the Electron binary from the monorepo's `node_modules/electron` — external packs do **not** need `electron` as a dependency. `@abuddy/sdk` is currently private (`"private": true`), so packs must link to a local copy rather than installing from npm.

## Setup for external packs

```bash
cd /path/to/my-pack
npx abuddy init-tests              # scaffolds playwright.config.ts + tests/e2e/smoke.spec.ts
npm i -D @playwright/test          # install Playwright
export ABUDDY_ROOT=/path/to/AgentBuddy  # add to .env or shell profile
```

The `init-tests` CLI command (source: `packages/abuddy-sdk/src/cli/commands/init-tests.ts`):
- Reads the pack's `abuddy.json` to extract the first plugin ID
- Creates `playwright.config.ts` with `testDir: 'tests/e2e'`, `timeout: 60_000`, `workers: 1`
- Creates `tests/e2e/smoke.spec.ts` with `waitForPlugin()` and `navigate()` pre-filled for the detected plugin
- Appends `tests/screenshots/`, `tests/results/`, `test-results/` to `.gitignore`
- Warns if `ABUDDY_ROOT` is not set

## How the fixture finds AgentBuddy

`resolveAppRoot()` determines where the Electron app source lives, in this priority order:

1. **`options.appRoot`** — explicit path passed to `createTest()`. Used for custom setups.
2. **`ABUDDY_ROOT` env var** — set by the pack developer. This is the primary mechanism for external packs.
3. **Auto-detection** — walks up from the SDK package directory (`import.meta.dirname`) looking for `packages/entry-point.mjs`. This always works inside the monorepo, since the SDK lives at `packages/abuddy-sdk/`.

If none of these resolve, the fixture throws with a clear message telling the developer to set `ABUDDY_ROOT`.

Once resolved, `validateAppRoot()` checks that the directory contains the required files (`packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, `packages/renderer/dist`). If anything is missing, the error lists exactly what's needed — a stale or incomplete checkout gets a clear diagnostic instead of an opaque Electron crash later.

## Fixture lifecycle

### Worker setup (`electronApp` fixture, shared across tests)

1. **Pack build/sync** (if `PACK_DIR` is set):
   - Parse `abuddy.json` from `PACK_DIR` → extract pack `id` and `pluginIds`
   - Check for `.dev` signal file at `~/Library/Application Support/abuddy-dev/packs/{packId}/.dev`
     - If `.dev` exists: `abuddy dev` is running, skip build/sync entirely
     - If no `.dev`: build the pack (if no `dist/`), then copy pack files to the dev packs directory
   - Build uses the `abuddy build` CLI binary, resolved from: pack's local `node_modules/.bin/abuddy` first, then the host app's binary
   - Sync copies files recursively, skipping symlinks, `node_modules`, and `.git` (matches the SDK's `copyDir` pattern from `pack-installer.ts`)

2. **Launch Electron** — resolves the `electron` binary from `appRoot/node_modules/electron` via `createRequire`, then calls `_electron.launch({ executablePath, args: ['.'], cwd: appRoot })` with `PLAYWRIGHT_TEST=true`. This ensures external packs don't need `electron` installed locally.

3. **Debug logging** (if `DEBUG_E2E=1`): pipes Electron's stdout/stderr to the test terminal with `[electron]` prefix

### Test setup (`appPage` fixture, per test)

4. **Find main window** — polls Electron windows for `window.applicationState` (the XState actor). Distinguishes the main renderer from the splash screen. 45s timeout.

5. **Wait for connected state** — checks `applicationState.getSnapshot().value` for `{ running: 'connected' }` or onboarding state. Bypasses onboarding via `window.__disableOnboardingUI()` if detected.

6. **Pack plugin waiting** (if `PACK_DIR` is set) — for each plugin ID from the manifest, waits for it to appear in `applicationState.getSnapshot().context.plugins`. A `console.error` listener detects `[pack-loader] Failed to load FE entry` messages and bails early instead of timing out at 30s.

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
import { createTest } from '@abuddy/sdk/testing';

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
| `ABUDDY_ROOT` | Path to the AgentBuddy monorepo. Required for external packs unless the SDK can auto-detect it. |
| `PACK_DIR` | Path to an external pack directory. Triggers build/sync and plugin waiting. |
| `PLAYWRIGHT_TEST` | Set automatically to `'true'` by the fixture. The Electron app uses this to crash on uncaught errors. |
| `DEBUG_E2E` | Set to `1` to pipe Electron stdout/stderr to the test terminal. |

## Running tests

```bash
# From an external pack directory
ABUDDY_ROOT=/path/to/AgentBuddy npx playwright test

# With PACK_DIR for plugin waiting (when not using abuddy dev)
ABUDDY_ROOT=/path/to/AgentBuddy PACK_DIR=. npx playwright test

# From the AgentBuddy monorepo (ABUDDY_ROOT auto-detected)
npx playwright test

# Testing an external pack from the monorepo
PACK_DIR=/path/to/my-pack npx playwright test tests/e2e/scratch
```

## Key implementation details

- **Electron binary resolution**: The fixture uses `createRequire(appRoot + '/package.json')` to resolve `electron` from the monorepo's `node_modules`, then passes the binary path as `executablePath` to Playwright. This decouples the test runner's dependency tree from the Electron binary — packs don't need `electron` installed.
- **App root validation**: `validateAppRoot()` checks for `packages/entry-point.mjs`, `node_modules/electron`, `packages/main/dist`, and `packages/renderer/dist` before attempting to launch. Missing files produce a clear error listing exactly what's needed, rather than an opaque Electron crash.
- **Dev/prod packs directory alignment**: The fixture syncs to `getPacksDirForEnv(true)` → `~/Library/Application Support/abuddy-dev/packs/`. The Electron app's `PackProtocol` uses `app.getPath('userData') + '/packs'`. These match because `SingleInstanceApp.ts` appends `-dev` to the app name when `app.isPackaged === false` (always true when running from source), which shifts `userData` to the `-dev` directory.
- **Pack manifest caching**: `getPackManifest()` reads and parses `abuddy.json` once per process, cached at module scope. Plugin IDs are extracted from `features[].plugin.id` with fallback to `features[].id`.
- **`.dev` signal file**: Written by `abuddy dev` at `{devPacksDir}/{packId}/.dev` containing `{ port, pid }`. Its presence means the pack is being served by Vite's HMR dev server via the `pack://` protocol — no need for the fixture to build or sync files.
- **`pack://` protocol**: Custom Electron protocol (`packages/main/src/modules/pack-protocol/PackProtocol.ts`) that checks for `.dev` and proxies to the Vite dev server if present, otherwise serves files from disk.
