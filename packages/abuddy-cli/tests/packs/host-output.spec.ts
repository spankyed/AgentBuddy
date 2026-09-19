import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishHostPackOutput } from '@abuddy/host/packs';
import { resolveDepFiles } from '../../src/commands/fetch-deps';

let tmp: string;
const saved = { env: process.env.ABUDDY_ENV, dir: process.env.ABUDDY_USER_DATA_DIR, root: process.env.ABUDDY_ROOT };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-output-'));
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
  fs.mkdirSync(path.join(dir, 'dist', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'runtime', 'index.cjs'), 'exports.registration = { id: "base-pack" };');
  // Compiled seeds at the top of a built-in pack's dist, beside files that aren't seeds
  fs.writeFileSync(path.join(dir, 'dist', 'settings.seed.json'), '{"theme":"dark"}');
  fs.writeFileSync(path.join(dir, 'dist', 'seeds.json'), '{"version":1,"seeds":[]}');
  builtBeside(dir);
  fs.mkdirSync(path.join(dir, 'dist', 'media', 'library'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'media', 'library', 'pic.png'), 'PNG');
  fs.mkdirSync(path.join(dir, 'dist', 'defs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'defs', 'actions.d.ts'), '');
  return dir;
}

/** Records the compiled seeds index the runtime was built beside, as the pack's runtime build does */
function builtBeside(dir: string) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'dist', 'seeds.json'))).digest('hex');
  fs.writeFileSync(path.join(dir, 'dist', 'runtime', 'seeds-index.sha256'), hash);
}

describe('publishHostPackOutput', () => {
  it('publishes types/, build/ and runtime/index.cjs once and republishes only when they change', () => {
    const src = builtInPack();
    const dest = path.join(tmp, 'host-packs', 'base-pack');

    expect(publishHostPackOutput(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'types', 'snapshot.json'), 'utf-8')).toContain('base-pack');
    expect(fs.existsSync(path.join(dest, 'build', 'steps.build.mjs'))).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'runtime', 'index.cjs'), 'utf-8')).toContain('registration');
    // The compiled seeds its runtime reads (settings defaults), and nothing else from dist
    expect(fs.readdirSync(path.join(dest, 'runtime', 'seeds')).sort()).toEqual(['media', 'seeds.json', 'settings.seed.json']);
    expect(fs.existsSync(path.join(dest, 'runtime', 'seeds', 'media', 'library', 'pic.png'))).toBe(true);
    expect(publishHostPackOutput(src, dest)).toBe(false);

    fs.writeFileSync(path.join(src, 'dist', 'settings.seed.json'), '{"theme":"light"}');
    expect(publishHostPackOutput(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'runtime', 'seeds', 'settings.seed.json'), 'utf-8')).toContain('light');

    fs.writeFileSync(path.join(src, 'dist', 'build', 'steps.build.mjs'), 'export const steps = [1];');
    expect(publishHostPackOutput(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'build', 'steps.build.mjs'), 'utf-8')).toContain('[1]');

    fs.writeFileSync(path.join(src, 'dist', 'runtime', 'index.cjs'), 'exports.registration = { id: "base-pack", v: 2 };');
    expect(publishHostPackOutput(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'runtime', 'index.cjs'), 'utf-8')).toContain('v: 2');
  });

  it("refuses to publish a runtime with seeds compiled after it, and publishes once the runtime is rebuilt beside them", () => {
    const src = builtInPack();
    const dest = path.join(tmp, 'host-packs', 'base-pack');
    publishHostPackOutput(src, dest);

    // abuddy build compiled the seeds again; the runtime wasn't rebuilt
    fs.writeFileSync(path.join(src, 'dist', 'seeds.json'), '{"version":1,"seeds":[{"key":"notes"}]}');
    expect(() => publishHostPackOutput(src, dest)).toThrow(/runtime\/index\.cjs wasn't built beside the compiled seeds .*rebuild the pack's runtime/);
    expect(fs.readFileSync(path.join(dest, 'runtime', 'seeds', 'seeds.json'), 'utf-8')).not.toContain('notes');

    // A runtime never recorded as built beside any seeds isn't published with them either
    fs.rmSync(path.join(src, 'dist', 'runtime', 'seeds-index.sha256'));
    expect(() => publishHostPackOutput(src, dest)).toThrow(/wasn't built beside the compiled seeds/);

    builtBeside(src);
    expect(publishHostPackOutput(src, dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'runtime', 'seeds', 'seeds.json'), 'utf-8')).toContain('notes');
  });
});

