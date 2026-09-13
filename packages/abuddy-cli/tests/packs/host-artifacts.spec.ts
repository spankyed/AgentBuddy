import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishHostPackArtifacts } from '@abuddy/sdk/packs';
import { resolveDepArtifacts } from '../../src/commands/fetch-deps';

let tmp: string;
const saved = { env: process.env.ABUDDY_ENV, dir: process.env.ABUDDY_USER_DATA_DIR, root: process.env.ABUDDY_ROOT };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-artifacts-'));
  process.env.ABUDDY_USER_DATA_DIR = path.join(tmp, 'userdata');
  delete process.env.ABUDDY_ROOT;
});

afterEach(() => {
  for (const [key, value] of [['ABUDDY_ENV', saved.env], ['ABUDDY_USER_DATA_DIR', saved.dir], ['ABUDDY_ROOT', saved.root]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

function builtInPack(snapshot = { types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version: '1.0.0' } }) {
  // Deliberately not a sibling/workspace path of the author pack, so only the installed-app source can find it
  const dir = path.join(tmp, 'app-bundle', 'resources', 'default-pack-source');
  fs.mkdirSync(path.join(dir, 'dist', 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'snapshot.json'), JSON.stringify(snapshot));
  fs.writeFileSync(path.join(dir, 'dist', 'build', 'steps.build.mjs'), 'export const steps = [];');
  return dir;
}

describe('publishHostPackArtifacts', () => {
  it('publishes types/ and build/ once and republishes only when they change', () => {
    const src = builtInPack();
    const dest = path.join(tmp, 'host-packs', 'base-pack');

    expect(publishHostPackArtifacts(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'types', 'snapshot.json'), 'utf-8')).toContain('base-pack');
    expect(fs.existsSync(path.join(dest, 'build', 'steps.build.mjs'))).toBe(true);
    expect(publishHostPackArtifacts(src, dest)).toBe(false);

    fs.writeFileSync(path.join(src, 'dist', 'build', 'steps.build.mjs'), 'export const steps = [1];');
    expect(publishHostPackArtifacts(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'build', 'steps.build.mjs'), 'utf-8')).toContain('[1]');
  });
});

describe('dependency resolution from an installed app', () => {
  it('resolves a built-in dependency (snapshot + step build code) the app published, and caches it in the pack', async () => {
    const hostPacks = path.join(tmp, 'userdata', 'host-packs');
    publishHostPackArtifacts(builtInPack(), path.join(hostPacks, 'base-pack'));

    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    const artifacts = await resolveDepArtifacts(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.id).toBe('base-pack');
    expect(artifacts?.buildDir).toBe(path.join(packRoot, '.abuddy', 'deps', 'base-pack', 'build'));
    expect(fs.existsSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'))).toBe(true);
  });

  it('resolves a built-in dependency from the app configured for abuddy test, before the app has run', async () => {
    const checkout = path.join(tmp, 'AgentBuddy');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(builtInPack(), path.join(checkout, 'packages', 'base-pack'));
    process.env.ABUDDY_ROOT = checkout;

    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    const artifacts = await resolveDepArtifacts(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.id).toBe('base-pack');
    expect(fs.existsSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'))).toBe(true);
  });

  function publishInstalled(version: string, steps = 'export const steps = [];') {
    const src = builtInPack({ types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version } } as any);
    fs.writeFileSync(path.join(src, 'dist', 'build', 'steps.build.mjs'), steps);
    publishHostPackArtifacts(src, path.join(tmp, 'userdata', 'host-packs', 'base-pack'));
  }

  function authorPack(): string {
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    return packRoot;
  }

  it('refreshes the cached dependency when the app provides a new version', async () => {
    const packRoot = authorPack();
    publishInstalled('1.0.0', 'export const steps = ["v1"];');
    expect((await resolveDepArtifacts(packRoot, 'base-pack', '*'))?.snapshot.manifest.version).toBe('1.0.0');

    publishInstalled('2.0.0', 'export const steps = ["v2"];');
    const artifacts = await resolveDepArtifacts(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.version).toBe('2.0.0');
    expect(fs.readFileSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'), 'utf-8')).toContain('v2');
  });

  it('only accepts a dependency version that satisfies the declared range, cached or not', async () => {
    const packRoot = authorPack();
    publishInstalled('1.0.0');
    expect(await resolveDepArtifacts(packRoot, 'base-pack', '*')).not.toBeNull(); // now cached

    expect(await resolveDepArtifacts(packRoot, 'base-pack', '>=2.0.0')).toBeNull();
    expect((await resolveDepArtifacts(packRoot, 'base-pack', '^1.0.0'))?.snapshot.manifest.version).toBe('1.0.0');
  });

  it('prefers the app configured for abuddy test over an installed app', async () => {
    publishInstalled('1.0.0');
    const checkout = path.join(tmp, 'AgentBuddy');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(
      builtInPack({ types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version: '3.0.0' } } as any),
      path.join(checkout, 'packages', 'base-pack'),
    );
    process.env.ABUDDY_ROOT = checkout;

    expect((await resolveDepArtifacts(authorPack(), 'base-pack', '*'))?.snapshot.manifest.version).toBe('3.0.0');
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
      expect(await resolveDepArtifacts(authorPack(), 'dep-pack', 'github:acme/dep-pack')).toBeNull();
      expect(requested).toEqual([expect.stringContaining('/repos/acme/dep-pack/releases')]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null when nothing provides the dependency', async () => {
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    expect(await resolveDepArtifacts(packRoot, 'missing-pack', '*')).toBeNull();
  });
});
