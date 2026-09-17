// Resetting the app (services.appData.reset()) leaves it as a fresh boot does: an onboarded app whose settings and
// flows were changed comes back with default settings, the built-in packs' seeded flows and the migrations applied
// (its data at the app version, nothing pending; tests/services/host-runtime.spec.ts in @abuddy/host shows the reset's
// order). Runs the built-in packs' built runtimes (npm run compile), as the db scripts do.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-app-reset-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/setup/backend');
const { store, packs } = openAppStore();
const { loadBuiltInPacks, startPacks } = await import('@abuddy/host/packs/runtime');
const { appState } = await import('@abuddy/host/app-state');
const { getAppVersion } = await import('@abuddy/sdk/env');
const { services } = await import('@abuddy/sdk/services');
const { flowRepository } = await import('@abuddy/sdk/repositories');
const { tx, untypedQx } = await import('@abuddy/ears');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

/** The settings the built-in pack stores (its own data, read untyped here) */
const SETTINGS_ID = 'Settings-app' as never;
const storedSettings = () => (untypedQx(SETTINGS_ID).pickOne(['data']) as { data: Record<string, unknown> }).data;

/** The flows' ids and labels, sorted */
const flows = () => (untypedQx('Flow' as never).pickAll() as Array<{ id: string; label?: string }>)
  .map(({ id, label }) => ({ id, label }))
  .sort((a, b) => a.id.localeCompare(b.id));

let fresh: { settings: unknown; flows: ReturnType<typeof flows> };

beforeAll(async () => {
  // The API's boot (setup/backend.ts), for the built-in packs
  await loadBuiltInPacks(packs, PACKAGES_DIR, { runtimeEntry: 'only' });
  await store.hydrate({ skipTombstoneScan: true });
  startPacks(packs, []);
  fresh = { settings: storedSettings(), flows: flows() };
});

afterAll(() => {
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('services.appData.reset()', () => {
  it('leaves an onboarded app with default settings, seeded flows and migrations applied', async () => {
    // A fresh boot seeded flows, and its data is at the app version
    expect(fresh.flows.length).toBeGreaterThan(0);
    expect(appState.get()).toMatchObject({ hasOnboarded: false, version: getAppVersion() });

    // The user onboards, changes settings and deletes a flow; the data records an older version
    services.appData.completeOnboarding();
    appState.update({ version: '0.0.1' });
    tx(SETTINGS_ID).update('data', { ...storedSettings(), general: { application: { openLinksInApp: false } } });
    expect(storedSettings()).not.toEqual(fresh.settings);
    const [deleted] = fresh.flows;
    flowRepository.deleteFlow(deleted.id as never, { allowRoot: true });
    expect(flows()).not.toContainEqual(deleted);

    await services.appData.reset();

    expect(flows()).toEqual(fresh.flows);
    expect(storedSettings()).toEqual(fresh.settings);
    expect(appState.get()).toMatchObject({ hasOnboarded: false, version: getAppVersion() });
    expect(services.appData.hasOnboarded()).toBe(false);
  });
});
