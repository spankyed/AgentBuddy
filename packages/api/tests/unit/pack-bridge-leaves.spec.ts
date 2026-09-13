import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerHostModule } from '@abuddy/sdk/runtime';

vi.mock('virtual:built-in-pack-loaders', () => ({ default: {} }));

const noop = () => {};
registerHostModule('logger', { createLogger: () => ({ debug: noop, info: noop, warn: noop, error: noop }), LogEvent: {} });

/**
 * An installed pack's runtime has no node_modules: every @abuddy/sdk subpath it requires must come
 * from the host's bridge, including import-free leaves like cron and compare-versions.
 */
let packDir: string;
beforeEach(() => {
  // Outside the repo, so plain Node resolution can't find @abuddy/sdk
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-leaves-'));
});
afterEach(() => {
  fs.rmSync(packDir, { recursive: true, force: true });
});

describe('external pack runtime', () => {
  it('requires @abuddy/sdk/cron and @abuddy/sdk/utils/compare-versions through the bridge', async () => {
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: 'bridge-pack', name: 'Bridge', version: '1.0.0' }));
    fs.mkdirSync(path.join(packDir, 'runtime'));
    fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `
      const { cronToHuman } = require('@abuddy/sdk/cron');
      const { compareVersions } = require('@abuddy/sdk/utils/compare-versions');
      exports.registration = { id: 'bridge-pack', systems: [], services: { leaves: { cron: cronToHuman('0 * * * *'), newer: compareVersions('1.1.0', '1.0.0') } } };
    `);
    const { loadSingleExternalPack } = await import('@/packs/pack-loader');

    const pack = loadSingleExternalPack({ id: 'bridge-pack', name: 'Bridge', version: '1.0.0' } as never, packDir);

    expect(pack?.services).toEqual({ leaves: { cron: expect.any(String), newer: 1 } });
  });
});
