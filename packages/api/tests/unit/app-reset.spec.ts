// Resetting the app (services.appData.reset()) leaves it as a fresh boot does: an onboarded app whose settings and
// flows were changed comes back with default settings, the built-in packs' seeded flows and the migrations applied
// (its data at the app version, nothing pending; tests/services/host-runtime.spec.ts in @abuddy/host shows the reset
// runs the migrations after the packs' onInit and seeds). Runs the built-in packs' built runtimes (npm run compile),
// as the db scripts do.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-app-reset-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/setup/backend');
const { store, packs } = openAppStore();
const { loadBuiltInPacks, orchestrateDeclarativeSeed } = await import('@abuddy/host/packs/runtime');
const { runAppMigrations } = await import('@abuddy/host/migrations');
const { appState } = await import('@abuddy/host/app-state');
const { getAppVersion } = await import('@abuddy/sdk/env');
const { services } = await import('@abuddy/sdk/services');
const { flowRepository } = await import('@abuddy/sdk/repositories');
const { untypedQx, repository } = await import('@abuddy/ears');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

/** default-setup's settings repository, registered once the packs load */
interface SettingsRepository {
  settingsQueries: { getSettings(): unknown };
  settingsCommands: { updateSettings(type: string, label: string | null, path: string[], value: unknown): void };
}
const settings = () => repository as unknown as SettingsRepository;

/** The flows' ids and labels, sorted */
const flows = () => (untypedQx('Flow' as never).pickAll() as Array<{ id: string; label?: string }>)
  .map(({ id, label }) => ({ id, label }))
  .sort((a, b) => a.id.localeCompare(b.id));

let fresh: { settings: unknown; flows: ReturnType<typeof flows> };

beforeAll(async () => {
  // The API's boot (setup/backend.ts), for the built-in packs
  await loadBuiltInPacks(packs, PACKAGES_DIR, { runtimeEntry: 'only' });
  await store.hydrate({ skipTombstoneScan: true });
  for (const hooks of packs.getBootHooks()) hooks.onInit?.();
  runAppMigrations(packs);
  packs.runRegisteredBootSeeds(orchestrateDeclarativeSeed);
  fresh = { settings: settings().settingsQueries.getSettings(), flows: flows() };
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
    settings().settingsCommands.updateSettings('general', 'application', ['openLinksInApp'], false);
    expect(settings().settingsQueries.getSettings()).not.toEqual(fresh.settings);
    const [deleted] = fresh.flows;
    flowRepository.deleteFlow(deleted.id as never, { allowRoot: true });
    expect(flows()).not.toContainEqual(deleted);

    await services.appData.reset();

    expect(flows()).toEqual(fresh.flows);
    expect(settings().settingsQueries.getSettings()).toEqual(fresh.settings);
    expect(appState.get()).toMatchObject({ hasOnboarded: false, version: getAppVersion() });
    expect(services.appData.hasOnboarded()).toBe(false);
  });
});
