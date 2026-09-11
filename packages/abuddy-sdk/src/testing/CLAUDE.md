# @abuddy/sdk/testing

Reusable Playwright E2E test fixture for AgentBuddy packs. Launches the Electron app, finds the main window, bypasses onboarding, and provides a high-level `AppHelper` API.

## Setup for external packs

```bash
npx abuddy init-tests    # scaffolds playwright.config.ts + tests/e2e/ + sample test
npm i -D @playwright/test
```

## Usage

```ts
import { test, expect } from '@abuddy/sdk/testing';

test('my plugin renders', async ({ app }) => {
  await app.waitForPlugin('bookmarks');
  await app.navigate('bookmarks');
  await app.screenshot('bookmarks-view');
});
```

## Environment variables

- `ABUDDY_ROOT=/path/to/AgentBuddy` — path to the AgentBuddy monorepo (auto-detected when running inside the monorepo)
- `PACK_DIR=/path/to/pack` — external pack to sync/build before tests; fixture waits for its plugins
- `PLAYWRIGHT_TEST=true` — set automatically by the fixture
- `DEBUG_E2E=1` — pipes Electron stdout/stderr to the test terminal

## API

### Fixtures

| Fixture       | Scope  | Description |
|---------------|--------|-------------|
| `electronApp` | worker | Launched Electron app (shared across tests in a worker) |
| `appPage`     | test   | Main renderer Page (waits for `running.connected`, bypasses onboarding) |
| `app`         | test   | `AppHelper` — high-level API |

### AppHelper methods

```ts
app.screenshot(name)             // Save PNG to screenshots dir
app.navigate(pluginId)           // SELECT_PLUGIN + wait for match + 500ms render delay
app.getState()                   // Returns snapshot.value
app.getContext()                 // Returns { activePluginId, pluginIds }
app.sendEvent(event)             // Send any event to applicationState
app.waitForState(check, ms?)     // Wait for dot-separated state path
app.waitForPlugin(pluginId, ms?) // Wait for a plugin to appear (default 30s)
```

### `createTest(options?)`

Factory for custom configurations:

```ts
import { createTest } from '@abuddy/sdk/testing';

const { test, expect } = createTest({
  appRoot: '/custom/path/to/AgentBuddy',
  screenshotDir: './my-screenshots',
});
```

## Screenshots

When `PACK_DIR` is set, screenshots go to `{PACK_DIR}/tests/screenshots/`. Otherwise `{cwd}/tests/screenshots/`.

## Running tests

```bash
# From pack directory
ABUDDY_ROOT=/path/to/AgentBuddy npx playwright test

# With abuddy dev running (hot reload)
ABUDDY_ROOT=/path/to/AgentBuddy PACK_DIR=. npx playwright test

# Cold start (fixture builds + syncs the pack)
ABUDDY_ROOT=/path/to/AgentBuddy PACK_DIR=. npx playwright test
```
