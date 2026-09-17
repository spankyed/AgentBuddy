// The boot's migrations runners: a built-in pack's migration runs against the app version, an external pack's against
// its own, each once, and both versions are recorded
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PackMigration } from '@abuddy/sdk/framework';
import { registry, TEST_APP_VERSION } from '../packs/runtime/test-host.ts';

const runs = vi.hoisted(() => ({ builtIn: 0, external: 0 }));

import { loadBuiltInPacks, registerExternalPacks, type LoadedPack } from '../../src/packs/runtime/index.ts';
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
    const external = {
      manifest: { id: 'migrations-external', name: 'External', version: TEST_APP_VERSION } as LoadedPack['manifest'],
      dir: builtInDir,
      systems: new Map(),
      migrations: [externalMigration],
    } satisfies LoadedPack;
    const externalPacks = registerExternalPacks(registry, [external]);
    expect(externalPacks).toHaveLength(1);

    // The boot's order (the API's setup/backend.ts)
    runAppMigrations(registry);
    runPackMigrations(registry, externalPacks);

    expect(runs.builtIn).toBe(1);
    expect(runs.external).toBe(1);
    expect(appState.get()).toMatchObject({ version: TEST_APP_VERSION, packVersions: { 'migrations-external': TEST_APP_VERSION } });

    // Recorded: a second run changes nothing
    runAppMigrations(registry);
    runPackMigrations(registry, externalPacks);
    expect(runs).toEqual({ builtIn: 1, external: 1 });
  });
});
