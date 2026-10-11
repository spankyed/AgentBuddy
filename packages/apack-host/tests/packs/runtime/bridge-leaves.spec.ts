import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './test-host.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PACK_SNAPSHOT_FORMAT } from '@apack/sdk/build';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION } from '../../../src/packs/layout.ts';

/**
 * An installed pack's runtime has no node_modules: every @apack/sdk subpath it requires must come
 * from the host's bridge, including import-free leaves like cron and compare-versions.
 */
let packDir: string;
beforeEach(() => {
  // Outside the repo, so plain Node resolution can't find @apack/sdk
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-leaves-'));
});
afterEach(() => {
  fs.rmSync(packDir, { recursive: true, force: true });
});

describe('external pack runtime', () => {
  it('requires @apack/sdk/cron and @apack/sdk/utils/compare-versions through the bridge', async () => {
    fs.writeFileSync(path.join(packDir, 'apack.json'), JSON.stringify({ id: 'bridge-pack', name: 'Bridge', version: '1.0.0' }));
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: PACK_LAYOUT_VERSION, id: 'bridge-pack', version: '1.0.0', files: {} }));
    fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
    fs.mkdirSync(path.join(packDir, 'runtime'));
    fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `
      const { cronToHuman } = require('@apack/sdk/cron');
      const { compareVersions } = require('@apack/sdk/utils/compare-versions');
      exports.registration = { id: 'bridge-pack', services: { leaves: { cron: cronToHuman('0 * * * *'), newer: compareVersions('1.1.0', '1.0.0') } } };
    `);
    const { loadSingleExternalPack } = await import('../../../src/packs/runtime/loader.ts');

    const pack = loadSingleExternalPack({ id: 'bridge-pack', name: 'Bridge', version: '1.0.0' }, packDir);

    if ('problem' in pack) throw new Error(pack.problem);
    expect(pack.registration.services).toEqual({ leaves: { cron: expect.any(String), newer: 1 } });
  });

  /**
   * The require that is not made during the load. esbuild defers a module's body into an `__init` the
   * bundle calls on first use, so default-setup's `extensions/steps/action/runtime.ts` requires
   * `@apack/sdk/logger` when an action step first runs. A resolution scoped to the load is gone by then,
   * and applying the require cache cannot cover it, because Node resolves before it reads the cache.
   *
   * It is invisible in a checkout: the workspace `node_modules` above a pack answers the bare specifier.
   * This pack is in a temp dir, which is what an installed one is, so nothing answers but the host.
   */
  it('requires one lazily, after the load that produced it has returned', async () => {
    fs.writeFileSync(path.join(packDir, 'apack.json'), JSON.stringify({ id: 'lazy-pack', name: 'Lazy', version: '1.0.0' }));
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: PACK_LAYOUT_VERSION, id: 'lazy-pack', version: '1.0.0', files: {} }));
    fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
    fs.mkdirSync(path.join(packDir, 'runtime'));
    fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `
      exports.registration = { id: 'lazy-pack', services: { step: { run: () => typeof require('@apack/sdk/logger').createLogger } } };
    `);
    const { loadSingleExternalPack } = await import('../../../src/packs/runtime/loader.ts');

    const pack = loadSingleExternalPack({ id: 'lazy-pack', name: 'Lazy', version: '1.0.0' }, packDir);

    if ('problem' in pack) throw new Error(pack.problem);
    const step = (pack.registration.services as { step: { run: () => string } }).step;
    // Outside the load: the call happens here, with no bridge on the stack
    expect(step.run()).toBe('function');
  });
});
