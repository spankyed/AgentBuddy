import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packFixture } from '../src/index.ts';
import { population } from '@abuddy/sdk/testing';

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

  /**
   * The two manifest options, and the reason they are two.
   *
   * 23 of the 28 manifests written inline across the packages that may import this are the minimum plus at
   * most one key, so varying is the common case and `manifest` merges. The other five are *about* the
   * manifest — one the installer rejects, one missing a key — and a merge cannot express a key that is
   * absent, so `rawManifest` writes what it is given. Asking for both is a question with two answers.
   */
  it('varies the default manifest, keeping what the case is not about', () => {
    const written = read(packFixture({ manifest: { id: 'other' } }), 'abuddy.json');
    expect(written.id).toBe('other');
    expect(written.features, 'the feature the default declares is what makes a contract rule able to fire')
      .toHaveLength(1);
  });

  it('writes a manifest verbatim when the manifest is the subject', () => {
    expect(read(packFixture({ rawManifest: { id: 'only-this' } }), 'abuddy.json')).toEqual({ id: 'only-this' });
  });

  /** What makes `@abuddy/*` resolve from inside the fixture, which every spec that builds one needs */
  it('links node_modules where it is asked to, and nowhere else', () => {
    const modules = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-fixture-modules-'));
    expect(fs.realpathSync(path.join(packFixture({ nodeModules: modules }), 'node_modules')))
      .toBe(fs.realpathSync(modules));
    expect(fs.existsSync(path.join(packFixture(), 'node_modules'))).toBe(false);
  });

  it('refuses both at once rather than picking one', () => {
    expect(() => packFixture({ manifest: { id: 'a' }, rawManifest: { id: 'b' } }))
      .toThrow(/not both/);
  });
});
