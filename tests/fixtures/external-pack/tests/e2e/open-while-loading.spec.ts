// A link to a pack's plugin followed while that pack's frontend is loading opens the plugin once it has loaded. The
// shell holds the request, since until the load settles it can't tell a plugin still on its way from one no pack
// provides. Disabling the pack and enabling it again is how a test catches its frontend mid-load: a dev reload
// replaces only the pack's backend.
import type { Page } from '@playwright/test';
import { test, expect } from '@abuddy/testing';

const PACK_ID = 'e2e-fixture';
const MEMOS = `${PACK_ID}/memos`;

/** Enables or disables the pack as its switch in the Packs tab does */
const togglePack = (page: Page) => page.evaluate((packId) => {
  (window as any).applicationState.system.get('host/packs').send({ type: 'UI.TOGGLE_ENABLED', packId });
}, PACK_ID);
const hasMemos = (page: Page) => page.evaluate((memos) =>
  (window as any).applicationState.getSnapshot().context.plugins.some((plugin: { id: string }) => plugin.id === memos), MEMOS);

test("opens a pack's plugin asked for while the pack's frontend loads, once it has loaded", async ({ app, appPage }) => {
  await app.waitForPlugin('memos');
  await app.navigate('default-setup/threads');
  await togglePack(appPage);
  await expect.poll(() => hasMemos(appPage), { timeout: 15_000 }).toBe(false);

  // The moment the shell is loading the pack's frontend without its plugin registered, a link asks for the plugin
  await appPage.evaluate(({ memos }) => {
    const win = window as any;
    win.__openedWhileLoading = false;
    win.__memosEvents = [];
    win.applicationState.system.inspect((inspection: { type: string; actorRef?: { id: string }; event: { type: string } }) => {
      if (inspection.type === '@xstate.event' && inspection.actorRef?.id === memos) win.__memosEvents.push(inspection.event.type);
    });
    const subscription = win.applicationState.subscribe((snapshot: { context: { packLoadRunning: boolean; plugins: Array<{ id: string }> } }) => {
      if (win.__openedWhileLoading || !snapshot.context.packLoadRunning) return;
      if (snapshot.context.plugins.some((plugin) => plugin.id === memos)) return;
      win.__openedWhileLoading = true;
      subscription.unsubscribe();
      win.applicationState.send({ type: 'OPEN_PLUGIN', plugin: memos, events: [{ type: 'E2E_LINK_FOLLOWED' }] });
    });
  }, { memos: MEMOS });

  await togglePack(appPage);

  await expect.poll(() => appPage.evaluate(() => (window as any).__openedWhileLoading), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.getSnapshot().context.activePlugin.id), { timeout: 15_000 })
    .toBe(MEMOS);
  await expect.poll(() => appPage.evaluate(() => (window as any).__memosEvents as string[])).toContain('E2E_LINK_FOLLOWED');
});
