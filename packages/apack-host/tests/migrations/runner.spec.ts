// The boot's migrations runners: a migration on the `app` line runs against the app version, one on the `pack`
// line against its pack's own, each once, and both versions are recorded. **Which line is what the pack declared,
// never where the pack came from** — so the gate pack below is external and on the app's line, and two cases put
// each line on the provenance it did not used to be allowed. A beta runs its release's migrations (again when its
// version changes), a development build runs every pending one, and a failed migration stops the rest and records
// nothing.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PackMigration } from '@apack/sdk/framework';

// The migrations runner reads the app environment; a test build runs release rules
process.env.APACK_ENV = 'test';
import { registry, TEST_APP_VERSION } from '../packs/runtime/test-host.ts';

const runs = vi.hoisted(() => ({ shipped: 0, external: 0 }));

/** The app version the runner reads; the test host's unless a test sets one */
const version = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock('@apack/sdk/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apack/sdk/env')>();
  return { ...actual, getAppVersion: () => version.current ?? actual.getAppVersion() };
});

import { registerExternalPacks, type LoadedPack } from '../../src/packs/runtime/index.ts';
import type { PackMigrationTarget } from '../../src/migrations/index.ts';
import { runAppMigrations, runPackMigrations } from '../../src/migrations/index.ts';
import { appState } from '../../src/app-state/index.ts';
import { resetTestData } from '@apack/sdk/testing';

let builtInDir: string;

beforeAll(() => {
  builtInDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-spec-'));
  const packDir = path.join(builtInDir, 'migrations-built-in');
  fs.mkdirSync(packDir);
  fs.writeFileSync(path.join(packDir, 'apack.json'), JSON.stringify({
    id: 'migrations-built-in', name: 'Built-in', version: TEST_APP_VERSION, builtIn: true,
  }));
});

afterAll(() => {
  registry.unregisterPack('migrations-gate');
  registry.unregisterPack('migrations-built-in');
  registry.unregisterPack('migrations-external');
  fs.rmSync(builtInDir, { recursive: true, force: true });
});

describe('boot migrations', () => {
  it("runs a shipped pack's migration and an installed pack's migration once each", async () => {
    resetTestData();
    appState.update({ version: '0.0.0' });

    const registration = {
      id: 'migrations-built-in',
      migrations: { app: [{ target: TEST_APP_VERSION, description: 'built-in', up: () => { runs.shipped++; } }] },
    };
    // Registered straight into the registry: the subject is the runner, not how a pack's module is loaded.
    // **With a `manifest`, which is what makes "once" checkable here.** `packMigrationTargets` reads the
    // origin's manifest, and the loader builds every origin with one — so a fixture without it is a shipped
    // pack the second runner cannot see, and this case passed while a real one ran its migrations twice.
    const shippedManifest = { id: 'migrations-built-in', name: 'Built-in', version: TEST_APP_VERSION };
    registry.registerPack(registration, { ...shippedManifest, dir: builtInDir, shipped: true, manifest: shippedManifest as never });

    const externalMigration: PackMigration = { target: TEST_APP_VERSION, description: 'external', up: () => { runs.external++; } };
    const manifest = { id: 'migrations-external', name: 'External', version: TEST_APP_VERSION };
    const external = {
      registration: { id: manifest.id, migrations: { pack: [externalMigration] } },
      origin: { ...manifest, dir: builtInDir, shipped: false, manifest: manifest },
    } satisfies LoadedPack;
    expect(registerExternalPacks(registry, [external])).toHaveLength(1);
    // What the boot passes on: the registry joins each registered pack's origin with the migrations it declared
    // on the line asked for. Each pack is answered for by the line it chose, not by who shipped it
    const installedPacks = registry.packMigrationTargets('pack');
    const declaring = (line: 'app' | 'pack') => registry.packMigrationTargets(line)
      .filter(({ migrations }) => migrations?.length).map((t) => t.manifest.id);
    expect(declaring('pack'), 'only the pack that declared a `pack` migration').toEqual(['migrations-external']);
    expect(declaring('app'), 'and only the one that declared an `app` migration').toEqual(['migrations-built-in']);

    // The boot's order (the API's setup/backend.ts)
    runAppMigrations(registry);
    runPackMigrations(installedPacks);

    expect(runs.shipped).toBe(1);
    expect(runs.external).toBe(1);
    expect(appState.get()).toMatchObject({ version: TEST_APP_VERSION, packVersions: { 'migrations-external': TEST_APP_VERSION } });

    // Recorded: a second run changes nothing
    runAppMigrations(registry);
    runPackMigrations(installedPacks);
    expect(runs).toEqual({ shipped: 1, external: 1 });
  });

  it("runs a shipped pack's `pack` migration against the pack's own version, which the app's is not", () => {
    resetTestData();
    // The app is at TEST_APP_VERSION and the pack at 9.0.0, so a `pack` entry at 2.0.0 is pending on its own
    // line and would be far past the cap on the app's: the version it is compared to is the one the line names
    const ran: string[] = [];
    const manifest = { id: 'migrations-shipped-own-line', name: 'Shipped', version: '9.0.0' };
    registry.registerPack(
      { id: manifest.id, migrations: { pack: [{ target: '2.0.0', description: 'own line', up: () => { ran.push('2.0.0'); } }] } },
      { ...manifest, dir: builtInDir, shipped: true, manifest: manifest as never },
    );
    try {
      const targets = registry.packMigrationTargets('pack');
      expect(targets.filter(({ migrations }) => migrations?.length).map((t) => t.manifest.id),
        'a shipped pack is a `pack`-line target like any other').toContain(manifest.id);

      runPackMigrations(targets);
      expect(ran).toEqual(['2.0.0']);
      expect(appState.get().packVersions).toMatchObject({ [manifest.id]: '9.0.0' });
      expect(appState.get().version, 'and the app line is untouched by it').toBeFalsy();
    } finally {
      registry.unregisterPack(manifest.id);
    }
  });

  it("stops an external pack's migrations at a failure and records its version once they all ran, keeping other packs'", () => {
    resetTestData();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A disabled pack, not loaded this boot
    appState.update({ packVersions: { 'disabled-pack': '3.0.0' } });
    const ran: string[] = [];
    let failing: string | undefined = '1.1.0';
    const pack = {
      manifest: { id: 'failing-pack', version: '1.2.0' },
      migrations: ['1.1.0', '1.2.0'].map((target) => ({
        target,
        description: target,
        up: () => { if (target === failing) throw new Error('failed'); ran.push(target); },
      })),
    } satisfies PackMigrationTarget;

    runPackMigrations([pack]);
    expect(ran).toEqual([]);
    expect(appState.get().packVersions).toEqual({ 'disabled-pack': '3.0.0' });

    failing = undefined;
    runPackMigrations([pack]);
    expect(ran).toEqual(['1.1.0', '1.2.0']);
    expect(appState.get().packVersions).toEqual({ 'disabled-pack': '3.0.0', 'failing-pack': '1.2.0' });
    vi.restoreAllMocks();
  });
});

