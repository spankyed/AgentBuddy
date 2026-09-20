// The boot's migrations runners: a built-in pack's migration runs against the app version, an external pack's against
// its own, each once, and both versions are recorded. A beta runs its release's migrations (again when its version
// changes), a development build runs every pending one, and a failed migration stops the rest and records nothing.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PackMigration } from '@abuddy/sdk/framework';

// The migrations runner reads the app environment; a test build runs release rules
process.env.ABUDDY_ENV = 'test';
import { registry, TEST_APP_VERSION } from '../packs/runtime/test-host.ts';

const runs = vi.hoisted(() => ({ builtIn: 0, external: 0 }));

/** The app version the runner reads; the test host's unless a test sets one */
const version = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock('@abuddy/sdk/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@abuddy/sdk/env')>();
  return { ...actual, getAppVersion: () => version.current ?? actual.getAppVersion() };
});

import { loadBuiltInPacks, registerExternalPacks, type LoadedPack } from '../../src/packs/runtime/index.ts';
import type { PackMigrationTarget } from '../../src/migrations/index.ts';
import { runAppMigrations, runPackMigrations } from '../../src/migrations/index.ts';
import { appState } from '../../src/app-state/index.ts';
import { resetTestData } from '@abuddy/sdk/testing';

let builtInDir: string;

beforeAll(() => {
  builtInDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-spec-'));
  const packDir = path.join(builtInDir, 'migrations-built-in');
  fs.mkdirSync(packDir);
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({
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
  it("runs a built-in pack's migration and an external pack's migration once each", async () => {
    resetTestData();
    appState.update({ version: '0.0.0' });

    const registration = {
      id: 'migrations-built-in',
      systems: [],
      migrations: [{ target: TEST_APP_VERSION, description: 'built-in', up: () => { runs.builtIn++; } }],
    };
    await loadBuiltInPacks(registry, builtInDir, {
      runtimeEntry: 'never',
      bundledLoaders: async () => ({ 'migrations-built-in': async () => ({ registration }) }),
    });

    const externalMigration: PackMigration = { target: TEST_APP_VERSION, description: 'external', up: () => { runs.external++; } };
    const manifest = { id: 'migrations-external', name: 'External', version: TEST_APP_VERSION };
    const external = {
      registration: { id: manifest.id, systems: [], migrations: [externalMigration] },
      origin: { ...manifest, dir: builtInDir, builtIn: false, manifest: manifest as never },
    } satisfies LoadedPack;
    expect(registerExternalPacks(registry, [external])).toHaveLength(1);
    // What the boot passes on: the registry joins each registered pack's origin with its migrations
    const externalPacks = registry.externalPackTargets();

    // The boot's order (the API's setup/backend.ts)
    runAppMigrations(registry);
    runPackMigrations(externalPacks);

    expect(runs.builtIn).toBe(1);
    expect(runs.external).toBe(1);
    expect(appState.get()).toMatchObject({ version: TEST_APP_VERSION, packVersions: { 'migrations-external': TEST_APP_VERSION } });

    // Recorded: a second run changes nothing
    runAppMigrations(registry);
    runPackMigrations(externalPacks);
    expect(runs).toEqual({ builtIn: 1, external: 1 });
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
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: 'migrations-gate', name: 'Gate', version: TEST_APP_VERSION, builtIn: true }));
    const registration = {
      id: 'migrations-gate',
      systems: [],
      migrations: ['0.3.14', '0.3.15', '0.3.16'].map((target) => ({
        target,
        description: target,
        up: () => {
          if (target === failing) throw new Error(`${target} failed`);
          ran.push(target);
        },
      })),
    };
    await loadBuiltInPacks(registry, builtInDir, {
      runtimeEntry: 'never',
      bundledLoaders: async () => ({ 'migrations-gate': async () => ({ registration }) }),
    });
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
    process.env.ABUDDY_ENV = 'test';
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
    process.env.ABUDDY_ENV = 'development';
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
