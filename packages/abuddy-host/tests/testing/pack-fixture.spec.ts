import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packFixture } from '../../src/testing/pack-fixture.ts';
import { population } from '../../src/testing/population.ts';

const read = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));

describe('packFixture', () => {
  /**
   * What "complete" has to mean, checked against the tree rather than against the literal that wrote it: a
   * manifest whose declared paths are all files. Trim any of them and a rule that reads contracts stops being
   * able to fire, which is the failure the shapes this replaces each had.
   */
  it('declares a feature whose every entry and contract is a file that is there', () => {
    const dir = packFixture();

    const declared = (read(dir, 'abuddy.json').features as Record<string, { entry: string; contract: string }>[])
      .flatMap((feature) => [feature.plugin, feature.system])
      .flatMap((half) => [half.entry, half.contract.split('#')[0]!]);

    population('the paths the fixture manifest declares', declared, { atLeast: 4 });
    expect(declared.filter((rel) => !fs.existsSync(path.join(dir, rel)))).toEqual([]);
  });

  it('has the subpath maps that make a # string a specifier rather than a colour', () => {
    expect(Object.keys(read(packFixture(), 'package.json').imports)).toEqual(['#generated/*', '#features/*']);
  });

  it('writes a case’s own files over the base, which is how a case adds its offending module', () => {
    const dir = packFixture({ files: { 'src/f.ts': 'export const offence = 1;\n' } });

    expect(fs.readFileSync(path.join(dir, 'src/f.ts'), 'utf-8')).toBe('export const offence = 1;\n');
    expect(fs.existsSync(path.join(dir, 'src/features/notes/be/contract.ts'))).toBe(true);
  });

  it('replaces the manifest outright for a case about a pack that declares something else', () => {
    expect(read(packFixture({ manifest: { id: 'other' } }), 'abuddy.json')).toEqual({ id: 'other' });
  });
});
