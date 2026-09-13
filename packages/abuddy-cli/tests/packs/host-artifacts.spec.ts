import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('returns null when nothing provides the dependency', async () => {
    const packRoot = path.join(tmp, 'author-pack');
    fs.mkdirSync(packRoot, { recursive: true });
    expect(await resolveDepArtifacts(packRoot, 'missing-pack', '*')).toBeNull();
  });
});
