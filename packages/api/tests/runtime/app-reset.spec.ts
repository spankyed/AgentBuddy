// Resetting the app (services.appData.reset()) leaves it as a fresh boot does: an onboarded app whose settings and
// flows were changed comes back with default settings, the built-in packs' seeded flows and the migrations applied
// (its data at the app version, nothing pending; tests/services/host-runtime.spec.ts in @abuddy/host shows the reset's
// order). Runs the built-in packs' built runtimes (npm run compile), as the db scripts do.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EARS } from '@abuddy/ears';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-app-reset-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/runtime');
const { store, packs } = openAppStore();
const { loadAppPacks, startPacks } = await import('@abuddy/host/packs/runtime');
const { installShippedPacks } = await import('@abuddy/host/packs');
const { resolveAppContext } = await import('@abuddy/sdk/env');
const { appState } = await import('@abuddy/host/app-state');
const { getAppVersion } = await import('@abuddy/sdk/env');
const { services } = await import('@abuddy/sdk/services');
const { flowRepository } = await import('@abuddy/sdk/repositories');
const { untypedQx } = await import('@abuddy/ears');
const { onIncoming } = await import('@abuddy/sdk/events');
const { HOST } = await import('@abuddy/host/bus');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

/** What the user changed from the defaults — the whole of what a reset has to undo */
const storedSettings = () => services.settings.getStored();

/** The flows' ids and labels, sorted */
const flows = () => (untypedQx('Flow').pickAll() as Array<{ id: EARS.EntityId; label?: string }>)
  .map(({ id, label }) => ({ id, label }))
  .sort((a, b) => a.id.localeCompare(b.id));

let fresh: { settings: unknown; flows: ReturnType<typeof flows> };

beforeAll(async () => {
  // The API's boot (setup/backend.ts), for the built-in packs
  // The app installs the packs it ships, then loads every installed pack
  const installed = await installShippedPacks(PACKAGES_DIR, resolveAppContext().packsDir);
  loadAppPacks(packs, new Set(installed.map((result: { id: string }) => result.id)));
  await store.hydrate();
  startPacks(packs);
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
    services.settings.setInSection('general', ['application', 'openLinksInApp'], false);
    expect(storedSettings()).not.toEqual(fresh.settings);
    const [deleted] = fresh.flows;
    flowRepository.deleteFlow(deleted.id, { allowRoot: true });
    expect(flows()).not.toContainEqual(deleted);

    await services.appData.reset();

    expect(flows()).toEqual(fresh.flows);
    expect(storedSettings()).toEqual(fresh.settings);
    expect(appState.get()).toMatchObject({ hasOnboarded: false, version: getAppVersion() });
    expect(services.appData.hasOnboarded()).toBe(false);
  });

  // Without this the Database plugin refreshed itself and nothing else did, so a reset left Notes, Threads
  // and the rest rendering the previous database until the app was restarted
  it('tells the bus that every row was replaced', async () => {
    const announced: string[] = [];
    const stop = onIncoming((message) => {
      if (message.event.type === 'DATA_REPLACED') announced.push(message.to);
    });

    await services.appData.reset();
    stop();

    expect(announced).toEqual([HOST.bus]);
  });
});
