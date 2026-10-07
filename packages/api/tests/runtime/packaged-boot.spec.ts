// The app's boot, over the real built-in packs: each one's built runtime, loaded from the directory it ships in
// (npm run compile writes it). A packaged app's api bundle carries no pack's backend, so this is the path in a
// packaged build and from source alike, and the one place default-setup's actual runtime is loaded by the app's
// own boot rather than by a fixture.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';
import { PACK_LAYOUT } from '@abuddy/host/packs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-packaged-boot-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const { openAppStore } = await import('@/runtime');
const { loadAppPacks } = await import('@abuddy/host/packs/runtime');
const { installPackFromLocal } = await import('@abuddy/host/packs');
const { resolveAppContext } = await import('@abuddy/sdk/env');
const { unbindHost } = await import('@abuddy/sdk/runtime/internals');
const { getDesignated } = await import('@abuddy/sdk/designations');

const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));
beforeEach(() => fs.rmSync(resolveAppContext().packsDir, { recursive: true, force: true }));

/** An installed pack that plays `role`, as `abuddy install` leaves one */
async function installPackPlaying(id: string, role: string): Promise<void> {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), `${id}-`));
  fs.writeFileSync(path.join(source, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0' }));
  fs.mkdirSync(path.join(source, 'dist', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(source, 'dist', 'types'), { recursive: true });
  fs.writeFileSync(path.join(source, 'dist', PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  fs.writeFileSync(
    path.join(source, 'dist', 'runtime', 'index.cjs'),
    `module.exports = { registration: { id: ${JSON.stringify(id)}, features: { taker: { designation: ${JSON.stringify(role)} } } } };`,
  );
  await installPackFromLocal(source, resolveAppContext().packsDir);
  fs.rmSync(source, { recursive: true, force: true });
}

/** The app's boot, closed and unbound however the test ends */
async function packagedBoot(run: (app: ReturnType<typeof openAppStore>) => Promise<void>) {
  const app = openAppStore();
  try {
    await run(app);
  } finally {
    app.store.close();
    unbindHost();
  }
}

it("loads each shipped pack's built runtime, with its systems and plugins", async () => {
  await packagedBoot(async (app) => {
    const { builtIn } = await loadAppPacks(app.packs, { builtInDir: PACKAGES_DIR });

    expect(builtIn.map(({ id }) => id)).toContain('default-setup');
    expect(app.packs.systemIds()).toContain('default-setup/threads');
    expect(app.packs.pluginIds()).toContain('default-setup/threads');
  });
});

// The bug this covers: an installed pack claiming a role the shipped pack designates took it, because the
// shipped packs were still loading when the external ones registered. `loadAppPacks` holds the order, and
// here it is held over the real packs and the real `brain` designation rather than a fixture's role name
it("keeps a shipped pack's role when an installed pack claims it", async () => {
  await installPackPlaying('role-taker', 'brain');

  await packagedBoot(async (app) => {
    const { external } = await loadAppPacks(app.packs, { builtInDir: PACKAGES_DIR });

    expect(getDesignated('brain')).toBe('default-setup/brain');
    expect(external).toEqual([]);
    expect(app.packs.loadProblem('role-taker')).toContain('brain');
  });
});
