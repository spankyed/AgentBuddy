// A packaged app loads its built-in packs from the API bundle's loader map, not from each pack's built runtime, and
// its loaders are imported — so the built-in packs register after an await. A run from source takes the other branch,
// so this is the only place the packaged one is exercised: it is where an installed pack once took a built-in pack's
// role, because the built-in packs were still loading when the external ones registered.
// Runs the built-in packs' built runtimes (npm run compile), which stand in for the bundle's loaders: both hand
// loadBuiltInPacks a module with a `registration` export.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-packaged-boot-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/runtime');
const { loadAppPacks, loadBuiltInRuntime } = await import('@abuddy/host/packs/runtime');
const { installPackFromLocal } = await import('@abuddy/host/packs');
const { discoverBuiltInPacksForBuild } = await import('@abuddy/host/build/discover');
const { resolveAppContext } = await import('@abuddy/sdk/env');
const { unbindHost } = await import('@abuddy/sdk/runtime/internals');
const { getDesignated } = await import('@abuddy/sdk/designations');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));
beforeEach(() => fs.rmSync(resolveAppContext().packsDir, { recursive: true, force: true }));

/**
 * The bundle's loaders, as the app's would arrive: one per built-in pack, each answering with the pack's
 * registration after an await. The pack's code is its built runtime (the bundle inlines the same pack's source), so
 * what this covers is the branch, not the bundler. `slow` holds them, the way a bundle's chunks do, so what registers
 * first is the branch's own order rather than the speed of a read.
 */
function bundledLoaders(slow?: Promise<void>) {
  const packs = discoverBuiltInPacksForBuild(PACKAGES_DIR);
  return async () => Object.fromEntries(packs.map((pack) => [pack.id, async () => {
    await slow;
    return { registration: loadBuiltInRuntime(pack.dir) };
  }]));
}

/** An installed pack that plays `role`, as `abuddy install` leaves one */
async function installPackPlaying(id: string, role: string): Promise<void> {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), `${id}-`));
  fs.writeFileSync(path.join(source, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0' }));
  fs.mkdirSync(path.join(source, 'dist', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(source, 'dist', 'types'), { recursive: true });
  fs.writeFileSync(path.join(source, 'dist', 'types', 'snapshot.json'), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  fs.writeFileSync(
    path.join(source, 'dist', 'runtime', 'index.cjs'),
    `module.exports = { registration: { id: ${JSON.stringify(id)}, features: { taker: { designation: ${JSON.stringify(role)} } } } };`,
  );
  await installPackFromLocal(source, resolveAppContext().packsDir);
  fs.rmSync(source, { recursive: true, force: true });
}

/** The app's boot through the packaged branch, closed and unbound however the test ends */
async function packagedBoot(run: (app: ReturnType<typeof openAppStore>, loaders: ReturnType<typeof bundledLoaders>) => Promise<void>, slow?: Promise<void>) {
  const app = openAppStore();
  try {
    await run(app, bundledLoaders(slow));
  } finally {
    app.store.close();
    unbindHost();
  }
}

it('loads the built-in packs from the bundle, with their systems and plugins', async () => {
  await packagedBoot(async (app, loaders) => {
    const { builtIn } = await loadAppPacks(app.packs, { builtInDir: PACKAGES_DIR, runtimeEntry: 'never', bundledLoaders: loaders });

    expect(builtIn.map(({ id }) => id)).toContain('default-setup');
    expect(app.packs.systemIds()).toContain('default-setup/threads');
    expect(app.packs.pluginIds()).toContain('default-setup/settings');
  });
});

// The bug this branch had: the built-in packs were loading when the external ones registered, so an installed pack
// claiming a role took it, and the built-in pack that declares it then failed to register at all
it("keeps a built-in pack's role when an installed pack claims it, however long the bundle takes", async () => {
  await installPackPlaying('role-taker', 'brain');
  let released!: () => void;
  const slow = new Promise<void>((resolve) => { released = resolve; });

  await packagedBoot(async (app, loaders) => {
    const loading = loadAppPacks(app.packs, { builtInDir: PACKAGES_DIR, runtimeEntry: 'never', bundledLoaders: loaders });
    released();
    const { external } = await loading;

    expect(getDesignated('brain')).toBe('default-setup/brain');
    expect(external).toEqual([]);
    expect(app.packs.loadProblem('role-taker')).toContain('brain');
  }, slow);
});

it('refuses to start with no loaders, naming the option, rather than an app with no packs', async () => {
  await packagedBoot(async (app) => {
    await expect(loadAppPacks(app.packs, { builtInDir: PACKAGES_DIR, runtimeEntry: 'never' }))
      .rejects.toThrow(/needs the bundledLoaders option/);
  });
});
