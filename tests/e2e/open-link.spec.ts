import { test, expect } from './fixtures/app';

// `openLink` hands a link to the plugin playing the browser role, which opens it by its own setting: by default, a
// tab in the app's browser, which it opens to
test('a link opens in the app browser by default', async ({ app, appPage }) => {
  await app.navigate('default-setup/notes');
  await appPage.evaluate(() => (window as any).applicationState.system.get('default-setup/browser')
    .send({ type: 'LINK.OPEN', url: 'about:blank' }));

  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.getSnapshot().context.activePlugin.id))
    .toBe('default-setup/browser');
});
