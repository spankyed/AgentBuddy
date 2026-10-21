import { test, expect } from '@apackdev/testing';

/** Installed declarations remain visible while their executable frontend is disabled. */
test('an open flow palette follows external step disable and re-enable', async ({ app, appPage }) => {
  await app.waitForPlugin('e2e-fixture/memos');
  await app.navigate('host/packs');
  await app.navigate('default-setup/flows');
  await appPage.getByRole('button', { name: 'New Flow', exact: true }).click();
  const palette = appPage.locator('[data-onboarding-id="flow-node-palette"]');
  await expect(palette).toBeVisible();
  const stamp = palette.getByRole('button', { name: 'Stamp', exact: true });
  const pulse = palette.getByRole('button', { name: 'Pulse', exact: true });
  await expect(stamp).toBeEnabled(); await expect(pulse).toBeEnabled();
  await expect(stamp).toHaveAttribute('draggable', 'true');
  // The canvas ignores palette clicks during its list-to-view transition.
  await expect(async () => {
    await stamp.click();
    expect(await appPage.evaluate(() => (window as any).applicationState.system
      .get('default-setup/flows').getSnapshot().context.graph.nodes
      .some((node: { id: string; nodeType?: string; note?: string }) =>
        !node.id.startsWith('temp-') && node.nodeType === 'stamp' && node.note === 'stamped')))
      .toBe(true);
  }).toPass({ timeout: 5_000 });
  const toggle = () => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
    .send({ type: 'UI.TOGGLE_ENABLED', packId: 'e2e-fixture' }));
  const acceptedRuntime = () => appPage.evaluate(() => (window as any).applicationState.getSnapshot()
    .context.acceptedPackRuntimes['e2e-fixture']);
  const runtime = await acceptedRuntime();
  let disabled = false;
  try {
    await toggle(); disabled = true;
    await expect(stamp).toBeVisible(); await expect(stamp).toBeDisabled();
    await expect(pulse).toBeVisible(); await expect(pulse).toBeDisabled();
    await expect(stamp).toHaveAttribute('draggable', 'false');
    await expect(stamp).toHaveClass(/bg-purple-900/);
    await toggle(); disabled = false;
    // Its steps enable once the shell has accepted the pack's reloaded frontend
    await expect.poll(async () => {
      const current = await acceptedRuntime();
      return !!current && current !== runtime;
    }, { timeout: 30_000, message: 'e2e-fixture frontend accepted after reactivation' }).toBe(true);
    await expect(stamp).toBeEnabled(); await expect(pulse).toBeEnabled();
    await expect(stamp).toHaveAttribute('draggable', 'true');
  } finally {
    if (disabled) { await toggle(); await app.waitForPlugin('e2e-fixture/memos'); }
  }
});
