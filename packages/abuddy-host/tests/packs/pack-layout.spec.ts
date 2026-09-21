import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PACK_LAYOUT_VERSION,
  createPackArchive,
  extractPackArchive,
  readPackIntegrity,
  sha256File,
  packFrontendFiles,
  stagePack,
  verifyPack,
} from '../../src/packs/pack-layout.ts';
import { installPackFromGitHub, installPackFromLocal, installPackFromUrl } from '../../src/packs/pack-installer.ts';

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
    ...overrides,
  }));
  write('dist/runtime/index.cjs', 'module.exports = { registration: { id: "demo-pack" } };');
  write('dist/runtime/index.cjs.map', '{}');
  write('dist/runtime/fe.js', 'export default {};');
  write('dist/runtime/seeds/actions.seed.json', '[]');
  write('dist/types/snapshot.json', '{"types":{}}');
  write('src/ignored.ts', 'not part of the pack');
  return root;
}

describe('stagePack', () => {
  it('assembles the pack layout with the manifest and checksums, without source maps', () => {
    const stage = path.join(tmp, 'stage');
    const info = stagePack(builtPack(), stage, { sdkVersion: '0.1.0', source: { commit: 'abc' } });

    expect(info).toMatchObject({ formatVersion: PACK_LAYOUT_VERSION, id: 'demo-pack', version: '1.2.3', hostVersion: '>=0.3.0', sdkVersion: '0.1.0', source: { commit: 'abc' } });
    expect(Object.keys(info.files).sort()).toEqual([
      'abuddy.json',
      'runtime/fe.js',
      'runtime/index.cjs',
      'runtime/seeds/actions.seed.json',
      'types/snapshot.json',
    ]);
    expect(info.files['runtime/index.cjs']).toBe(sha256File(path.join(stage, 'runtime/index.cjs')));

    expect(JSON.parse(fs.readFileSync(path.join(stage, 'abuddy.json'), 'utf-8'))).toEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'src-pack', 'abuddy.json'), 'utf-8')));
    expect(readPackIntegrity(stage)).toEqual(info);
  });

  it('refuses a pack that has not been built in the pack layout', () => {
    const root = builtPack();
    fs.rmSync(path.join(root, 'dist', 'runtime'), { recursive: true });
    expect(() => stagePack(root, path.join(tmp, 'stage'))).toThrow(/not built/);
  });

  // A dependent range-checks the version in the snapshot (fetch-deps' inRange) while the app and the
  // installer read abuddy.json, so a staged pack naming two versions is two answers to "which version
  // is this". Staging the built manifest as it is keeps there being one.
  it('stages one version: the built manifest, which integrity and the built snapshot agree on', () => {
    const root = builtPack();
    fs.writeFileSync(
      path.join(root, 'dist', 'types', 'snapshot.json'),
      JSON.stringify({ types: {}, manifest: { id: 'demo-pack', version: '1.2.3' } }),
    );
    const stage = path.join(tmp, 'stage');

    const integrity = stagePack(root, stage);

    const staged = (rel: string) => JSON.parse(fs.readFileSync(path.join(stage, rel), 'utf-8'));
    expect([integrity.version, staged('abuddy.json').version, staged('types/snapshot.json').manifest.version])
      .toEqual(['1.2.3', '1.2.3', '1.2.3']);
  });
});

describe('packFrontendFiles', () => {
  it("lists the pack's FE entry and stylesheet only when the build wrote them", () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    expect(packFrontendFiles(stage)).toEqual({ entry: 'runtime/fe.js', styles: undefined });

    fs.writeFileSync(path.join(stage, 'runtime', 'fe.css'), '.x{}');
    expect(packFrontendFiles(stage)).toEqual({ entry: 'runtime/fe.js', styles: 'runtime/fe.css' });

    fs.rmSync(path.join(stage, 'runtime', 'fe.js'));
    fs.rmSync(path.join(stage, 'runtime', 'fe.css'));
    expect(packFrontendFiles(stage)).toEqual({ entry: undefined, styles: undefined });
  });
});