describe('which migrations run', () => {
  /** The gate pack's migrations that ran, and the one that fails when set */
  const ran: string[] = [];
  let failing: string | undefined;
  
  beforeAll(async () => {
    const packDir = path.join(builtInDir, 'migrations-gate');
    fs.mkdirSync(packDir);
    fs.writeFileSync(path.join(packDir, 'apack.json'), JSON.stringify({ id: 'migrations-gate', name: 'Gate', version: TEST_APP_VERSION }));
    // **Registered as an external pack, with its migrations on the app's line** — which the runner used to
    // refuse to look at. Every case below is therefore also the case that routing reads the declaration: a
    // beta's release migrations, the release cap, the development build and the failure all come from a pack
    // the app did not ship. Its own manifest version is TEST_APP_VERSION and is never compared to anything
    const registration = {
      id: 'migrations-gate',
      migrations: { app: ['0.3.14', '0.3.15', '0.3.16'].map((target) => ({
        target,
        description: target,
        up: () => {
          if (target === failing) throw new Error(`${target} failed`);
          ran.push(target);
        },
      })) },
    };
    const gateManifest = { id: 'migrations-gate', name: 'Gate', version: TEST_APP_VERSION };
    registry.registerPack(registration, { ...gateManifest, dir: builtInDir, shipped: false, manifest: gateManifest as never });
  });

  beforeEach(() => {
    resetTestData();
    ran.length = 0;
    failing = undefined;
    version.current = undefined;
    appState.update({ version: '0.3.14' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.APACK_ENV = 'test';
  });

  it("runs a beta's release migrations, not later ones, and again only when the beta's version changes", () => {
    version.current = '0.3.15-beta.0';
    expect(runAppMigrations(registry)).toBe(true);
    expect(ran).toEqual(['0.3.15']);
    expect(appState.get().version).toBe('0.3.15-beta.0');

    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.15']);

    version.current = '0.3.15-beta.1';
    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.15', '0.3.15']);

    version.current = '0.3.15';
    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.15', '0.3.15', '0.3.15']);
    expect(appState.get().version).toBe('0.3.15');
  });

  it("runs nothing past a release's version", () => {
    version.current = '0.3.15';
    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.15']);
  });

  it('runs every pending migration on a development build, on each boot', () => {
    process.env.APACK_ENV = 'development';
    version.current = '0.3.14';

    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.15', '0.3.16']);
    expect(appState.get().version).toBe('0.3.14');

    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.15', '0.3.16', '0.3.15', '0.3.16']);
  });

  it('stops at a failed migration and records no version, so the next boot runs from it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failing = '0.3.15';

    expect(runAppMigrations(registry)).toBe(false);
    expect(ran).toEqual([]);
    expect(appState.get().version).toBe('0.3.14');

    failing = undefined;
    expect(runAppMigrations(registry)).toBe(true);
    expect(ran).toEqual(['0.3.15', '0.3.16']);
    expect(appState.get().version).toBe(TEST_APP_VERSION);
  });
});
