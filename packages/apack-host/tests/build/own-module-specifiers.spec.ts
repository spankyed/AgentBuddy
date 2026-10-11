import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { namedFileFor, ownModuleProblems } from '../../src/build/own-module-specifiers.ts';

let packDir: string;

beforeEach(() => { packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-module-specifiers-')); });
afterEach(() => { fs.rmSync(packDir, { recursive: true, force: true }); });

const write = (rel: string, contents = 'export const x = 1') => {
  const full = path.join(packDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
};
const pack = (imports: unknown = { '#generated/*': './src/__generated__/*' }) =>
  write('package.json', JSON.stringify({ name: 'p', type: 'module', imports }));

/** One specifier, as a caller's reader would hand it over: from `src/f.ts`, line 1 */
const problems = (specifier: string, file = 'src/f.ts', line = 1) =>
  ownModuleProblems(packDir, [{ file, line, specifier }]);

/**
 * A pack names its own modules two ways, and the rule is the same rule, so every case runs twice.
 *
 * It used to run once: the `#` half had thirteen cases and the relative half none, and deleting the relative
 * branch outright left every spec in the repo green — for the half that 716 of this goal's specifiers were.
 * A third form later is either in this table or visibly missing from it.
 */
const FORMS = [
  { form: 'a # subpath import', target: 'src/__generated__', named: (name: string) => `#generated/${name}` },
  { form: 'a relative path', target: 'src/__generated__', named: (name: string) => `./__generated__/${name}` },
] as const;

describe.each(FORMS)('ownModuleProblems, over $form', ({ named }) => {
  it('names the file an extensionless specifier should have named', () => {
    pack();
    write('src/__generated__/events.ts');
    expect(problems(named('events'))).toEqual([
      `src/f.ts:1: '${named('events')}' names no file — write '${named('events.ts')}'`,
    ]);
  });

  it('names the source behind an emitted extension, which a pack never produces', () => {
    pack();
    write('src/__generated__/events.ts');
    expect(problems(named('events.js'))).toEqual([
      `src/f.ts:1: '${named('events.js')}' names no file — write '${named('events.ts')}'`,
    ]);
  });

  it('says nothing about a specifier that names its file', () => {
    pack();
    write('src/__generated__/events.ts');
    expect(problems(named('events.ts'))).toEqual([]);
  });

  it('names a directory by its index file', () => {
    pack();
    write('src/__generated__/repository/index.ts');
    expect(problems(named('repository'))).toEqual([
      `src/f.ts:1: '${named('repository')}' names no file — write '${named('repository/index.ts')}'`,
    ]);
  });

  /**
   * Vite's default extensions leave `.vue` out, so an extensionless SFC import resolved nowhere — the one
   * form that was broken before this rule as well as after it, and the one most worth naming.
   */
  it('names an SFC target', () => {
    pack();
    write('src/__generated__/view.vue', '<template><div /></template>');
    expect(problems(named('view'))).toEqual([
      `src/f.ts:1: '${named('view')}' names no file — write '${named('view.vue')}'`,
    ]);
  });

  // One list for the file and the index attempt: the two in the resolver this replaced had drifted, the
  // first having .mts and .mjs and neither of their CJS counterparts, the second only ever trying index.ts
  it.each(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'])('names a %s file, and an index of one', (ext) => {
    pack();
    write(`src/__generated__/a${ext}`);
    write(`src/__generated__/d/index${ext}`);
    expect([...problems(named('a')), ...problems(named('d'), 'src/f.ts', 2)]).toEqual([
      `src/f.ts:1: '${named('a')}' names no file — write '${named(`a${ext}`)}'`,
      `src/f.ts:2: '${named('d')}' names no file — write '${named(`d/index${ext}`)}'`,
    ]);
  });

  it('leaves alone a .js specifier that does name a .js file', () => {
    pack();
    write('src/__generated__/flow-helpers.js');
    expect(problems(named('flow-helpers.js'))).toEqual([]);
  });

  it('leaves alone a name pointing at no file, which the bundler reports with more context', () => {
    pack();
    expect(problems(named('nothing-here'))).toEqual([]);
  });

  it('resolves a relative specifier against the file that wrote it, not the pack root', () => {
    pack();
    write('src/features/a/be/contract.ts');
    write('src/features/a/be/types.ts');
    expect(ownModuleProblems(packDir, [{ file: 'src/features/a/be/system.ts', line: 3, specifier: './contract' }]))
      .toEqual(["src/features/a/be/system.ts:3: './contract' names no file — write './contract.ts'"]);
  });
});

describe('ownModuleProblems', () => {
  it('reports the file and line its caller found, one problem per specifier', () => {
    pack();
    write('src/__generated__/ears.ts');
    write('src/features/a/fe/panel.vue', '<template><div /></template>');
    expect(ownModuleProblems(packDir, [
      { file: 'src/f.ts', line: 3, specifier: '#generated/ears' },
      { file: 'src/features/a/fe/view.vue', line: 12, specifier: './panel' },
    ])).toEqual([
      "src/f.ts:3: '#generated/ears' names no file — write '#generated/ears.ts'",
      "src/features/a/fe/view.vue:12: './panel' names no file — write './panel.vue'",
    ]);
  });

  /** What counts as one of the pack's own modules is the rule's to know, so a reader hands over everything */
  it.each(['@apack/sdk', 'vue', 'node:fs', '#3B82F6', '#generated/nothing-here'])('is silent about %s', (specifier) => {
    pack();
    expect(problems(specifier)).toEqual([]);
  });

  it('checks a relative specifier in a pack that declares no subpath imports at all', () => {
    write('package.json', JSON.stringify({ name: 'p', type: 'module' }));
    write('src/sibling.ts');
    expect(problems('#generated/events')).toEqual([]);
    expect(problems('./sibling')).toEqual(["src/f.ts:1: './sibling' names no file — write './sibling.ts'"]);
  });

  it('leaves alone a specifier an exact pattern maps, whose target carries the extension', () => {
    pack({ '#app': './src/app.ts', '#generated/*': './src/__generated__/*' });
    write('src/app.ts');
    expect(problems('#app')).toEqual([]);
  });
});

/**
 * Node takes the *longest* matching pattern, not the first the manifest declares. Reading them in key order
 * named `src/a/deep/thing.js` for a pack whose `#gen/deep/*` maps to `src/b`, advice that would not have
 * resolved either.
 */
describe('namedFileFor', () => {
  it('follows the longest matching pattern, whatever order they are declared in', () => {
    const imports = { '#gen/*': './src/a/*', '#gen/deep/*': './src/b/*' };
    write('src/a/deep/thing.js');
    write('src/b/thing.ts');
    expect(namedFileFor(packDir, imports, '#gen/deep/thing')).toBe('#gen/deep/thing.ts');
    expect(namedFileFor(packDir, imports, '#gen/other')).toBe(undefined);
    write('src/a/other.tsx');
    expect(namedFileFor(packDir, imports, '#gen/other')).toBe('#gen/other.tsx');
  });
});