describe('verifyPack', () => {
  it('accepts an untouched bundle', () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    expect(verifyPack(stage).id).toBe('demo-pack');
  });

  it('reports modified, missing and unexpected files', () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    fs.appendFileSync(path.join(stage, 'runtime/index.cjs'), '\n// tampered');
    fs.rmSync(path.join(stage, 'runtime/fe.js'));
    fs.writeFileSync(path.join(stage, 'runtime/extra.js'), '');

    const message = (() => { try { verifyPack(stage); return ''; } catch (e) { return (e as Error).message; } })();
    expect(message).toContain('checksum mismatch runtime/index.cjs');
    expect(message).toContain('missing runtime/fe.js');
    expect(message).toContain('unexpected runtime/extra.js');
  });

  it('rejects an unsupported format version', () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    const info = readPackIntegrity(stage);
    fs.writeFileSync(path.join(stage, 'integrity.json'), JSON.stringify({ ...info, formatVersion: PACK_LAYOUT_VERSION + 1 }));
    expect(() => verifyPack(stage)).toThrow(/uses format/);
  });
});

describe('bundle archives', () => {
  it('round-trips through a reproducible .tgz with a matching .sha256 file', async () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);

    const first = await createPackArchive(stage, path.join(tmp, 'out1'));
    const second = await createPackArchive(stage, path.join(tmp, 'out2'));
    expect(path.basename(first.file)).toBe('demo-pack-1.2.3.tgz');
    expect(second.sha256).toBe(first.sha256);
    expect(fs.readFileSync(first.checksumFile, 'utf-8')).toBe(`${first.sha256}  demo-pack-1.2.3.tgz\n`);

    const extracted = await extractPackArchive(first.file, path.join(tmp, 'extract'), first.sha256);
    expect(path.basename(extracted)).toBe('demo-pack');
    expect(verifyPack(extracted).version).toBe('1.2.3');
  });

  it('refuses an archive whose checksum does not match', async () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    const { file } = await createPackArchive(stage, path.join(tmp, 'out'));
    await expect(extractPackArchive(file, path.join(tmp, 'extract'), '0'.repeat(64))).rejects.toThrow(/Checksum mismatch/);
  });
});

