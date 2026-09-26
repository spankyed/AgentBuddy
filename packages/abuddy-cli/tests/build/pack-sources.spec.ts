// The build's one reader of a pack's sources. Every case here is something a regex over the text got wrong
// before this was a syntax tree: the false positive that made a comment fail a build, and three forms that
// name a module and went unread.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { packSpecifiers, sourceFiles } from '../../src/build/pack-sources.ts';

let packDir: string;

beforeEach(() => { packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-sources-')); });
afterEach(() => { fs.rmSync(packDir, { recursive: true, force: true }); });

const write = (rel: string, contents: string) => {
  const full = path.join(packDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
};
const found = (rel: string, code: string) => {
  write(rel, code);
  return packSpecifiers(packDir, ['src']).map(({ file, line, specifier }) => `${file}:${line}: ${specifier}`);
};

describe('packSpecifiers', () => {
  it.each([
    ['a static import', "import { a } from './a.ts';"],
    ['a side-effect import', "import './a.ts';"],
    ['a re-export', "export * from './a.ts';"],
    ['a dynamic import', "const a = await import('./a.ts');"],
    ['an import type', "type A = typeof import('./a.ts');"],
    ['an import-equals', "import a = require('./a.ts');"],
    ['a require', "const a = require('./a.ts');"],
    ['a require.resolve', "const a = require.resolve('./a.ts');"],
    ['vi.mock', "vi.mock('./a.ts', () => ({}));"],
    ['vi.importActual', "await vi.importActual('./a.ts');"],
  ])('reads %s', (_form, code) => {
    expect(found('src/f.ts', code)).toEqual(['src/f.ts:1: ./a.ts']);
  });

  it('reads every specifier in a file, with the line that wrote it', () => {
    expect(found('src/f.ts', ["import { a } from '#generated/ears.ts';", '', "import { b } from 'vue';"].join('\n')))
      .toEqual(['src/f.ts:1: #generated/ears.ts', 'src/f.ts:3: vue']);
  });

  /**
   * The reason this is a parser. A commented-out import is not an import, and the scanner that used to blank
   * comments was not a lexer: the regex literal on the first line holds an unbalanced quote, so everything
   * after it looked like a string, the comment was never blanked, and the build failed naming a comment.
   */
  it('reads no comment, including after a regex literal holding a quote', () => {
    expect(found('src/f.ts', [
      "const q = /['\"]/;",
      "// import { a } from '#generated/events.ts';",
      "/* import { b } from './b.ts'; */",
      'export const ok = 1;',
    ].join('\n'))).toEqual([]);
  });

  /** A template literal's contents are a string, whatever they look like — the CLI's own templates are this */
  it('reads no template literal, including a nested one', () => {
    expect(found('src/f.ts', [
      "const t = `import { a } from './a.ts';`;",
      "const u = `outer ${`inner import { b } from './b.ts';`} end`;",
    ].join('\n'))).toEqual([]);
  });

  it("reads an SFC's script blocks, at the line the block starts on", () => {
    expect(found('src/features/a/fe/view.vue', [
      '<template><div /></template>',
      '',
      '<script setup lang="ts">',
      "import { openPlugin } from '#generated/fe.ts';",
      '</script>',
    ].join('\n'))).toEqual(['src/features/a/fe/view.vue:4: #generated/fe.ts']);
  });

  it('reads the directories it is given, and nothing outside them', () => {
    write('src/f.ts', "import { a } from './a.ts';");
    write('tests/f.spec.ts', "import { b } from './b.ts';");
    expect(packSpecifiers(packDir, ['src']).map((s) => s.file)).toEqual(['src/f.ts']);
    expect(packSpecifiers(packDir, ['src', 'tests']).map((s) => s.file)).toEqual(['src/f.ts', 'tests/f.spec.ts']);
    expect(packSpecifiers(packDir, ['nowhere'])).toEqual([]);
  });
});

describe('sourceFiles', () => {
  it('walks a pack\'s source and leaves declarations, node_modules and what skip names', () => {
    for (const file of ['src/a.ts', 'src/b.vue', 'src/c.d.ts', 'src/nested/d.mts', 'src/__generated__/e.ts', 'src/node_modules/f.ts', 'src/notes.md']) {
      write(file, 'export const x = 1;');
    }
    const under = (dir: string, skip?: (name: string) => boolean) =>
      [...sourceFiles(path.join(packDir, dir), skip)].map((f) => path.relative(packDir, f).split(path.sep).join('/')).sort();
    expect(under('src')).toEqual(['src/__generated__/e.ts', 'src/a.ts', 'src/b.vue', 'src/nested/d.mts']);
    expect(under('src', (name) => name === '__generated__')).toEqual(['src/a.ts', 'src/b.vue', 'src/nested/d.mts']);
  });
});
