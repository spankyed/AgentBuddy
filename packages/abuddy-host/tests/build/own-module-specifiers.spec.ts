import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ownModuleSpecifierProblems } from '../../src/build/own-module-specifiers.ts';

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

describe('ownModuleSpecifierProblems', () => {
  it('names the file an extensionless specifier should have named', () => {
    pack();
    write('src/__generated__/events.ts');
    write('src/features/a/be/system.ts', "import { broadcastToPlugin } from '#generated/events';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      "src/features/a/be/system.ts:1: '#generated/events' names no file — write '#generated/events.ts'",
    ]);
  });

  it('says nothing about a specifier that names its file', () => {
    pack();
    write('src/__generated__/events.ts');
    write('src/features/a/be/system.ts', "import { broadcastToPlugin } from '#generated/events.ts';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });

  it('reports the line of each occurrence, not of the first', () => {
    pack();
    write('src/__generated__/ears.ts');
    write('src/f.ts', ["import type { A } from '#generated/ears.ts';", '', "const later = await import('#generated/ears');"].join('\n'));
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      "src/f.ts:3: '#generated/ears' names no file — write '#generated/ears.ts'",
    ]);
  });

  it('reads an SFC, whose script block imports the same way', () => {
    pack();
    write('src/__generated__/fe.ts');
    write('src/features/a/fe/view.vue', "<script setup lang=\"ts\">\nimport { openPlugin } from '#generated/fe';\n</script>\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      "src/features/a/fe/view.vue:2: '#generated/fe' names no file — write '#generated/fe.ts'",
    ]);
  });

  it('names a directory by its index file', () => {
    pack({ '#features/*': './src/features/*' });
    write('src/features/a/be/repository/index.ts');
    write('src/f.ts', "import { repo } from '#features/a/be/repository';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      "src/f.ts:1: '#features/a/be/repository' names no file — write '#features/a/be/repository/index.ts'",
    ]);
  });

  it('leaves alone a # string that is not one of the pack\'s modules', () => {
    pack();
    write('src/f.ts', "const brand = '#3B82F6';\nimport x from '#generated/nothing-here';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });

  it('leaves alone a specifier an exact pattern maps, whose target carries the extension', () => {
    pack({ '#app': './src/app.ts', '#generated/*': './src/__generated__/*' });
    write('src/app.ts');
    write('src/f.ts', "import { app } from '#app';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });

  it('checks every directory it is given, so a pack\'s tests are covered too', () => {
    pack();
    write('src/__generated__/ears.ts');
    write('tests/a.spec.ts', "import { findAll } from '#generated/ears';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
    expect(ownModuleSpecifierProblems(packDir, ['src', 'tests'])).toEqual([
      "tests/a.spec.ts:1: '#generated/ears' names no file — write '#generated/ears.ts'",
    ]);
  });

  // One list for the file and the index attempt: the two in the resolver this replaced had drifted, the
  // first having .mts and .mjs and neither of their CJS counterparts, the second only ever trying index.ts
  it.each(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'])('names a %s file, and an index of one', (ext) => {
    pack({ '#generated/*': './src/__generated__/*' });
    write(`src/__generated__/a${ext}`);
    write(`src/__generated__/d/index${ext}`);
    write('src/f.ts', "import a from '#generated/a';\nimport d from '#generated/d';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      `src/f.ts:1: '#generated/a' names no file — write '#generated/a${ext}'`,
      `src/f.ts:2: '#generated/d' names no file — write '#generated/d/index${ext}'`,
    ]);
  });

  /**
   * Vite's default extensions leave `.vue` out, so an extensionless SFC import resolved nowhere — the one
   * form that was broken before this rule as well as after it, and the one most worth naming.
   */
  it('names an SFC target', () => {
    pack({ '#features/*': './src/features/*' });
    write('src/features/a/fe/view.vue', '<template><div /></template>');
    write('src/f.ts', "import View from '#features/a/fe/view';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      "src/f.ts:1: '#features/a/fe/view' names no file — write '#features/a/fe/view.vue'",
    ]);
  });

  it('leaves alone a specifier naming a directory with no index, which names no file either way', () => {
    pack();
    fs.mkdirSync(path.join(packDir, 'src/__generated__/empty'), { recursive: true });
    write('src/f.ts', "import x from '#generated/empty';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });

  it('names the source behind an emitted extension, which a pack never produces', () => {
    pack();
    write('src/__generated__/events.ts');
    write('src/f.ts', "import { sendToSystem } from '#generated/events.js';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([
      "src/f.ts:1: '#generated/events.js' names no file — write '#generated/events.ts'",
    ]);
  });

  it('leaves alone a .js specifier that does name a .js file', () => {
    pack();
    write('src/__generated__/flow-helpers.js');
    write('src/f.ts', "import { entry } from '#generated/flow-helpers.js';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });

  it('says nothing about a pack that declares no subpath imports', () => {
    write('package.json', JSON.stringify({ name: 'p', type: 'module' }));
    write('src/f.ts', "import x from '#generated/events';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });
});
