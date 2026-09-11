import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('virtual:built-in-pack-loaders', () => ({ default: {} }));

import { registerHostModule } from '../../../abuddy-sdk/src/runtime/host';

const noop = () => {};
const noopLogger = { debug: noop, info: noop, warn: noop, error: noop };
registerHostModule('logger', {
  createLogger: () => noopLogger,
  LogEvent: {},
});

let tmpDir: string;
let origCwd: string;
let origUDP: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-lifecycle-'));
  origCwd = process.cwd();
  origUDP = process.env.USER_DATA_PATH;
  process.env.USER_DATA_PATH = tmpDir;
});

afterEach(() => {
  process.chdir(origCwd);
  if (origUDP === undefined) delete process.env.USER_DATA_PATH;
  else process.env.USER_DATA_PATH = origUDP;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const packsDir = () => path.join(tmpDir, 'packs');

describe('pack full lifecycle: init → install → discover', () => {
  it('scaffolded pack can be installed and discovered by pack-loader', async () => {
    const { init } = await import('../../../abuddy-sdk/src/cli/commands/init');
    const { installPackFromLocal } = await import('../../../abuddy-sdk/src/packs/pack-installer');

    // Step 1: Init
    process.chdir(tmpDir);
    await init(['my-test-pack']);

    const packDir = path.join(tmpDir, 'my-test-pack');
    expect(fs.existsSync(path.join(packDir, 'abuddy.json'))).toBe(true);

    // Step 2: Manually create a dist/ with a simple system (build requires esbuild + SDK deps)
    fs.mkdirSync(path.join(packDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'dist', 'system.cjs'), `
      module.exports = {
        default: {
          id: 'my-test-pack-system',
          initial: 'idle',
          states: { idle: {} },
        },
      };
    `);

    // Update manifest to declare a feature with the system
    const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8'));
    delete manifest.hostVersion;
    manifest.plugins = [{
      id: 'main',
      system: {
        entry: 'dist/system.cjs',
        events: { incoming: ['TEST_EVENT'] },
      },
      plugin: {
        entry: 'dist/plugin.js',
        label: 'My Test',
        icon: 'Zap',
      },
    }];
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify(manifest, null, 2));

    // Step 3: Install to test packs dir
    await installPackFromLocal(packDir, packsDir());

    const installedDir = path.join(packsDir(), 'my-test-pack');
    expect(fs.existsSync(installedDir)).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'abuddy.json'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'dist', 'system.cjs'))).toBe(true);

    // Step 4: Discover via pack-loader (uses USER_DATA_PATH → tmpDir)
    const { loadExternalPacks } = await import('@/packs/pack-loader');

    const packs = loadExternalPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0].manifest.id).toBe('my-test-pack');
    expect(packs[0].manifest.name).toBe('My Test Pack');
    expect(packs[0].systems.has('main')).toBe(true);
    expect(packs[0].systems.get('main')!.events.has('TEST_EVENT')).toBe(true);
  });

  it('update flow: reinstalling overwrites the previous version', async () => {
    const { installPackFromLocal } = await import('../../../abuddy-sdk/src/packs/pack-installer');

    const sourceDir = path.join(tmpDir, 'update-pack');
    fs.mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });

    // v1
    fs.writeFileSync(path.join(sourceDir, 'abuddy.json'), JSON.stringify({
      id: 'update-pack',
      name: 'Update Pack',
      version: '1.0.0',
    }));
    fs.writeFileSync(path.join(sourceDir, 'dist', 'v1.txt'), 'version 1');

    await installPackFromLocal(sourceDir, packsDir());

    const installedDir = path.join(packsDir(), 'update-pack');
    expect(fs.existsSync(path.join(installedDir, 'dist', 'v1.txt'))).toBe(true);

    // v2 — new file, remove old one
    fs.writeFileSync(path.join(sourceDir, 'abuddy.json'), JSON.stringify({
      id: 'update-pack',
      name: 'Update Pack',
      version: '2.0.0',
    }));
    fs.unlinkSync(path.join(sourceDir, 'dist', 'v1.txt'));
    fs.writeFileSync(path.join(sourceDir, 'dist', 'v2.txt'), 'version 2');

    await installPackFromLocal(sourceDir, packsDir());

    // v1 file should be gone (rmSync + fresh copy)
    expect(fs.existsSync(path.join(installedDir, 'dist', 'v1.txt'))).toBe(false);
    expect(fs.existsSync(path.join(installedDir, 'dist', 'v2.txt'))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(installedDir, 'abuddy.json'), 'utf-8'));
    expect(manifest.version).toBe('2.0.0');
  });

  it('hostVersion gating prevents loading incompatible packs', async () => {
    const { installPackFromLocal } = await import('../../../abuddy-sdk/src/packs/pack-installer');

    const sourceDir = path.join(tmpDir, 'future-pack');
    fs.mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'abuddy.json'), JSON.stringify({
      id: 'future-pack',
      name: 'Future Pack',
      version: '1.0.0',
      hostVersion: '>=99.0.0',
    }));
    fs.writeFileSync(path.join(sourceDir, 'dist', 'placeholder'), '');

    await installPackFromLocal(sourceDir, packsDir());

    const { loadExternalPacks } = await import('@/packs/pack-loader');
    const packs = loadExternalPacks();

    // Pack is discovered but skipped due to hostVersion
    expect(packs).toEqual([]);
  });

  it('multiple packs coexist and all get discovered', async () => {
    const { installPackFromLocal } = await import('../../../abuddy-sdk/src/packs/pack-installer');

    for (const id of ['pack-alpha', 'pack-beta', 'pack-gamma']) {
      const dir = path.join(tmpDir, id);
      fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({
        id,
        name: id.replace('-', ' '),
        version: '1.0.0',
      }));
      fs.writeFileSync(path.join(dir, 'dist', 'placeholder'), '');
      await installPackFromLocal(dir, packsDir());
    }

    const { loadExternalPacks } = await import('@/packs/pack-loader');
    const packs = loadExternalPacks();
    const ids = packs.map(p => p.manifest.id).sort();
    expect(ids).toEqual(['pack-alpha', 'pack-beta', 'pack-gamma']);
  });
});
