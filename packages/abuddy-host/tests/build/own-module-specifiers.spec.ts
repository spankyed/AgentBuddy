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

  it('says nothing about a pack that declares no subpath imports', () => {
    write('package.json', JSON.stringify({ name: 'p', type: 'module' }));
    write('src/f.ts', "import x from '#generated/events';\n");
    expect(ownModuleSpecifierProblems(packDir)).toEqual([]);
  });
});
