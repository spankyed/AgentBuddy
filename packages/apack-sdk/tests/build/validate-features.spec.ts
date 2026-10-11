// `apack validate` checks each apack.json `features` entry against the pack on disk
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateFeatures } from '../../src/build/validate.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-validate-features-'));
  dirs.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'export default {};\n');
  }
  return root;
}

const memos = {
  settings: 'src/features/memos/settings.ts',
  system: { entry: 'src/features/memos/be/system.ts' },
  plugin: { entry: 'src/features/memos/fe/plugin.ts' },
};
const memosFiles = [memos.settings, memos.system.entry, memos.plugin.entry];

describe('validateFeatures', () => {
  it('accepts features whose files exist and whose designation is the feature id', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, { features: { memos: { ...memos, designation: 'memos' } } })).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['settings', memos.settings],
    ['system.entry', memos.system.entry],
    ['plugin.entry', memos.plugin.entry],
  ])('reports a missing %s file', (field, missing) => {
    const root = pack(memosFiles.filter(file => file !== missing));
    expect(validateFeatures(root, { features: { memos } }).errors).toEqual([`Feature "memos": ${field} file "${missing}" not found`]);
  });

  // `inbox`, not `memos`: a designation equal to the feature's id is what this case is *not* about, and a
  // rename made it exactly that for a while, leaving the name to claim what the fixture no longer showed
  it('accepts a designation that differs from the feature id: a designation is a role, not a name', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, { features: { memos: { ...memos, designation: 'inbox' } } }).errors).toEqual([]);
  });

  it('reports one role claimed by two features of the same pack', () => {
    const root = pack(memosFiles);
    const errors = validateFeatures(root, {
      features: { memos: { ...memos, designation: 'inbox' }, scraps: { ...memos, designation: 'inbox' } },
    }).errors;
    expect(errors).toEqual(['Feature "scraps": designation "inbox" is already claimed by feature "memos"']);
  });

  it('accepts two features with different designations', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, {
      features: { memos: { ...memos, designation: 'memos' }, scraps: { ...memos, designation: 'scraps' } },
    }).errors).toEqual([]);
  });
});

// A feature's types module reaches the rest of the pack through `#generated/types`. A path that isn't there
// contributes nothing and says nothing, so validate is where a typo in it surfaces.
describe('typesEntry', () => {
  it('accepts one whose module exists, written with or without its extension', () => {
    const root = pack([...memosFiles, 'src/features/memos/be/types.ts']);
    for (const typesEntry of ['src/features/memos/be/types', 'src/features/memos/be/types.ts']) {
      expect(validateFeatures(root, { features: { memos: { ...memos, typesEntry } } })).toEqual({ errors: [], warnings: [] });
    }
  });

  it('reports one whose module is not there', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, { features: { memos: { ...memos, typesEntry: 'src/features/memos/be/typos' } } }).errors)
      .toEqual(['Feature "memos": typesEntry file "src/features/memos/be/typos.ts" not found']);
  });

  it('says nothing about a feature that declares none', () => {
    const root = pack(memosFiles);
    expect(validateFeatures(root, { features: { memos } })).toEqual({ errors: [], warnings: [] });
  });
});
