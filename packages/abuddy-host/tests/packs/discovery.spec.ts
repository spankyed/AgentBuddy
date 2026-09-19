import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverBuiltInPacks, discoverPacks, enabledExternalPacks, installedPacks } from '../../src/packs/pack-discovery.ts';
import { writeInstalledPacks } from '../../src/packs/installed-packs.ts';

let packagesDir: string;

beforeEach(() => {
  packagesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-discovery-'));
});

afterEach(() => {
  fs.rmSync(packagesDir, { recursive: true, force: true });
});

function writeManifest(name: string, manifest: Record<string, unknown>): string {
  const dir = path.join(packagesDir, name);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify(manifest));
  return dir;
}

describe('enabledExternalPacks', () => {
  const external = (id: string) => writeManifest(id, { id, name: id, version: '1.0.0' });

  // The directory is the list: an `abuddy install` outside the app, or an `abuddy dev` into a running
  // one, leaves a pack the record has never heard of, and it is installed and enabled all the same
  it('takes every pack in the directory, including ones the record has never heard of', () => {
    external('memo-pack');
    external('scribble-pack');

    expect(enabledExternalPacks(discoverPacks(packagesDir), new Set()).map(p => p.manifest.id).sort())
      .toEqual(['memo-pack', 'scribble-pack']);
  });

  it('leaves out the ones named disabled, and nothing else', () => {
    external('memo-pack');
    external('scribble-pack');

    expect(enabledExternalPacks(discoverPacks(packagesDir), new Set(['memo-pack'])).map(p => p.manifest.id))
      .toEqual(['scribble-pack']);
    // An id for a pack that isn't there takes nothing away
    expect(enabledExternalPacks(discoverPacks(packagesDir), new Set(['gone-pack'])).map(p => p.manifest.id).sort())
      .toEqual(['memo-pack', 'scribble-pack']);
  });
});

describe('installedPacks', () => {
  let userDataDir: string;
  const env = { ABUDDY_ENV: process.env.ABUDDY_ENV, ABUDDY_USER_DATA_DIR: process.env.ABUDDY_USER_DATA_DIR };

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-packs-'));
    process.env.ABUDDY_ENV = 'test';
    process.env.ABUDDY_USER_DATA_DIR = userDataDir;
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  function onDisk(id: string, version: string) {
    const dir = path.join(userDataDir, 'packs', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({ id, name: id, version }));
  }

  it('reports a pack nothing has recorded anything about, enabled', () => {
    onDisk('memo-pack', '1.0.0');

    expect(installedPacks()).toMatchObject([
      { manifest: { id: 'memo-pack', version: '1.0.0' }, record: { id: 'memo-pack', enabled: true } },
    ]);
  });

  // The version lives in the pack's manifest and nowhere else, so an `abuddy install` outside the app —
  // which writes the directory and never the record — cannot cost the pack the slug its updates come
  // from. A record that copied the version had to be rewritten when it changed, and that rewrite is what
  // used to take `installedFrom` with it.
  it('keeps what only the record can say when the pack on disk changes version', () => {
    onDisk('memo-pack', '1.0.0');
    writeInstalledPacks([{ id: 'memo-pack', enabled: true, installedFrom: 'acme/memo-pack', installedAt: '2020-01-01T00:00:00.000Z' }]);

    onDisk('memo-pack', '2.0.0');

    expect(installedPacks()).toMatchObject([{
      manifest: { version: '2.0.0' },
      record: { installedFrom: 'acme/memo-pack', installedAt: '2020-01-01T00:00:00.000Z' },
    }]);
  });
});

describe('discoverBuiltInPacks', () => {
  it('finds a built-in pack in the packaged app layout (abuddy.json + dist, no src)', () => {
    const dir = writeManifest('default-setup', { id: 'default-setup', name: 'Default Setup', version: '1.2.3', builtIn: true });

    expect(discoverBuiltInPacks(packagesDir)).toEqual([
      { id: 'default-setup', name: 'Default Setup', version: '1.2.3', dir },
    ]);
  });

  it('ignores packages that are not built-in packs', () => {
    writeManifest('external', { id: 'external', name: 'External' });
    fs.mkdirSync(path.join(packagesDir, 'api'));

    expect(discoverBuiltInPacks(packagesDir)).toEqual([]);
  });
});
