import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUNDLE_FORMAT_VERSION,
  createBundleArchive,
  extractBundleArchive,
  readBundleInfo,
  sha256File,
  stageBundle,
  verifyBundle,
} from '../../src/packs/bundle';
import { installPackFromLocal } from '../../src/packs/pack-installer';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-spec-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A pack source dir as `abuddy build` leaves it. */
function builtPack(overrides: Record<string, unknown> = {}): string {
  const root = path.join(tmp, 'src-pack');
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write('abuddy.json', JSON.stringify({
    id: 'demo-pack',
    name: 'Demo Pack',
    version: '1.2.3',
    hostVersion: '>=0.3.0',
    fe: { entry: 'dist/fe.js', styles: 'dist/fe.css' },
    ...overrides,
  }));
  write('dist/runtime/index.cjs', 'module.exports = { registration: { id: "demo-pack", systems: [] } };');
  write('dist/runtime/index.cjs.map', '{}');
  write('dist/runtime/fe.js', 'export default {};');
  write('dist/runtime/seeds/actions.seed.json', '[]');
  write('dist/types/snapshot.json', '{"types":{}}');
  write('src/ignored.ts', 'not part of the bundle');
  return root;
}

describe('stageBundle', () => {
  it('assembles the bundle layout with a resolved manifest and checksums, without source maps', () => {
    const stage = path.join(tmp, 'stage');
    const info = stageBundle(builtPack(), stage, { sdkVersion: '0.1.0', source: { commit: 'abc' } });

    expect(info).toMatchObject({ formatVersion: BUNDLE_FORMAT_VERSION, id: 'demo-pack', version: '1.2.3', hostVersion: '>=0.3.0', sdkVersion: '0.1.0', source: { commit: 'abc' } });
    expect(Object.keys(info.files).sort()).toEqual([
      'abuddy.json',
      'runtime/fe.js',
      'runtime/index.cjs',
      'runtime/seeds/actions.seed.json',
      'types/snapshot.json',
    ]);
    expect(info.files['runtime/index.cjs']).toBe(sha256File(path.join(stage, 'runtime/index.cjs')));

    const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'abuddy.json'), 'utf-8'));
    // styles removed: the build produced no fe.css
    expect(manifest.fe).toEqual({ entry: 'runtime/fe.js' });
    expect(readBundleInfo(stage)).toEqual(info);
  });

  it('refuses a pack that has not been built in the bundle layout', () => {
    const root = builtPack();
    fs.rmSync(path.join(root, 'dist', 'runtime'), { recursive: true });
    expect(() => stageBundle(root, path.join(tmp, 'stage'))).toThrow(/not built/);
  });
});

describe('verifyBundle', () => {
  it('accepts an untouched bundle', () => {
    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack(), stage);
    expect(verifyBundle(stage).id).toBe('demo-pack');
  });

  it('reports modified, missing and unexpected files', () => {
    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack(), stage);
    fs.appendFileSync(path.join(stage, 'runtime/index.cjs'), '\n// tampered');
    fs.rmSync(path.join(stage, 'runtime/fe.js'));
    fs.writeFileSync(path.join(stage, 'runtime/extra.js'), '');

    const message = (() => { try { verifyBundle(stage); return ''; } catch (e) { return (e as Error).message; } })();
    expect(message).toContain('checksum mismatch runtime/index.cjs');
    expect(message).toContain('missing runtime/fe.js');
    expect(message).toContain('unexpected runtime/extra.js');
  });

  it('rejects an unsupported format version', () => {
    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack(), stage);
    const info = readBundleInfo(stage);
    fs.writeFileSync(path.join(stage, 'bundle.json'), JSON.stringify({ ...info, formatVersion: BUNDLE_FORMAT_VERSION + 1 }));
    expect(() => verifyBundle(stage)).toThrow(/uses format/);
  });
});

describe('bundle archives', () => {
  it('round-trips through a reproducible .tgz with a matching .sha256 file', async () => {
    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack(), stage);

    const first = await createBundleArchive(stage, path.join(tmp, 'out1'));
    const second = await createBundleArchive(stage, path.join(tmp, 'out2'));
    expect(path.basename(first.file)).toBe('demo-pack-1.2.3.tgz');
    expect(second.sha256).toBe(first.sha256);
    expect(fs.readFileSync(first.checksumFile, 'utf-8')).toBe(`${first.sha256}  demo-pack-1.2.3.tgz\n`);

    const extracted = await extractBundleArchive(first.file, path.join(tmp, 'extract'), first.sha256);
    expect(path.basename(extracted)).toBe('demo-pack');
    expect(verifyBundle(extracted).version).toBe('1.2.3');
  });

  it('refuses an archive whose checksum does not match', async () => {
    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack(), stage);
    const { file } = await createBundleArchive(stage, path.join(tmp, 'out'));
    await expect(extractBundleArchive(file, path.join(tmp, 'extract'), '0'.repeat(64))).rejects.toThrow(/Checksum mismatch/);
  });
});

describe('installPackFromLocal (bundle path)', () => {
  it('stages a built source pack and installs only the bundle', async () => {
    const packsDir = path.join(tmp, 'packs');
    const result = await installPackFromLocal(builtPack(), packsDir);

    expect(result.bundle?.id).toBe('demo-pack');
    expect(fs.readdirSync(result.dir).sort()).toEqual(['abuddy.json', 'bundle.json', 'runtime', 'types']);
    expect(verifyBundle(result.dir).version).toBe('1.2.3');
    // no staging or replacement leftovers in the packs dir
    expect(fs.readdirSync(packsDir)).toEqual(['demo-pack']);
  });

  it('installs a verified archive and replaces the previous version', async () => {
    const packsDir = path.join(tmp, 'packs');
    await installPackFromLocal(builtPack({ version: '1.0.0' }), packsDir);

    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack({ version: '2.0.0' }), stage);
    const { file, sha256 } = await createBundleArchive(stage, path.join(tmp, 'out'));
    const result = await installPackFromLocal(file, packsDir, { sha256 });

    expect(result.version).toBe('2.0.0');
    expect(fs.readdirSync(packsDir)).toEqual(['demo-pack']);
  });

  it('refuses a tampered bundle and leaves the installed version in place', async () => {
    const packsDir = path.join(tmp, 'packs');
    await installPackFromLocal(builtPack({ version: '1.0.0' }), packsDir);

    const stage = path.join(tmp, 'stage');
    stageBundle(builtPack({ version: '2.0.0' }), stage);
    fs.appendFileSync(path.join(stage, 'runtime/index.cjs'), '\n// tampered');

    await expect(installPackFromLocal(stage, packsDir)).rejects.toThrow(/failed verification/);
    expect(JSON.parse(fs.readFileSync(path.join(packsDir, 'demo-pack', 'abuddy.json'), 'utf-8')).version).toBe('1.0.0');
    expect(fs.readdirSync(packsDir)).toEqual(['demo-pack']);
  });

  it('refuses a pack the host version does not satisfy', async () => {
    await expect(
      installPackFromLocal(builtPack({ hostVersion: '>=99.0.0' }), path.join(tmp, 'packs'), { hostVersion: '0.3.14' }),
    ).rejects.toThrow(/requires AgentBuddy >=99\.0\.0; this is 0\.3\.14/);
  });

  it('accepts prerelease hosts within range', async () => {
    const result = await installPackFromLocal(builtPack({ hostVersion: '>=0.3.0' }), path.join(tmp, 'packs'), { hostVersion: '0.3.15-beta.1' });
    expect(result.id).toBe('demo-pack');
  });
});
