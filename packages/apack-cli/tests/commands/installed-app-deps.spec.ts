import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPackArchive, installPackFromLocal, stagePack } from '@apack/host/packs';
import { resolveDepFiles } from '../../src/commands/fetch-deps';
import { PACK_SNAPSHOT_FORMAT } from '@apack/sdk/build';
import { _appDirOf } from '@apack/sdk/env';
import { PACK_LAYOUT } from '@apack/host/packs';

let tmp: string;
const saved = { env: process.env.APACK_ENV, dir: process.env.APACK_USER_DATA_DIR, build: process.env.APACK_BUILD };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-app-deps-'));
  process.env.APACK_USER_DATA_DIR = path.join(tmp, 'userdata');
  delete process.env.APACK_BUILD;
});

afterEach(() => {
  for (const [key, value] of [['APACK_ENV', saved.env], ['APACK_USER_DATA_DIR', saved.dir], ['APACK_BUILD', saved.build]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

function builtInPack(snapshot: object = { types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version: '1.0.0' }, format: PACK_SNAPSHOT_FORMAT }) {
  // Deliberately not a sibling/workspace path of the author pack, so only the installed-app source can find it
  const dir = path.join(tmp, 'app-bundle', 'resources', 'default-pack-source');
  fs.mkdirSync(path.join(dir, 'dist', 'build'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist', PACK_LAYOUT.typesDir), { recursive: true });
  // The manifest beside `dist/`, as the app ships a pack and as installing one requires
  const version = (snapshot as { manifest?: { version?: string } }).manifest?.version ?? '1.0.0';
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify({ id: 'base-pack', name: 'Base Pack', version }));
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.snapshot), JSON.stringify(snapshot));
  fs.writeFileSync(path.join(dir, 'dist', 'build', 'steps.build.mjs'), 'export const steps = [];');
  fs.mkdirSync(path.join(dir, 'dist', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'runtime', 'index.cjs'), 'exports.registration = { id: "base-pack" };');
  // Compiled content at the top of a shipped pack's dist, beside files that aren't content
  // Compiled content, where `apack build` writes them for every pack
  fs.mkdirSync(path.join(dir, 'dist', PACK_LAYOUT.contentDir), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.contentDir, 'settings.content.json'), '{"theme":"dark"}');
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.contentDir, 'content.json'), '{"version":1,"content":[]}');
  fs.mkdirSync(path.join(dir, 'dist', PACK_LAYOUT.contentDir, 'media', 'library'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.contentDir, 'media', 'library', 'pic.png'), 'PNG');
  fs.mkdirSync(path.join(dir, 'dist', 'defs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'defs', 'actions.d.ts'), '');
  return dir;
}

describe('dependency resolution from an installed app', () => {
  /** The app's packs dir, where an installed pack is — the ones the app ships among them */
  const packsDir = () => {
    const dir = path.join(_appDirOf(path.join(tmp, 'userdata')), 'packs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  it('resolves a shipped dependency (snapshot, step build code, runtime) from the installed app, and caches it in the pack', async () => {
    await installPackFromLocal(builtInPack(), packsDir());

    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.id).toBe('base-pack');
    expect(artifacts?.buildDir).toBe(path.join(packRoot, '.apack', 'deps', 'base-pack', 'build'));
    expect(fs.existsSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'))).toBe(true);
    expect(artifacts?.runtimeEntry).toBe(path.join(packRoot, '.apack', 'deps', 'base-pack', 'runtime', 'index.cjs'));
    expect(fs.readFileSync(artifacts!.runtimeEntry!, 'utf-8')).toContain('registration');
    expect(artifacts?.contentDir).toBe(path.join(packRoot, '.apack', 'deps', 'base-pack', 'runtime', 'content'));
    expect(fs.readdirSync(artifacts!.contentDir!).sort()).toEqual(['content.json', 'media', 'settings.content.json']);
  });

  it('reports where the dependency resolved from, and reports nothing for a later cache hit', async () => {
    await installPackFromLocal(builtInPack(), packsDir());
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    expect((await resolveDepFiles(packRoot, 'base-pack', '*'))?.resolvedFrom).toMatch(/^installed app \(/);

    // Once the app's copy is gone the cache stands in, and it records no provenance
    fs.rmSync(path.join(packsDir(), 'base-pack'), { recursive: true });
    const cached = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(cached?.snapshot.manifest.id).toBe('base-pack');
    expect(cached?.resolvedFrom).toBeUndefined();
  });

  it("drops a cached runtime when the dependency stops shipping one", async () => {
    const src = builtInPack();
    await installPackFromLocal(src, packsDir());
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    expect((await resolveDepFiles(packRoot, 'base-pack', '*'))?.runtimeEntry).toBeDefined();

    // The installed copy loses its runtime — an install cannot produce a pack without one, so this is the
    // state an update to a pack that dropped its backend leaves, read from the app rather than written by it
    fs.rmSync(path.join(packsDir(), 'base-pack', 'runtime'), { recursive: true });
    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.runtimeEntry).toBeUndefined();
    expect(fs.existsSync(path.join(packRoot, '.apack', 'deps', 'base-pack', 'runtime'))).toBe(false);
  });

  it('resolves a shipped dependency from the app configured for apack test, before the app has run', async () => {
    const checkout = path.join(tmp, 'apack');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(builtInPack(), path.join(checkout, 'packages', 'base-pack'));
    process.env.APACK_BUILD = checkout;

    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.id).toBe('base-pack');
    expect(fs.existsSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'))).toBe(true);
    // A checkout's shipped pack: dist/runtime/index.cjs, as default-setup's build writes it
    expect(fs.readFileSync(artifacts!.runtimeEntry!, 'utf-8')).toContain('registration');
  });

  /** A shipped pack's snapshot; `fields` overrides any of it, `format: undefined` included */
  const snapshotOf = (version: string, fields: object = {}) =>
    ({ types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version }, format: PACK_SNAPSHOT_FORMAT, ...fields });

  /** The pack installed in an app's data dir, as the app's boot leaves it */
  async function publishInstalled(version: string, steps = 'export const steps = [];', fields: object = {}) {
    const src = builtInPack(snapshotOf(version, fields));
    fs.writeFileSync(path.join(src, 'dist', 'build', 'steps.build.mjs'), steps);
    const dir = path.join(_appDirOf(path.join(tmp, 'userdata')), 'packs');
    fs.mkdirSync(dir, { recursive: true });
    await installPackFromLocal(src, dir);
  }

  function authorPack(): string {
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    return packRoot;
  }

  it('refreshes the cached dependency when the app provides a new version', async () => {
    const packRoot = authorPack();
    await publishInstalled('1.0.0', 'export const steps = ["v1"];');
    expect((await resolveDepFiles(packRoot, 'base-pack', '*'))?.snapshot.manifest.version).toBe('1.0.0');

    await publishInstalled('2.0.0', 'export const steps = ["v2"];');
    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.version).toBe('2.0.0');
    expect(fs.readFileSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'), 'utf-8')).toContain('v2');
  });

  it('only accepts a dependency version that satisfies the declared range, cached or not', async () => {
    const packRoot = authorPack();
    await publishInstalled('1.0.0');
    expect(await resolveDepFiles(packRoot, 'base-pack', '*')).not.toBeNull(); // now cached

    expect(await resolveDepFiles(packRoot, 'base-pack', '>=2.0.0')).toBeNull();
    expect((await resolveDepFiles(packRoot, 'base-pack', '^1.0.0'))?.snapshot.manifest.version).toBe('1.0.0');
  });

  it('prefers the app configured for apack test over an installed app', async () => {
    await publishInstalled('1.0.0');
    const checkout = path.join(tmp, 'apack');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(
      builtInPack(snapshotOf('3.0.0')),
      path.join(checkout, 'packages', 'base-pack'),
    );
    process.env.APACK_BUILD = checkout;

    expect((await resolveDepFiles(authorPack(), 'base-pack', '*'))?.snapshot.manifest.version).toBe('3.0.0');
  });

  it("resolves a dependency from the checkout a pack sits in at any depth, before an installed app's copy", async () => {
    await publishInstalled('1.0.0');
    const checkout = path.join(tmp, 'apack');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(
      builtInPack(snapshotOf('4.0.0')),
      path.join(checkout, 'packages', 'base-pack'),
    );
    // Three levels down, like tests/packs/external-pack
    const fixture = path.join(checkout, 'tests', 'packs', 'author-pack');
    fs.mkdirSync(fixture, { recursive: true });

    expect((await resolveDepFiles(fixture, 'base-pack', '*'))?.snapshot.manifest.version).toBe('4.0.0');
  });

  /**
   * A snapshot in another format is misread rather than refused by whatever reads it, so the format is
   * checked where a build is chosen, beside the version range.
   */
  describe('the snapshot format', () => {
    it('passes over a nearer build in another format for one in the format this CLI reads', async () => {
      await publishInstalled('1.0.0');
      const checkout = path.join(tmp, 'apack');
      fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
      fs.renameSync(builtInPack(snapshotOf('3.0.0', { format: undefined })), path.join(checkout, 'packages', 'base-pack'));
      process.env.APACK_BUILD = checkout;

      expect((await resolveDepFiles(authorPack(), 'base-pack', '*'))?.snapshot.manifest.version).toBe('1.0.0');
    });

    it('refuses a dependency found only in another format, naming where and which side is older', async () => {
      await publishInstalled('1.0.0', undefined, { format: undefined, sdkVersion: '0.3.14' });
      await expect(resolveDepFiles(authorPack(), 'base-pack', '*')).rejects.toThrow(
        `Dependency "base-pack" has no build this CLI can use:\n  - installed app (production): its snapshot is format (none), written by an older apack CLI (SDK 0.3.14); this CLI reads format ${PACK_SNAPSHOT_FORMAT}`,
      );

      await publishInstalled('1.0.0', undefined, { format: PACK_SNAPSHOT_FORMAT + 1 });
      await expect(resolveDepFiles(authorPack(), 'base-pack', '*')).rejects.toThrow(
        `its snapshot is format ${PACK_SNAPSHOT_FORMAT + 1}, written by a newer apack CLI; this CLI reads format ${PACK_SNAPSHOT_FORMAT}`,
      );
    });

    it('never serves a cached snapshot in another format', async () => {
      const packRoot = authorPack();
      await publishInstalled('1.0.0');
      expect(await resolveDepFiles(packRoot, 'base-pack', '*')).not.toBeNull(); // now cached
      fs.rmSync(path.join(_appDirOf(path.join(tmp, 'userdata')), 'packs', 'base-pack'), { recursive: true });
      fs.writeFileSync(path.join(packRoot, '.apack', 'deps', 'base-pack', 'snapshot.json'), JSON.stringify(snapshotOf('1.0.0', { format: undefined })));

      await expect(resolveDepFiles(packRoot, 'base-pack', '*')).rejects.toThrow('the .apack/deps cache: its snapshot is format (none)');
    });
  });

  /** An archived release of dep-pack in snapshot `format`, and its checksum, as `apack release` publishes them */
  async function publishedRelease(version: string, format: number | undefined) {
    const src = path.join(tmp, `dep-pack-${version}`);
    fs.mkdirSync(path.join(src, 'dist', 'types'), { recursive: true });
    fs.mkdirSync(path.join(src, 'dist', 'runtime'), { recursive: true });
    const manifest = { id: 'dep-pack', name: 'Dep', version };
    fs.writeFileSync(path.join(src, 'apack.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(src, 'dist', 'runtime', 'index.cjs'), 'exports.registration = { id: "dep-pack" };');
    fs.writeFileSync(path.join(src, 'dist', PACK_LAYOUT.snapshot), JSON.stringify({ types: { entities: {}, relKinds: {} }, defs: {}, manifest, format }));
    const stage = path.join(tmp, `stage-${version}`);
    stagePack(src, stage);
    const archive = await createPackArchive(stage, path.join(tmp, 'releases'));
    return {
      tag_name: `v${version}`,
      assets: [
        { name: `dep-pack-${version}.tgz`, url: `https://example.test/${path.basename(archive.file)}` },
        { name: `dep-pack-${version}.tgz.sha256`, url: `https://example.test/${path.basename(archive.checksumFile)}` },
      ],
    };
  }

  /** Serves `releases` from GitHub, recording each archive downloaded */
  function serveReleases(releases: unknown[]): string[] {
    const downloaded: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/releases?')) return new Response(JSON.stringify(releases));
      if (url.endsWith('.tgz')) downloaded.push(path.basename(url));
      return new Response(fs.readFileSync(path.join(tmp, 'releases', path.basename(url))));
    }));
    return downloaded;
  }

  // A GitHub dependency picks among releases as the local sources pick among builds: a newer release this CLI can't
  // read gives way to an older one in range that it can
  it('falls back to an older GitHub release in range when a newer CLI wrote the newest', async () => {
    const releases = [await publishedRelease('1.4.0', PACK_SNAPSHOT_FORMAT + 1), await publishedRelease('1.3.0', PACK_SNAPSHOT_FORMAT)];
    const downloaded = serveReleases(releases);
    try {
      const found = await resolveDepFiles(authorPack(), 'dep-pack', 'github:acme/dep-pack ^1.0.0');
      expect(found?.snapshot.manifest.version).toBe('1.3.0');
      expect(found?.resolvedFrom).toBe('github:acme/dep-pack@1.3.0');
      expect(downloaded).toEqual(['dep-pack-1.4.0.tgz', 'dep-pack-1.3.0.tgz']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Every release below one an older CLI wrote is older still: trying them would only spend downloads and rate limit
  it('stops at the newest GitHub release in range when an older CLI wrote it', async () => {
    const releases = [await publishedRelease('1.4.0', undefined), await publishedRelease('1.3.0', undefined)];
    const downloaded = serveReleases(releases);
    try {
      await expect(resolveDepFiles(authorPack(), 'dep-pack', 'github:acme/dep-pack ^1.0.0'))
        .rejects.toThrow(/github release 1\.4\.0: its snapshot is format \(none\), written by an older apack CLI/);
      expect(downloaded).toEqual(['dep-pack-1.4.0.tgz']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a GitHub release without the dependency's own archive checksum", async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requested.push(url);
      if (url.includes('/releases?')) {
        return new Response(JSON.stringify([{
          tag_name: 'v1.2.0',
          assets: [
            { name: 'other-pack-1.2.0.tgz', url: 'https://example.test/other.tgz' },
            { name: 'other-pack-1.2.0.tgz.sha256', url: 'https://example.test/other.sha256' },
            { name: 'dep-pack-1.2.0.tgz', url: 'https://example.test/dep.tgz' },
          ],
        }]));
      }
      return new Response('unexpected download', { status: 500 });
    }));
    try {
      expect(await resolveDepFiles(authorPack(), 'dep-pack', 'github:acme/dep-pack')).toBeNull();
      expect(requested).toEqual([expect.stringContaining('/repos/acme/dep-pack/releases')]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null when nothing provides the dependency', async () => {
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    expect(await resolveDepFiles(packRoot, 'missing-pack', '*')).toBeNull();
  });
});
