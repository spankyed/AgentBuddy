import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerHostModule } from '@abuddy/sdk/runtime';
import type { PackMigration } from '@abuddy/sdk/framework';

const runs = vi.hoisted(() => ({ builtIn: 0, external: 0 }));

const internal = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));

vi.mock('@abuddy/host/settings', () => ({
  settingsRepository: {
    settingsQueries: { getInternalSettings: () => internal.settings },
    settingsCommands: {
      updateSettings: (_group: string, _id: null, [key]: string[], value: unknown) => {
        internal.settings = { ...internal.settings, [key]: value };
      },
    },
  },
}));

vi.mock('virtual:built-in-pack-loaders', async () => {
  const { APP_VERSION } = await import('@/version');
  const registration = {
    id: 'migrations-built-in',
    systems: [],
    migrations: [{ target: APP_VERSION, description: 'built-in', up: () => { runs.builtIn++; } }],
  };
  return { default: { 'migrations-built-in': async () => ({ registration }) } };
});

const noop = () => {};
registerHostModule('logger', {
  createLogger: () => ({ debug: noop, info: noop, warn: noop, error: noop }),
  LogEvent: {},
});

import { APP_VERSION } from '@/version';
import { loadBuiltInPacks, registerExternalPacks, type LoadedPack } from '@/packs/pack-loader';
import { runMigrations, runPackMigrations } from '@/setup/migrations';
import { unregisterPack } from '@abuddy/host/packs';

let builtInDir: string;

beforeAll(() => {
  builtInDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-spec-'));
  const packDir = path.join(builtInDir, 'migrations-built-in');
  fs.mkdirSync(packDir);
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({
    id: 'migrations-built-in', name: 'Built-in', version: APP_VERSION, builtIn: true,
  }));
});

afterAll(() => {
  unregisterPack('migrations-built-in');
  unregisterPack('migrations-external');
  fs.rmSync(builtInDir, { recursive: true, force: true });
});

describe('boot migrations', () => {
  it("runs a built-in pack's migration and an external pack's migration once each", async () => {
    internal.settings = { version: '0.0.0', packVersions: {} };

    await loadBuiltInPacks(builtInDir, { runtimeEntry: 'never' });

    const externalMigration: PackMigration = { target: APP_VERSION, description: 'external', up: () => { runs.external++; } };
    const external = {
      manifest: { id: 'migrations-external', name: 'External', version: APP_VERSION } as LoadedPack['manifest'],
      dir: builtInDir,
      systems: new Map(),
      migrations: [externalMigration],
    } satisfies LoadedPack;
    const externalPacks = registerExternalPacks([external]);
    expect(externalPacks).toHaveLength(1);

    // The boot's order (setup/backend.ts)
    runMigrations();
    runPackMigrations(externalPacks);

    expect(runs.builtIn).toBe(1);
    expect(runs.external).toBe(1);
    expect(internal.settings).toMatchObject({ version: APP_VERSION, packVersions: { 'migrations-external': APP_VERSION } });
  });
});
