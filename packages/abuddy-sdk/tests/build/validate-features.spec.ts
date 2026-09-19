// `abuddy validate` checks each abuddy.json features[] entry against the pack on disk
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-validate-features-'));
  dirs.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'export default {};\n');
  }
  return root;
}

const notes = {
  id: 'notes',
  settings: 'src/features/notes/settings.ts',
  system: { entry: 'src/features/notes/be/system.ts' },
  plugin: { entry: 'src/features/notes/fe/plugin.ts' },
};
const notesFiles = [notes.settings, notes.system.entry, notes.plugin.entry];

describe('validateFeatures', () => {
  it('accepts features whose files exist and whose designation is the feature id', () => {
    const root = pack(notesFiles);
    expect(validateFeatures(root, { features: [{ ...notes, designation: 'notes' }] })).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['settings', notes.settings],
    ['system.entry', notes.system.entry],
    ['plugin.entry', notes.plugin.entry],
  ])('reports a missing %s file', (field, missing) => {
    const root = pack(notesFiles.filter(file => file !== missing));
    expect(validateFeatures(root, { features: [notes] }).errors).toEqual([`Feature "notes": ${field} file "${missing}" not found`]);
  });

  it('accepts a designation that differs from the feature id: a designation is a role, not a name', () => {
    const root = pack(notesFiles);
    expect(validateFeatures(root, { features: [{ ...notes, designation: 'memos' }] }).errors).toEqual([]);
  });

  it('reports one role claimed by two features of the same pack', () => {
    const root = pack(notesFiles);
    const other = { ...notes, id: 'scraps' };
    const errors = validateFeatures(root, {
      features: [{ ...notes, designation: 'memos' }, { ...other, designation: 'memos' }],
    }).errors;
    expect(errors).toEqual(['Feature "scraps": designation "memos" is already claimed by feature "notes"']);
  });

  it('accepts two features with different designations', () => {
    const root = pack(notesFiles);
    expect(validateFeatures(root, {
      features: [{ ...notes, designation: 'memos' }, { ...notes, id: 'scraps', designation: 'scraps' }],
    }).errors).toEqual([]);
  });
});
