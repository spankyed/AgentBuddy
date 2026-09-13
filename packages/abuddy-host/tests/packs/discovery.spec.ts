import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverBuiltInPacks } from '../../src/packs/pack-discovery.ts';

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
