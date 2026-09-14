// Exercises the external-pack path end to end: compiled CJS system, bundled FE with
// host-shared SDK proxies, pack Tailwind, prefixed bus IDs, and the test packs dir.
// Run via `npm run test:external-pack` from the repo root.
import { test, expect } from '@abuddy/testing';

test('pack plugin renders with its own styles', async ({ appPage, app }) => {
  await app.waitForPlugin('memos');
  await app.navigate('memos');

  const canvas = appPage.getByTestId('memos-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await expect(canvas).toHaveCSS('padding-top', '13px');

  // The form is data-independent (the memo list grows across runs), so it can be a stable
  // baseline that catches pack styles regressing. Update with: npm run test:external-pack -- -u
  await expect(canvas.locator('form')).toHaveScreenshot('memos-form.png', { maxDiffPixelRatio: 0.01 });
});

test('add memo round-trip through the pack backend', async ({ appPage, app }) => {
  await app.waitForPlugin('memos');
  await app.navigate('memos');

  const text = `memo ${Date.now()}`;
  await appPage.getByTestId('memo-input').fill(text);
  await appPage.getByTestId('memo-add').click();

  // Only rendered after the backend persists the memo and emits MEMO_ADDED
  await expect(appPage.getByTestId('memo-list').getByText(text, { exact: true })).toBeVisible({ timeout: 10_000 });
});

test("renders the host's @abuddy/ui editor inside the pack", async ({ appPage, app }) => {
  await app.waitForPlugin('memos');
  await app.navigate('memos');

  const preview = appPage.getByTestId('memo-preview');
  await expect(preview.locator('.ProseMirror')).toContainText('Memo preview', { timeout: 10_000 });
  await appPage.getByTestId('memo-input').fill('typed draft');
  await expect(preview.locator('.ProseMirror')).toContainText('typed draft');
});

test('seeds memos from abuddy.json: a markdown entry and a compiler module', async ({ appPage, app }) => {
  await app.waitForPlugin('memos');
  await app.navigate('memos');

  const list = appPage.getByTestId('memo-list');
  await expect(list.getByText('Seeded from markdown', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(list.getByText('Seeded by a compiler module', { exact: true })).toBeVisible();
});

test("a re-enabled pack's plugin gets its startup data again", async ({ appPage, app }) => {
  await app.waitForPlugin('memos');
  const pluginIds = () => appPage.evaluate(() => (window as any).applicationState.getSnapshot().context.plugins.map((p: { id: string }) => p.id) as string[]);
  const toggle = () => appPage.evaluate(() => (window as any).applicationState.system.get('packs').send({ type: 'UI.TOGGLE_ENABLED', packId: 'e2e-fixture' }));

  // Disabled while active: its plugin actor must stop, or re-enabling can't spawn it again
  await app.navigate('memos');
  await toggle();
  await expect.poll(pluginIds, { timeout: 15_000 }).not.toContain('memos');

  // Loaded after the connection: its data comes from the pack's client-ready handshake
  await toggle();
  await app.waitForPlugin('memos');
  await app.navigate('memos');
  await expect(appPage.getByTestId('memo-list').getByText('Seeded from markdown', { exact: true })).toBeVisible({ timeout: 10_000 });
});
