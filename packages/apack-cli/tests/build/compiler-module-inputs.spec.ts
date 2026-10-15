import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readCompilerModuleInputs } from '../../src/build/compiler-module-inputs.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

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
  expect(a.hash()).toBe(b.hash());
  fs.utimesSync(path.join(a.pack, '../contract.d.ts'), new Date(1), new Date(1));
  expect(a.hash()).toBe(b.hash());
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
  expect(readCompilerModuleInputs(pack).packageDirectories).toContain(fs.realpathSync(library));
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
