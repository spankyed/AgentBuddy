// Data from 0.3.14, migrated by the 0.3.15 release as the app runs it: the host's app migrations, then the built-in
// pack's. 0.3.14 stored its whole default settings with the user's changes merged in, every plugin's slice under its
// bare feature id, the app shell's state in `plugins._meta` and the app's own in `internal`. Runs the built-in packs'
// built runtimes (npm run compile), as app-reset.spec.ts does.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The release that migrates 0.3.14's data; the test environment runs release rules
vi.mock('@abuddy/sdk/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@abuddy/sdk/env')>();
  return { ...actual, getAppVersion: () => '0.3.15' };
});

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-upgrade-0314-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/runtime');
const { store, packs } = openAppStore();
const { hostRegistration } = await import('@abuddy/host/features');
const { loadBuiltInPacks } = await import('@abuddy/host/packs/runtime');
const { runAppMigrations } = await import('@abuddy/host/migrations');
const { appState } = await import('@abuddy/host/app-state');
const { untypedTx, untypedQx } = await import('@abuddy/ears');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');
const SETTINGS_ID = 'Settings-app' as never;
const storedSettings = () => (untypedQx(SETTINGS_ID).pickOne(['data']) as unknown as { data: Record<string, unknown> }).data;

const APPLICATION_HOTKEYS = {
  switchPluginUp: { key: 'ArrowUp', modifiers: ['cmd', 'option'] },
  switchPluginDown: { key: 'ArrowDown', modifiers: ['cmd', 'option'] },
  toggleInspectionPanel: { key: 'b', modifiers: ['cmd'] },
};

/**
 * A 0.3.14 user's settings row: 0.3.14's defaults (abridged where a slice is long) with the user's changes — a name,
 * links opened outside the app, the library tab shown, a working directory, `log-service` hidden, a root flow chosen —
 * and what 0.3.14's own migration wrote (`baseDirectory`, the browser's `openLinksInApp`)
 */
const SETTINGS_0314 = {
  general: {
    personal: { name: 'Ada' },
    application: { hotkeys: APPLICATION_HOTKEYS, openLinksInApp: false },
    projects: [],
  },
  plugins: {
    _meta: {
      visibility: {
        threads: true, code: true, library: true, flows: false, actions: false, prompts: false, brain: false,
        database: false, logs: false, browser: false, notes: false, settings: true,
      },
      lastActivePlugin: 'code',
    },
    code: { restoreTerminals: true, maxTerminals: 25, lastDirectoryOpened: '/work', baseDirectory: '/work' },
    database: { hotkeys: { executeQuery: { key: 'Enter', modifiers: ['cmd'] } } },
    flows: { rootFlowId: 'Flow-root', enableFlowPreview: true },
    brain: { runningRootFlowId: 'Flow-root', inspectEnabled: false },
    browser: { showBookmarksBar: true, openLinksInApp: false },
    notes: { tasklistPanelPosition: 'left', showCollapseIcon: true },
    logs: { maxLogs: 1000, excludedSources: ['log-service'], showAppEvents: false },
  },
  internal: { hasOnboarded: true, lastInteractionTimestamp: null, version: '0.3.14', seedHash: 'boot-hash' },
  assistant: { name: '', birthdate: null },
};

beforeAll(async () => {
  packs.registerPack(hostRegistration());
  await loadBuiltInPacks(packs, PACKAGES_DIR, { runtimeEntry: 'only' });
  await store.hydrate();
  // 0.3.14's data has no AppState row: its state is in the settings
  untypedTx(SETTINGS_ID, true).put('entityType', 'Settings').put('data', structuredClone(SETTINGS_0314));
});

afterAll(() => {
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("0.3.15's migrations over 0.3.14's data", () => {
  it("leaves the settings holding only the user's changes, each plugin's under its ref, and the app's state in AppState", () => {
    expect(appState.exists()).toBe(false);

    expect(runAppMigrations(packs)).toBe(true);

    // Every value still at 0.3.14's default is dropped, so today's defaults apply to it
    expect(storedSettings()).toEqual({
      general: { personal: { name: 'Ada' } },
      plugins: {
        'default-setup/code': { baseDirectory: '/work' },
        'default-setup/browser': { openLinksInApp: false },
        'default-setup/logs': { excludedSources: ['log-service', 'action:*'] },
      },
    });
    expect(appState.get()).toMatchObject({
      hasOnboarded: true,
      version: '0.3.15',
      seedHashes: { 'default-setup': 'boot-hash' },
      lastActivePlugin: 'default-setup/code',
    });
    // Only the tab the user changed from 0.3.14's defaults
    expect(appState.get().pluginVisibility).toEqual({ 'default-setup/library': true });
  });
});
