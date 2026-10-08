// The packs the app ships are installed packs: the boot installs them into the data dir, so there is one
// kind of pack on disk and one load path to it. What this pins is when the boot writes and when it does not
// — a copy it has already installed must not be re-installed on every start, and one that differs must be.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installShippedPacks } from '../../src/packs/installer.ts';
import { PACK_LAYOUT, readPackIntegrity } from '../../src/packs/layout.ts';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';

let tmp: string;
let shipped: string;
let packsDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shipped-packs-'));
  shipped = path.join(tmp, 'resources', 'packages');
  packsDir = path.join(tmp, 'data', 'packs');
  fs.mkdirSync(shipped, { recursive: true });
  fs.mkdirSync(packsDir, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A pack as the app ships one: its manifest and its `dist/`, unstaged — which is what `files` carries */
function shipPack(id: string, runtime = `exports.registration = { id: ${JSON.stringify(id)} };`): string {
  const dir = path.join(shipped, id);
  fs.mkdirSync(path.join(dir, 'dist', PACK_LAYOUT.runtimeDir), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist', PACK_LAYOUT.typesDir), { recursive: true });
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify({ id, name: id, version: '1.0.0' }));
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.runtimeEntry), runtime);
  return dir;
}

const outcomes = async () => (await installShippedPacks(shipped, packsDir)).map((r) => `${r.id}=${r.outcome}`);

describe('installing the packs the app ships', () => {
  it('installs into the packs dir, in the pack layout, on a first boot', async () => {
    shipPack('shipped-pack');

    expect(await outcomes()).toEqual(['shipped-pack=installed']);

    // A real installed pack, not a copy of the shipped directory: staged, with the integrity that verifies it
    const installed = path.join(packsDir, 'shipped-pack');
    expect(fs.readdirSync(installed).sort()).toEqual([PACK_LAYOUT.manifest, PACK_LAYOUT.integrity, PACK_LAYOUT.runtimeDir, PACK_LAYOUT.typesDir].sort());
    expect(readPackIntegrity(installed).id).toBe('shipped-pack');
  });

  // The reason the comparison is over content: a boot that re-installed every time would rewrite the pack's
  // directory on every start, and `placePack` renames a fresh copy in, so every file's mtime would move
  it('writes nothing on a second boot', async () => {
    shipPack('shipped-pack');
    await installShippedPacks(shipped, packsDir);
    const before = fs.statSync(path.join(packsDir, 'shipped-pack', PACK_LAYOUT.integrity)).mtimeMs;

    expect(await outcomes()).toEqual(['shipped-pack=current']);
    expect(fs.statSync(path.join(packsDir, 'shipped-pack', PACK_LAYOUT.integrity)).mtimeMs).toBe(before);
  });

  // A version bump is the ordinary cause. A user who edited an installed file is the other, and it could not
  // happen while a shipped pack was loaded from `resources/` in place
  it('re-installs when the shipped copy differs from the installed one', async () => {
    const dir = shipPack('shipped-pack');
    await installShippedPacks(shipped, packsDir);

    fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.runtimeEntry), 'exports.registration = { id: "shipped-pack", v: 2 };');
    expect(await outcomes()).toEqual(['shipped-pack=updated']);
    expect(fs.readFileSync(path.join(packsDir, 'shipped-pack', PACK_LAYOUT.runtimeEntry), 'utf-8')).toContain('v: 2');
  });

  it('re-installs when the installed copy was edited, which the shipped one no longer matches', async () => {
    shipPack('shipped-pack');
    await installShippedPacks(shipped, packsDir);
    fs.writeFileSync(path.join(packsDir, 'shipped-pack', PACK_LAYOUT.runtimeEntry), '// a user got in here');

    expect(await outcomes()).toEqual(['shipped-pack=updated']);
    expect(fs.readFileSync(path.join(packsDir, 'shipped-pack', PACK_LAYOUT.runtimeEntry), 'utf-8')).toContain('registration');
  });

  // Reported rather than thrown, and **not** loaded from `resources/` instead: a read-only second load path
  // is what this change removed, so a pack the app could not install is a pack that is not there
  it('reports a shipped directory that is not a built pack, naming what it lacks', async () => {
    const dir = path.join(shipped, 'unbuilt-pack');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify({ id: 'unbuilt-pack', name: 'Unbuilt', version: '1.0.0' }));

    const [result] = await installShippedPacks(shipped, packsDir);
    expect(result).toMatchObject({ id: 'unbuilt-pack', outcome: 'failed' });
    expect(result!.error).toContain(PACK_LAYOUT.integrity);
    expect(fs.existsSync(path.join(packsDir, 'unbuilt-pack'))).toBe(false);
  });

  it('installs the other packs when one of them fails', async () => {
    shipPack('good-pack');
    fs.mkdirSync(path.join(shipped, 'bad-pack'), { recursive: true });
    fs.writeFileSync(path.join(shipped, 'bad-pack', PACK_LAYOUT.manifest), JSON.stringify({ id: 'bad-pack', name: 'Bad', version: '1.0.0' }));

    expect((await outcomes()).sort()).toEqual(['bad-pack=failed', 'good-pack=installed']);
  });

  it('is nothing to do when the app ships no packs directory', async () => {
    expect(await installShippedPacks(path.join(tmp, 'nowhere'), packsDir)).toEqual([]);
  });

  it('skips a directory that is not a pack, and the staging dirs an interrupted install leaves', async () => {
    shipPack('shipped-pack');
    fs.mkdirSync(path.join(shipped, 'not-a-pack'), { recursive: true });
    fs.mkdirSync(path.join(shipped, '.shipped-pack.installing-123'), { recursive: true });

    expect(await outcomes()).toEqual(['shipped-pack=installed']);
  });
});
