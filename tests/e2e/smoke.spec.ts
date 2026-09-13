import { test, expect } from './fixtures/app';

test('app launches without crashing', async ({ electronApp, appPage }) => {
  const window = await electronApp.browserWindow(appPage);

  const state = await window.evaluate(
    (win): { isDevToolsOpened: boolean; isCrashed: boolean } => ({
      isDevToolsOpened: win.webContents.isDevToolsOpened(),
      isCrashed: win.webContents.isCrashed(),
    }),
  );

  expect(state.isCrashed).toBe(false);
  expect(state.isDevToolsOpened).toBe(false);
});

test('app reaches connected state', async ({ app }) => {
  const state = await app.getState();
  expect(state).toEqual({ running: 'connected' });
});

test('applicationState is accessible with plugins loaded', async ({ app }) => {
  const ctx = await app.getContext();
  expect(ctx.activePluginId).toBeTruthy();
  expect(ctx.pluginIds.length).toBeGreaterThan(0);
});

test('default view screenshot', async ({ app }) => {
  await app.screenshot('default-view');
});

test('runs in an isolated per-worker test data dir', async ({ electronApp, appPage: _ready }) => {
  const { name, userData } = await electronApp.evaluate(({ app }) => ({
    name: app.getName(),
    userData: app.getPath('userData'),
  }));
  expect(name).toBe('abuddy-test');
  // A fresh temp dir per worker, never the shared ~/…/abuddy-test data dir
  expect(userData).toMatch(/[\\/]abuddy-e2e-[^\\/]+$/);
});
