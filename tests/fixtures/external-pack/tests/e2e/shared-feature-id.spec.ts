// A pack's plugin runs under `<packId>/<featureId>`, so this pack's `notes` feature and
// default-setup's are two plugins with two addresses, not one shadowing the other. Before that, the
// second pack to register a `notes` plugin was dropped into the renderer console: it installed
// "successfully" with no UI, and every send to `notes` reached whichever pack registered first.
import { test, expect } from '@abuddy/testing';

test('this pack and default-setup each get their own notes plugin', async ({ app, appPage }) => {
  await app.waitForPlugin('notes');

  const ids = await appPage.evaluate(() => {
    const plugins: Array<{ id: string; label: string }> =
      (window as any).applicationState.getSnapshot().context.plugins;
    return plugins.filter((p) => p.id.endsWith('/notes')).map((p) => p.id).sort();
  });
  expect(ids).toEqual(['default-setup/notes', 'e2e-fixture/notes']);

  // Each address reaches its own plugin's canvas, so neither is the other's
  await app.navigate('e2e-fixture/notes');
  await expect(appPage.getByTestId('fixture-notes-title')).toHaveText("the fixture's own notes");

  await app.navigate('default-setup/notes');
  await expect(appPage.getByTestId('fixture-notes-title')).toHaveCount(0);
});

// A spec names plugins the way the pack it tests names them, so the short name is this pack's own
// feature even when a dependency has one too — the same rule `emit` and `broadcastToPlugin` follow.
test("the short name is this pack's own plugin, not its dependency's", async ({ app, appPage }) => {
  await app.navigate('notes');
  await expect(appPage.getByTestId('fixture-notes-title')).toBeVisible();
});
