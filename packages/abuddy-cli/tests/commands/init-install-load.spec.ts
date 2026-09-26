// A pack `abuddy init` scaffolds installs, and the app's pack loader loads it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { installPackFromLocal } from '@abuddy/host/packs';
import { loadExternalPacks } from '@abuddy/host/packs/runtime';
import { init } from '../../src/commands/init';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';

// The loader checks each pack's hostVersion against the app version
startTestRuntime({ appVersion: '1.0.0' });

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-install-load-'));
  origCwd = process.cwd();
  vi.stubEnv('ABUDDY_ENV', 'test');
  vi.stubEnv('ABUDDY_USER_DATA_DIR', tmpDir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(origCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Writes what `abuddy build` leaves in a pack's dist/: a runtime registering `featuresSource`, and a snapshot */
function writeBuild(packDir: string, id: string, featuresSource: string) {
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(packDir, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'dist', rel), content);
  };
  write('runtime/index.cjs', `module.exports = { registration: { id: ${JSON.stringify(id)}, features: ${featuresSource} } };`);
  write('types/snapshot.json', JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
}

describe('pack full lifecycle: init → install → load', () => {
  it('scaffolded pack can be installed and loaded by the pack loader', async () => {
    process.chdir(tmpDir);
    await init(['my-test-pack']);

    const packDir = path.join(tmpDir, 'my-test-pack');
    expect(fs.existsSync(path.join(packDir, 'abuddy.json'))).toBe(true);

    // A built runtime with a simple system, standing in for abuddy build (which needs esbuild + SDK deps)
    const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8'));
    delete manifest.hostVersion;
    manifest.features = [{
      id: 'main',
      system: { entry: 'src/features/main/be/system.ts', events: { incoming: ['TEST_EVENT'] } },
      plugin: { entry: 'src/features/main/fe/plugin.ts' },
    }];
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify(manifest, null, 2));
    writeBuild(packDir, manifest.id, "{ main: { system: { machine: { id: 'my-test-pack-system' }, receives: ['TEST_EVENT'] }, plugin: { receives: [] } } }");

    const packsDir = path.join(tmpDir, 'packs');
    await installPackFromLocal(packDir, packsDir);

    const installedDir = path.join(packsDir, 'my-test-pack');
    expect(fs.existsSync(path.join(installedDir, 'abuddy.json'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'integrity.json'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'index.cjs'))).toBe(true);

    // The loader finds it under ABUDDY_USER_DATA_DIR
    const packs = loadExternalPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0].origin.id).toBe('my-test-pack');
    expect(packs[0].origin.name).toBe('My Test Pack');
    // abuddy build put the manifest's incoming events beside the machine's
    const main = packs[0].registration.features?.main?.system;
    expect(main).toBeDefined();
    expect(main!.receives).toContain('TEST_EVENT');
  });
});