describe('installPackFromLocal (pack layout path)', () => {
  it('stages a built source pack and installs only the staged pack', async () => {
    const packsDir = path.join(tmp, 'packs');
    const result = await installPackFromLocal(builtPack(), packsDir);

    expect(result.integrity.id).toBe('demo-pack');
    expect(fs.readdirSync(result.dir).sort()).toEqual(['abuddy.json', 'integrity.json', 'runtime', 'types']);
    expect(verifyPack(result.dir).version).toBe('1.2.3');
    // no staging or replacement leftovers in the packs dir
    expect(fs.readdirSync(packsDir)).toEqual(['demo-pack']);
  });

  it('installs a verified archive and replaces the previous version', async () => {
    const packsDir = path.join(tmp, 'packs');
    await installPackFromLocal(builtPack({ version: '1.0.0' }), packsDir);

    const stage = path.join(tmp, 'stage');
    stagePack(builtPack({ version: '2.0.0' }), stage);
    const { file, sha256 } = await createPackArchive(stage, path.join(tmp, 'out'));
    const result = await installPackFromLocal(file, packsDir, { sha256 });

    expect(result.version).toBe('2.0.0');
    expect(fs.readdirSync(packsDir)).toEqual(['demo-pack']);
  });

  it('refuses a tampered bundle and leaves the installed version in place', async () => {
    const packsDir = path.join(tmp, 'packs');
    await installPackFromLocal(builtPack({ version: '1.0.0' }), packsDir);

    const stage = path.join(tmp, 'stage');
    stagePack(builtPack({ version: '2.0.0' }), stage);
    fs.appendFileSync(path.join(stage, 'runtime/index.cjs'), '\n// tampered');

    await expect(installPackFromLocal(stage, packsDir)).rejects.toThrow(/failed verification/);
    expect(JSON.parse(fs.readFileSync(path.join(packsDir, 'demo-pack', 'abuddy.json'), 'utf-8')).version).toBe('1.0.0');
    expect(fs.readdirSync(packsDir)).toEqual(['demo-pack']);
  });

  it('refuses an unbuilt pack directory, naming the build it needs', async () => {
    const root = builtPack();
    fs.rmSync(path.join(root, 'dist'), { recursive: true });
    await expect(installPackFromLocal(root, path.join(tmp, 'packs'))).rejects.toThrow(
      /^Pack demo-pack is not built: .* has no integrity\.json and no dist\/runtime\/index\.cjs with dist\/types\/snapshot\.json\. Run "abuddy build" first\.$/,
    );
    expect(fs.existsSync(path.join(tmp, 'packs', 'demo-pack'))).toBe(false);
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

describe('installPackFromLocal (checksums)', () => {
  /** The built pack zipped up, or null where `zip` isn't installed. */
  function zippedPack(): string | null {
    const zipPath = path.join(tmp, 'pack.zip');
    try {
      execFileSync('zip', ['-r', zipPath, '.'], { cwd: builtPack(), stdio: 'pipe' });
    } catch {
      return null;
    }
    return zipPath;
  }

  it('refuses a .zip whose checksum does not match, unpacking nothing', async () => {
    const zipPath = zippedPack();
    if (!zipPath) return;
    const packsDir = path.join(tmp, 'packs');

    await expect(installPackFromLocal(zipPath, packsDir, { sha256: '0'.repeat(64) })).rejects.toThrow(/Checksum mismatch for pack\.zip/);
    expect(fs.readdirSync(packsDir)).toEqual([]);
  });

  it('installs a .zip whose checksum matches', async () => {
    const zipPath = zippedPack();
    if (!zipPath) return;
    const packsDir = path.join(tmp, 'packs');

    const result = await installPackFromLocal(zipPath, packsDir, { sha256: sha256File(zipPath) });
    expect(result.version).toBe('1.2.3');
  });
});

describe('installPackFromGitHub', () => {
  /** A release of demo-pack serving its archive from memory; `checksum` defaults to the archive's own, null publishes none. */
  async function mockRelease(checksum?: string | null) {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    const { file, sha256 } = await createPackArchive(stage, path.join(tmp, 'out'));
    const name = path.basename(file);
    const published = checksum === undefined ? sha256 : checksum;
    const assets = [
      { name, browser_download_url: `https://example.test/${name}` },
      ...(published === null ? [] : [{ name: `${name}.sha256`, browser_download_url: `https://example.test/${name}.sha256` }]),
    ];

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify({ assets }), { status: 200 });
      if (url.endsWith('.sha256')) return new Response(`${published}  ${name}\n`, { status: 200 });
      return new Response(fs.readFileSync(file), { status: 200 });
    }));
    return { name };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('installs a release whose published checksum matches the archive', async () => {
    await mockRelease();

    const result = await installPackFromGitHub('acme/pack', path.join(tmp, 'packs'));
    expect(result.version).toBe('1.2.3');
  });

  it('refuses a release with no checksum asset, naming how to publish one', async () => {
    const { name } = await mockRelease(null);

    await expect(installPackFromGitHub('acme/pack@v1.2.3', path.join(tmp, 'packs'))).rejects.toThrow(
      `Release v1.2.3 of acme/pack has no ${name}.sha256; publish one with "abuddy release", or install with a checksum you know`,
    );
    expect(fs.existsSync(path.join(tmp, 'packs'))).toBe(false);
  });

  it("refuses a release whose published checksum isn't the archive's", async () => {
    await mockRelease('0'.repeat(64));

    await expect(installPackFromGitHub('acme/pack', path.join(tmp, 'packs'))).rejects.toThrow(/Checksum mismatch/);
  });

  it('refuses a checksum file that holds something else', async () => {
    await mockRelease('not a checksum');

    await expect(installPackFromGitHub('acme/pack', path.join(tmp, 'packs'))).rejects.toThrow(/doesn't hold a sha256 checksum/);
  });
});

describe('installPackFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads the archive under a timeout and installs it', async () => {
    const stage = path.join(tmp, 'stage');
    stagePack(builtPack(), stage);
    const { file, sha256 } = await createPackArchive(stage, path.join(tmp, 'out'));
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(fs.readFileSync(file), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await installPackFromUrl('https://example.test/demo-pack-1.2.3.tgz', path.join(tmp, 'packs'), { sha256 });
    expect(result.version).toBe('1.2.3');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('names the URL when the download times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('The operation was aborted due to timeout'); }));

    await expect(installPackFromUrl('https://example.test/demo-pack-1.2.3.tgz', path.join(tmp, 'packs'))).rejects.toThrow(
      'Downloading https://example.test/demo-pack-1.2.3.tgz failed: The operation was aborted due to timeout',
    );
  });
});
