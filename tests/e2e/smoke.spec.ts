import { test, expect } from './fixtures/app';

test('app launches without crashing', async ({ electronApp, appPage }) => {
  const window = await electronApp.browserWindow(appPage);

  // Wait for window to become visible (main process shows it after renderer ready or 15s timeout)
  await expect.poll(async () => {
    return await window.evaluate((win) => win.isVisible());
  }, { timeout: 20_000, message: 'Window did not become visible' }).toBe(true);

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
