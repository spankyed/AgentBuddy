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

## Fixture API

Tests import from `./fixtures/app` which provides three fixtures:

| Fixture        | Scope  | Description |
|----------------|--------|-------------|
| `electronApp`  | worker | The launched Electron app (shared across tests in a worker) |
| `appPage`      | test   | The main renderer Page (waits for `running.connected`, bypasses onboarding) |
| `app`          | test   | `AppHelper` — high-level API below |

### AppHelper methods

```ts
app.screenshot(name)          // Save PNG to tests/screenshots/{name}.png
app.navigate(pluginId)        // Send SELECT_PLUGIN + wait for activePlugin match + 500ms render delay
app.getState()                // Returns snapshot.value (e.g. { running: 'connected' })
app.getContext()              // Returns { activePluginId, pluginIds }
app.sendEvent(event)          // Send any event to applicationState
app.waitForState(check, ms?)  // Wait for dot-separated state path (e.g. 'running.connected')
app.waitForPlugin(pluginId, ms?) // Wait for a plugin to appear (useful for external packs, default 30s)
```

### Direct page access

`appPage` is a standard Playwright `Page`. Use it for DOM queries:

```ts
await appPage.locator('.some-selector').click();
await appPage.waitForSelector('.loaded-indicator');
```

## Plugin IDs

Available for `app.navigate()`: `threads` (default), `code`, `notes`, `calendar`, `browser`, `library`, `flows`, `actions`, `prompts`, `brain`, `database`, `logs`, `settings`.

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

External pack plugins load asynchronously after the app reaches `running.connected`. The fixture supports two workflows:

### With `abuddy dev` running (hot)

If `abuddy dev` is already running for the pack, the pack is installed and managed. Just set `PACK_DIR` so the fixture waits for the pack's plugins:

```bash
PACK_DIR=/path/to/my-pack npx playwright test tests/e2e/scratch
```

### Cold start (no `abuddy dev`)

Set `PACK_DIR` and the fixture handles everything — syncs the pack to the dev packs directory, launches the app, and waits for plugins to load:

```bash
PACK_DIR=/path/to/my-pack npx playwright test tests/e2e/scratch
```

The fixture detects whether `abuddy dev` is running (via the `.dev` signal file) and skips sync if so. If the pack has no `dist/` directory, it builds using the AgentBuddy repo's SDK binary.

If the pack's FE fails to load at runtime, the fixture logs a warning and continues — the test still runs so you can inspect the error.

### Finding plugin IDs

Plugin IDs come from the pack's `abuddy.json` → `features[].plugin.id` (or `features[].id` as fallback).

### Example scratch test for a pack

```ts
import { test, expect } from './fixtures/app';

test('verify pack UI', async ({ app }) => {
  // waitForPlugin is called automatically by the fixture when PACK_DIR is set,
  // but you can also call it manually if needed
  await app.waitForPlugin('bookmarks');
  await app.navigate('bookmarks');
  await app.screenshot('pack-bookmarks');
});
```

## Renderer globals

The renderer exposes on `window`:

- `applicationState` — full XState actor (`.send()`, `.getSnapshot()`, `.system`)
- `__disableOnboardingUI()` — sends `ONBOARDING_COMPLETE` (fixture calls this automatically)

## Environment variables

- `PLAYWRIGHT_TEST=true` — set automatically by the fixture; makes uncaught errors crash immediately
- `DEBUG_E2E=1` — pipes Electron stdout/stderr to the test terminal
- `PACK_DIR=/path/to/pack` — builds, installs, and waits for an external pack's plugins before tests run

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
