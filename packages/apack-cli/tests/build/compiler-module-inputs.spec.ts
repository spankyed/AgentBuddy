import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readCompilerModuleInputs } from '../../src/build/compiler-module-inputs.ts';
import { COMPILER_INPUTS_ENV } from '../../src/build/compiler-installation-inputs.ts';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function setCompilerPaths(pack: string, paths: Array<{ captured: string; source: string }>) {
  const file = path.join(pack, '../compiler-inputs.json');
  fs.writeFileSync(file, JSON.stringify({ hash: '0'.repeat(64), packages: [], paths }));
  vi.stubEnv(COMPILER_INPUTS_ENV, file);
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-module-inputs-'));
  roots.push(directory);
  const pack = path.join(directory, 'pack');
  fs.mkdirSync(path.join(pack, 'src'), { recursive: true });
  const write = (file: string, text: string) => {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write('pack/tsconfig.json', JSON.stringify({ compilerOptions: {
    module: 'ESNext', moduleResolution: 'Bundler', noLib: true, types: [],
    baseUrl: '..', paths: { contract: ['contract.d.ts'] },
  } }));
  write('pack/src/index.ts', "export type { Value } from 'contract';");
  return { pack, write, hash: () => readCompilerModuleInputs(pack).hash };
}

it('tracks outside transitive imports, unresolved targets becoming available and removals', () => {
  const { pack, write, hash } = fixture();
  const missing = hash();
  write('contract.d.ts', "export type { Value } from './leaf';");
  const intermediate = hash();
  expect(intermediate).not.toBe(missing);
  write('leaf.d.ts', 'export type Value = string;');
  const before = hash();
  expect(before).not.toBe(intermediate);
  write('leaf.d.ts', 'export type Value = number;');
  expect(hash()).not.toBe(before);
  write('leaf.d.ts', 'export type Value = string;');
  expect(hash()).toBe(before);
  fs.unlinkSync(path.join(pack, '../leaf.d.ts'));
  expect(hash()).toBe(intermediate);
});

it('records missing outside resolution directories even before a module becomes available', () => {
  const { pack, write, hash } = fixture();
  write('pack/src/index.ts', "import '../../shared/not-there';");
  const missing = hash();
  fs.mkdirSync(path.join(pack, '../shared'));
  expect(hash()).not.toBe(missing);
  fs.rmdirSync(path.join(pack, '../shared'));
  expect(hash()).toBe(missing);
});

it('records a dangling outside resolution link changing targets', () => {
  const { pack, write, hash } = fixture();
  write('pack/src/index.ts', "import '../../shared/not-there';");
  const link = path.join(pack, '../shared');
  fs.symlinkSync('first-missing', link, 'dir');
  const first = hash();
  fs.unlinkSync(link);
  fs.symlinkSync('second-missing', link, 'dir');
  expect(hash()).not.toBe(first);
  fs.unlinkSync(link);
  fs.symlinkSync('first-missing', link, 'dir');
  expect(hash()).toBe(first);
});

it('records membership of an external ambient type directory without loading a module', () => {
  const { pack, write, hash } = fixture();
  write('pack/tsconfig.json', JSON.stringify({ compilerOptions: { noLib: true, typeRoots: ['../ambient'] } }));
  fs.mkdirSync(path.join(pack, '../ambient'));
  const empty = hash();
  fs.mkdirSync(path.join(pack, '../ambient/environment'));
  expect(hash()).not.toBe(empty);
  fs.rmdirSync(path.join(pack, '../ambient/environment'));
  expect(hash()).toBe(empty);
});

it('refuses a resolution link changing during a single discovery', () => {
  const { pack, write } = fixture();
  write('first.d.ts', 'export type Value = string;');
  write('second.d.ts', 'export type Value = string;');
  const link = path.join(fs.realpathSync.native(path.dirname(pack)), 'contract.d.ts');
  fs.symlinkSync('first.d.ts', link);
  let observations = 0;
  expect(() => readCompilerModuleInputs(pack, file => {
    if (path.resolve(file) !== link || ++observations !== 2) return;
    fs.unlinkSync(link);
    fs.symlinkSync('second.d.ts', link);
  })).toThrow('Compiler resolution namespace changed during discovery');
});

it('refuses a lookup parent retargeted during discovery', () => {
  const { pack, write } = fixture();
  write('pack/tsconfig.json', JSON.stringify({ compilerOptions: {
    noLib: true, types: [], baseUrl: '..', paths: { contract: ['shared/contract.d.ts'] },
  } }));
  write('first/contract.d.ts', 'export type Value = string;');
  write('second/contract.d.ts', 'export type Value = string;');
  const link = path.join(fs.realpathSync.native(path.dirname(pack)), 'shared');
  fs.symlinkSync('first', link, 'dir');
  let observations = 0;
  expect(() => readCompilerModuleInputs(pack, file => {
    if (path.resolve(file) !== path.join(link, 'contract.d.ts') || ++observations !== 2) return;
    fs.unlinkSync(link);
    fs.symlinkSync('second', link, 'dir');
  })).toThrow('Compiler resolution namespace changed during discovery');
});

it('refuses authored source membership changing after program roots are selected', () => {
  const { pack, write } = fixture();
  fs.unlinkSync(path.join(pack, 'tsconfig.json'));
  let changed = false;
  expect(() => readCompilerModuleInputs(pack, file => {
    if (changed || path.resolve(file) !== path.join(pack, 'src/index.ts')) return;
    changed = true;
    write('pack/src/added.ts', 'export const added = true;');
  })).toThrow('Compiler source membership changed during discovery');
});

it('tracks undeclared package resolution and its package metadata without executing code', () => {
  const { write, hash } = fixture();
  write('pack/src/index.ts', "export type { Value } from 'undeclared';");
  write('pack/node_modules/undeclared/package.json', JSON.stringify({ name: 'undeclared', types: 'index.d.ts' }));
  write('pack/node_modules/undeclared/index.js', "throw new Error('must not activate');");
  write('pack/node_modules/undeclared/index.d.ts', 'export type Value = string;');
  const before = hash();
  write('pack/node_modules/undeclared/index.d.ts', 'export type Value = number;');
  expect(hash()).not.toBe(before);
  write('pack/node_modules/undeclared/index.d.ts', 'export type Value = string;');
  expect(hash()).toBe(before);
  write('pack/node_modules/undeclared/package.json', JSON.stringify({ name: 'undeclared', types: 'other.d.ts' }));
  write('pack/node_modules/undeclared/other.d.ts', 'export type Value = boolean;');
  expect(hash()).not.toBe(before);
});

it('does not consume generated output even when authored code imports it', () => {
  const { write, hash } = fixture();
  write('pack/src/index.ts', "export type { Value } from './__generated__/types';");
  const missing = hash();
  write('pack/src/__generated__/types.ts', "export type { Value } from '../../../leaf';");
  write('leaf.d.ts', 'export type Value = string;');
  expect(hash()).toBe(missing);
});

it('includes explicit ambient type roots outside the pack', () => {
  const { write, hash } = fixture();
  write('pack/tsconfig.json', JSON.stringify({ compilerOptions: {
    noLib: true, typeRoots: ['../ambient'], types: ['environment'],
  } }));
  write('ambient/environment/index.d.ts', 'declare const environment: string;');
  const before = hash();
  write('ambient/environment/index.d.ts', 'declare const environment: number;');
  expect(hash()).not.toBe(before);
});

it('is independent of checkout location and modification times', () => {
  const a = fixture(), b = fixture();
  a.write('contract.d.ts', 'export type Value = string;');
  b.write('contract.d.ts', 'export type Value = string;');
  const first = readCompilerModuleInputs(a.pack), second = readCompilerModuleInputs(b.pack);
  expect(first.observations().entries).toEqual(second.observations().entries);
  expect(first.hash).toBe(second.hash);
  fs.utimesSync(path.join(a.pack, '../contract.d.ts'), new Date(1), new Date(1));
  expect(a.hash()).toBe(b.hash());
});

it('keeps source input identity when the pack root is captured at a different depth', () => {
  const { pack, write } = fixture();
  write('pack/tsconfig.json', JSON.stringify({ compilerOptions: { noLib: true, types: [], module: 'ESNext' } }));
  write('pack/src/index.ts', 'export interface Value { title: string }');
  const source = readCompilerModuleInputs(pack).hash;
  const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-owned-modules-')));
  roots.push(temporary);
  const captured = path.join(temporary, 'nested/tree/pack');
  fs.cpSync(pack, captured, { recursive: true });
  setCompilerPaths(pack, [{ captured, source: pack }]);
  expect(readCompilerModuleInputs(captured).hash).toBe(source);
  fs.unlinkSync(path.join(pack, 'src/index.ts'));
  expect(readCompilerModuleInputs(captured).hash).toBe(source);
});

it('keeps discovered package ordering relative to the source root across a capture', () => {
  const { pack, write } = fixture();
  write('package.json', '{"name":"parent","type":"module"}');
  write('pack/package.json', '{"name":"pack","type":"module"}');
  write('pack/tsconfig.json', JSON.stringify({ compilerOptions: { noLib: true, types: [], moduleResolution: 'Bundler', module: 'ESNext' } }));
  write('pack/src/index.ts', 'export type { Inside } from "inside"; export type { Outside } from "outside";');
  for (const [directory, name, type] of [
    ['pack/node_modules/inside', 'inside', 'Inside'], ['node_modules/outside', 'outside', 'Outside'],
  ]) {
    write(`${directory}/package.json`, JSON.stringify({ name, types: 'index.d.ts' }));
    write(`${directory}/index.d.ts`, `export interface ${type} { title: string }`);
  }
  const context = fs.realpathSync.native(path.dirname(pack)), sourceRoot = path.join(context, 'a-pack');
  fs.renameSync(pack, sourceRoot);
  const source = readCompilerModuleInputs(sourceRoot);
  expect(source.packageDirectories).toEqual([path.join(context, 'node_modules/outside'), path.join(sourceRoot, 'node_modules/inside')]);
  const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-owned-package-order-')));
  roots.push(temporary);
  const capturedContext = path.join(temporary, 'nested/tree/context');
  fs.cpSync(context, capturedContext, { recursive: true });
  setCompilerPaths(sourceRoot, [{ captured: capturedContext, source: context }]);
  const captured = readCompilerModuleInputs(path.join(capturedContext, 'a-pack'));
  expect(captured.packageDirectories.map(directory => path.join(context, path.relative(capturedContext, directory))))
    .toEqual(source.packageDirectories);
  expect(captured.hash).toBe(source.hash);
});

it('keeps captured compiler input identity stable across different private directories', () => {
  const { pack, write, hash } = fixture();
  write('first/contract.d.ts', 'export type Value = string;');
  write('second/contract.d.ts', 'export type Value = string;');
  const capture = (directory: string) => {
    const captured = fs.realpathSync.native(path.join(pack, '..', directory));
    const source = path.join(fs.realpathSync.native(path.dirname(pack)), 'original');
    const link = path.join(pack, '../contract.d.ts');
    fs.rmSync(link, { force: true });
    fs.symlinkSync(path.join(captured, 'contract.d.ts'), link);
    setCompilerPaths(pack, [{ captured, source }]);
    return hash();
  };
  const first = capture('first');
  expect(capture('second')).toBe(first);
  write('second/contract.d.ts', 'export type Value = number;');
  expect(capture('second')).not.toBe(first);
});

it('refuses different captured and live bytes claimed under one source identity', () => {
  const { pack, write, hash } = fixture();
  write('captured/contract.d.ts', 'export type Value = string;');
  write('original/contract.d.ts', 'export type Value = number;');
  write('pack/src/index.ts', 'import "../../captured/contract.d.ts"; import "../../original/contract.d.ts";');
  setCompilerPaths(pack, [{
    captured: fs.realpathSync.native(path.join(pack, '../captured')),
    source: fs.realpathSync.native(path.join(pack, '../original')),
  }]);
  expect(hash).toThrow('Conflicting compiler input observation');
});

it('discovers scoped package owners through workspace links without loading their executable entries', () => {
  const { pack, write } = fixture();
  write('pack/src/index.ts', "export type { Value } from '@scope/library';");
  write('library/package.json', JSON.stringify({ name: '@scope/library', types: './index.d.ts' }));
  write('library/index.d.ts', 'export type Value = string;');
  write('library/index.js', "throw new Error('must not activate');");
  fs.mkdirSync(path.join(pack, 'node_modules/@scope'), { recursive: true });
  const library = path.join(pack, '../library');
  fs.symlinkSync(library, path.join(pack, 'node_modules/@scope/library'), 'dir');
  expect(readCompilerModuleInputs(pack).packageDirectories).toContain(fs.realpathSync.native(library));
});

it.each(['', 'setup', 'lang="ts"', 'setup lang="tsx"'])('follows imports in Vue script %s without evaluating them', attributes => {
  const { write, hash } = fixture();
  write('pack/src/index.ts', 'export {};');
  write('pack/src/canvas.vue', `<script ${attributes}>import { value } from 'contract'; throw new Error('never activate');</script>`);
  write('contract.d.ts', 'export declare const value: string;');
  const before = hash();
  write('contract.d.ts', 'export declare const value: number;');
  expect(hash()).not.toBe(before);
  write('contract.d.ts', 'export declare const value: string;');
  expect(hash()).toBe(before);
});

it('follows external Vue script sources and both inline script blocks', () => {
  const { write, hash } = fixture();
  write('pack/src/index.ts', 'export {};');
  write('pack/src/external.vue', '<script src="../../external.ts" lang="ts"></script>');
  const missing = hash();
  write('external.ts', "export { value } from './contract';");
  expect(hash()).not.toBe(missing);
  write('contract.d.ts', 'export declare const value: string;');
  const external = hash();
  write('contract.d.ts', 'export declare const value: number;');
  expect(hash()).not.toBe(external);
  write('pack/src/inline.vue', `<script lang="ts">import '../../first.ts';</script>
<script setup lang="ts">import '../../second.ts';</script>`);
  write('first.ts', 'export const first = 1;');
  write('second.ts', 'export const second = 2;');
  const before = hash();
  write('first.ts', 'export const first = 3;');
  expect(hash()).not.toBe(before);
  write('first.ts', 'export const first = 1;');
  expect(hash()).toBe(before);
  write('second.ts', 'export const second = 4;');
  expect(hash()).not.toBe(before);
});

it('resolves a linked Vue component relative to its physical directory', () => {
  const { pack, write, hash } = fixture();
  write('pack/src/index.ts', 'export {};');
  write('shared/canvas.vue', '<script setup lang="ts">import { value } from "./value.ts";</script>');
  write('shared/value.ts', 'export const value = 1;');
  fs.symlinkSync(path.join(pack, '../shared/canvas.vue'), path.join(pack, 'src/canvas.vue'));
  const before = hash();
  write('shared/value.ts', 'export const value = 2;');
  expect(hash()).not.toBe(before);
});

it('excludes generated imports reached through physical Vue script paths', () => {
  const { write, hash } = fixture();
  write('pack/src/index.ts', 'export {};');
  write('pack/src/canvas.vue', '<script setup lang="ts">import { value } from "./__generated__/types.ts";</script>');
  const before = hash();
  write('pack/src/__generated__/types.ts', 'export const value = 1;');
  expect(hash()).toBe(before);
});

it('keeps Vue input identity independent of checkout location', () => {
  const a = fixture(), b = fixture();
  for (const { write } of [a, b]) {
    write('pack/src/index.ts', 'export {};');
    write('pack/src/canvas.vue', '<script setup lang="ts">import { value } from "../../contract.d.ts";</script>');
    write('contract.d.ts', 'export declare const value: string;');
  }
  expect(a.hash()).toBe(b.hash());
});
