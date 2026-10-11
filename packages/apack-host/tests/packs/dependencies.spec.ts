// Which of a pack's declared dependencies are not there. Every pack is installed, the ones the app ships
// included, so the packs directory is the whole answer: one place can say "present", and a pack the app
// ships is present there on the same terms as any other.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDependencies } from '../../src/packs/installer.ts';

let userData: string;
let packsDir: string;

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-deps-'));
  packsDir = path.join(userData, 'packs');
  fs.mkdirSync(packsDir);
});

afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

const manifest = { dependencies: { 'default-setup': '*', 'other-pack': '^1.0.0' } };

/** A pack as being installed makes it: a directory under the packs dir with a manifest */
const install = (id: string) => {
  fs.mkdirSync(path.join(packsDir, id), { recursive: true });
  fs.writeFileSync(path.join(packsDir, id, 'apack.json'), '{}');
};

describe('checkDependencies', () => {
  it('treats an installed pack as present, the app\'s own among them', () => {
    install('default-setup');

    expect(checkDependencies(manifest, packsDir)).toEqual(['other-pack']);
  });

  it('reports every dependency when nothing provides them', () => {
    expect(checkDependencies(manifest, packsDir)).toEqual(['default-setup', 'other-pack']);
  });

  it('reports none when every dependency is installed', () => {
    install('default-setup');
    install('other-pack');

    expect(checkDependencies(manifest, packsDir)).toEqual([]);
  });

  // A directory is a pack because it holds a manifest, not because it has the name: `placePack` copies into
  // `.<id>.installing-*` before renaming, so a dir with no manifest in it is an install in flight
  it('does not count a directory with no manifest', () => {
    fs.mkdirSync(path.join(packsDir, 'default-setup'), { recursive: true });

    expect(checkDependencies(manifest, packsDir)).toEqual(['default-setup', 'other-pack']);
  });

  it('asks nothing of a pack that declares no dependencies', () => {
    expect(checkDependencies({}, packsDir)).toEqual([]);
  });
});
