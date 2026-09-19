import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverBuiltInPacks, enabledExternalPacks, reconcileInstalledPacks } from '../../src/packs/pack-discovery.ts';
import { readInstalledPacks, writeInstalledPacks } from '../../src/packs/installed-packs.ts';

/** The recorded packs; these specs always write a record first, so a missing one is a failure */
function recordedPacks() {
  const record = readInstalledPacks();
  if (!record.found) throw new Error('no installed-packs record');
  return record.packs;
}

import type { PackManifest } from '@abuddy/sdk/build';

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

    expect(enabledExternalPacks(packagesDir, new Set()).map(p => p.manifest.id).sort())
      .toEqual(['memo-pack', 'scribble-pack']);
  });

  it('leaves out the ones named disabled, and nothing else', () => {
    external('memo-pack');
    external('scribble-pack');

    expect(enabledExternalPacks(packagesDir, new Set(['memo-pack'])).map(p => p.manifest.id))
      .toEqual(['scribble-pack']);
    // An id for a pack that isn't there takes nothing away
    expect(enabledExternalPacks(packagesDir, new Set(['gone-pack'])).map(p => p.manifest.id).sort())
      .toEqual(['memo-pack', 'scribble-pack']);
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

describe('reconcileInstalledPacks with no record', () => {
  let userDataDir: string;
  const env = { ABUDDY_ENV: process.env.ABUDDY_ENV, ABUDDY_USER_DATA_DIR: process.env.ABUDDY_USER_DATA_DIR };
  const found = (id: string) => ({ manifest: { id, name: id, version: '1.0.0' } as PackManifest, dir: `/packs/${id}` });

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-'));
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

  // Without a record every pack in packs/ comes back enabled, a pack the user disabled included. That
  // follows from having nothing to read, but reporting it per pack as "New external pack discovered" would
  // describe a fresh install of each. One warning says what happened, and names the packs it re-enabled.
  it('rebuilds the record with every pack enabled, and says so once', () => {
    // Every channel, not just warn: the per-pack line this replaces is logged at info level
    const lines: string[] = [];
    const real = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const capture = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    Object.assign(console, { log: capture, info: capture, warn: capture, error: capture });
    try {
      expect(reconcileInstalledPacks([found('memo-pack'), found('scribble-pack')]).map(d => d.manifest.id))
        .toEqual(['memo-pack', 'scribble-pack']);
    } finally {
      Object.assign(console, real);
    }

    expect(recordedPacks().map(e => [e.id, e.enabled])).toEqual([['memo-pack', true], ['scribble-pack', true]]);
    const rebuilt = lines.filter(w => w.includes('No record of installed packs'));
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0]).toContain('memo-pack, scribble-pack');
    expect(rebuilt[0]).toContain('A pack disabled before this is enabled again.');
    expect(lines.filter(w => w.includes('New external pack discovered'))).toEqual([]);
  });

  it('keeps a disabled pack disabled once the record exists, and reports a genuinely new one', () => {
    writeInstalledPacks([
      { id: 'memo-pack', name: 'memo-pack', version: '1.0.0', dir: '/packs/memo-pack', enabled: false, installedAt: '' },
    ]);

    expect(reconcileInstalledPacks([found('memo-pack'), found('scribble-pack')]).map(d => d.manifest.id))
      .toEqual(['scribble-pack']);
    expect(recordedPacks().find(e => e.id === 'memo-pack')?.enabled).toBe(false);
  });
});