describe('dependency resolution from an installed app', () => {
  it('resolves a built-in dependency (snapshot, step build code, runtime) the app published, and caches it in the pack', async () => {
    const hostPacks = path.join(tmp, 'userdata', 'host-packs');
    publishHostPackOutput(builtInPack(), path.join(hostPacks, 'base-pack'));

    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.id).toBe('base-pack');
    expect(artifacts?.buildDir).toBe(path.join(packRoot, '.abuddy', 'deps', 'base-pack', 'build'));
    expect(fs.existsSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'))).toBe(true);
    expect(artifacts?.runtimeEntry).toBe(path.join(packRoot, '.abuddy', 'deps', 'base-pack', 'runtime', 'index.cjs'));
    expect(fs.readFileSync(artifacts!.runtimeEntry!, 'utf-8')).toContain('registration');
    expect(artifacts?.seedsDir).toBe(path.join(packRoot, '.abuddy', 'deps', 'base-pack', 'runtime', 'seeds'));
    expect(fs.readdirSync(artifacts!.seedsDir!).sort()).toEqual(['media', 'seeds.json', 'settings.seed.json']);
  });

  // The label reaches the facade check, which uses it to pick a remedy the reader can carry out: a
  // pack taken out of an installed app has no source tree to rebuild.
  it('reports where the dependency resolved from, and reports nothing for a later cache hit', async () => {
    const hostPacks = path.join(tmp, 'userdata', 'host-packs');
    publishHostPackOutput(builtInPack(), path.join(hostPacks, 'base-pack'));
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    expect((await resolveDepFiles(packRoot, 'base-pack', '*'))?.resolvedFrom).toMatch(/^installed app \(/);

    // Once the app's copy is gone the cache stands in, and it records no provenance
    fs.rmSync(path.join(hostPacks, 'base-pack'), { recursive: true });
    const cached = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(cached?.snapshot.manifest.id).toBe('base-pack');
    expect(cached?.resolvedFrom).toBeUndefined();
  });

  it("drops a cached runtime when the dependency stops shipping one", async () => {
    const hostPacks = path.join(tmp, 'userdata', 'host-packs');
    const src = builtInPack();
    publishHostPackOutput(src, path.join(hostPacks, 'base-pack'));
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    expect((await resolveDepFiles(packRoot, 'base-pack', '*'))?.runtimeEntry).toBeDefined();

    fs.rmSync(path.join(src, 'dist', 'runtime'), { recursive: true });
    fs.rmSync(path.join(hostPacks, 'base-pack'), { recursive: true });
    publishHostPackOutput(src, path.join(hostPacks, 'base-pack'));
    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.runtimeEntry).toBeUndefined();
    expect(fs.existsSync(path.join(packRoot, '.abuddy', 'deps', 'base-pack', 'runtime'))).toBe(false);
  });

  it('resolves a built-in dependency from the app configured for abuddy test, before the app has run', async () => {
    const checkout = path.join(tmp, 'AgentBuddy');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(builtInPack(), path.join(checkout, 'packages', 'base-pack'));
    process.env.ABUDDY_ROOT = checkout;

    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });

    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.id).toBe('base-pack');
    expect(fs.existsSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'))).toBe(true);
    // A checkout's built-in pack: dist/runtime/index.cjs, as default-setup's build writes it
    expect(fs.readFileSync(artifacts!.runtimeEntry!, 'utf-8')).toContain('registration');
  });

  function publishInstalled(version: string, steps = 'export const steps = [];') {
    const src = builtInPack({ types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version } } as any);
    fs.writeFileSync(path.join(src, 'dist', 'build', 'steps.build.mjs'), steps);
    publishHostPackOutput(src, path.join(tmp, 'userdata', 'host-packs', 'base-pack'));
  }

  function authorPack(): string {
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    return packRoot;
  }

  it('refreshes the cached dependency when the app provides a new version', async () => {
    const packRoot = authorPack();
    publishInstalled('1.0.0', 'export const steps = ["v1"];');
    expect((await resolveDepFiles(packRoot, 'base-pack', '*'))?.snapshot.manifest.version).toBe('1.0.0');

    publishInstalled('2.0.0', 'export const steps = ["v2"];');
    const artifacts = await resolveDepFiles(packRoot, 'base-pack', '*');
    expect(artifacts?.snapshot.manifest.version).toBe('2.0.0');
    expect(fs.readFileSync(path.join(artifacts!.buildDir!, 'steps.build.mjs'), 'utf-8')).toContain('v2');
  });

  it('only accepts a dependency version that satisfies the declared range, cached or not', async () => {
    const packRoot = authorPack();
    publishInstalled('1.0.0');
    expect(await resolveDepFiles(packRoot, 'base-pack', '*')).not.toBeNull(); // now cached

    expect(await resolveDepFiles(packRoot, 'base-pack', '>=2.0.0')).toBeNull();
    expect((await resolveDepFiles(packRoot, 'base-pack', '^1.0.0'))?.snapshot.manifest.version).toBe('1.0.0');
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

    expect((await resolveDepFiles(authorPack(), 'base-pack', '*'))?.snapshot.manifest.version).toBe('3.0.0');
  });

  it("resolves a dependency from the checkout a pack sits in at any depth, before an installed app's copy", async () => {
    publishInstalled('1.0.0');
    const checkout = path.join(tmp, 'AgentBuddy');
    fs.mkdirSync(path.join(checkout, 'packages'), { recursive: true });
    fs.renameSync(
      builtInPack({ types: { entities: {}, relKinds: {} }, defs: {}, manifest: { id: 'base-pack', version: '4.0.0' } } as any),
      path.join(checkout, 'packages', 'base-pack'),
    );
    // Three levels down, like tests/fixtures/external-pack
    const fixture = path.join(checkout, 'tests', 'fixtures', 'author-pack');
    fs.mkdirSync(fixture, { recursive: true });

    expect((await resolveDepFiles(fixture, 'base-pack', '*'))?.snapshot.manifest.version).toBe('4.0.0');
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
