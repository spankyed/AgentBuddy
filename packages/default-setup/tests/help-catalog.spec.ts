import { afterEach, expect, it } from 'vitest';
import { registerPack, unregisterPack, startApp } from '@apackdev/testing/harness';
import type { HelpCatalog } from '@apackdev/sdk/framework';

afterEach(() => { try { unregisterPack('help-test'); } catch {} });
const catalogs = (events: Array<Record<string, unknown>>) => events.filter(e => e.type === 'HELP_CATALOG').map(e => e.catalog as HelpCatalog);
it('sends Settings a separate help catalog and refreshes it when a pack changes', async () => {
  const app = await startApp({ systems: ['host/help', 'host/settings'] });
  await app.connect();
  expect(catalogs(app.emitted('host/settings'))[0].articles.length).toBeGreaterThan(0);
  expect(app.emitted('host/settings').find(e => e.type === 'SETTINGS_LOADED')).not.toHaveProperty('help');
  registerPack({ id: 'help-test', features: {}, help: [{ id: 'test', title: 'Test', body: 'Details' }] });
  await app.send('host/help', { type: 'PACK_CHANGED', packId: 'help-test' });
  await app.settle();
  expect(catalogs(app.emitted('host/settings')).at(-1)!.articles.some(a => a.packId === 'help-test')).toBe(true);
  unregisterPack('help-test');
  await app.send('host/help', { type: 'PACK_CHANGED', packId: 'help-test' });
  await app.settle();
  expect(catalogs(app.emitted('host/settings')).at(-1)!.articles.some(a => a.packId === 'help-test')).toBe(false);
});
