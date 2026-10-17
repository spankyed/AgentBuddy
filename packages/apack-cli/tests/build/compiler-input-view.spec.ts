import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createPackCompilerInputView, type PackCompilerInputView } from '../../src/build/compiler-input-view.ts';
import { assertNativeCompilerObservations, hashCompilerInputObservations } from '@apackdev/host/build/compiler-inputs';

const roots: string[] = [];
const views: PackCompilerInputView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-authored-inputs-')));
  roots.push(root);
  const pack = path.join(root, 'pack');
  fs.mkdirSync(path.join(pack, 'empty'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'src'));
  const source = path.join(pack, 'value.ts');
  fs.writeFileSync(source, 'export const value = 1;');
  return { root, pack, source };
}

function declaredDependency() {
  const input = fixture();
  const dependency = path.join(input.root, 'node_modules/owned-dependency');
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(path.join(input.pack, 'package.json'), JSON.stringify({ dependencies: { 'owned-dependency': '*' }, optionalDependencies: { 'absent-input-fixture': '*' } }));
  fs.writeFileSync(path.join(dependency, 'package.json'), '{"name":"owned-dependency","main":"index.js"}');
  const entry = path.join(dependency, 'index.js');
  fs.writeFileSync(entry, 'throw new Error("CAPTURED dependency must not execute");');
  return { ...input, dependency, entry };
}

it('owns declared dependency bytes before their first read or preload execution', () => {
  const { pack, entry } = declaredDependency();
  const view = createPackCompilerInputView(pack);
  views.push(view);
  fs.writeFileSync(entry, 'LIVE');
  expect(view.readBytes(entry)?.toString()).toContain('CAPTURED dependency');
  expect(() => view.assertCurrent()).toThrow('namespace changed');
});

it('records dependency membership for local and cross-thread validation while ignoring package caches', () => {
  const { pack, dependency } = declaredDependency();
  const view = createPackCompilerInputView(pack);
  views.push(view);
  const observations = view.observations();
  expect(view.hash()).toBe(hashCompilerInputObservations(observations));
  fs.mkdirSync(path.join(dependency, '.cache'));
  fs.writeFileSync(path.join(dependency, '.cache/generated.js'), 'CACHE');
  expect(() => view.assertCurrent()).not.toThrow();
  expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
  fs.writeFileSync(path.join(dependency, 'new-entry.js'), 'NEW');
  expect(() => view.assertCurrent()).toThrow('Declared npm package membership changed');
  expect(() => assertNativeCompilerObservations(observations)).toThrow('Compiler startup input changed');
});

it('retains missing optional dependency lookups before preloads can populate them', () => {
  const { root, pack } = declaredDependency();
  const view = createPackCompilerInputView(pack);
  views.push(view);
  const optional = path.join(root, 'node_modules/absent-input-fixture');
  fs.mkdirSync(optional);
  fs.writeFileSync(path.join(optional, 'package.json'), '{"name":"absent-input-fixture"}');
  expect(() => view.assertCurrent()).toThrow('namespace changed');
});

it('owns authored bytes before their first compiler read, including linked files and binary assets', () => {
  const { root, pack, source } = fixture();
  const linked = path.join(root, 'linked.txt');
  fs.writeFileSync(linked, 'ORIGINAL');
  fs.symlinkSync(linked, path.join(pack, 'linked.txt'));
  const asset = path.join(pack, 'asset.bin');
  const bytes = Buffer.from([0, 255, 7]);
  fs.writeFileSync(asset, bytes);
  const view = createPackCompilerInputView(pack);
  views.push(view);
  fs.writeFileSync(source, 'export const value = 2;');
  fs.writeFileSync(linked, 'CHANGED');
  fs.writeFileSync(asset, 'CHANGED');
  expect(view.readBytes(source)?.toString()).toBe('export const value = 1;');
  expect(view.readDataBytes(linked)?.toString()).toBe('ORIGINAL');
  expect(view.readBytes(asset)).toEqual(bytes);
  expect(() => view.assertCurrent()).toThrow('Compiler resolution namespace changed');
  fs.writeFileSync(source, 'export const value = 1;');
  fs.writeFileSync(linked, 'ORIGINAL');
  fs.writeFileSync(asset, bytes);
  expect(() => view.assertCurrent()).not.toThrow();
  view.dispose();
  fs.rmSync(pack, { recursive: true });
  expect(() => view.assertCurrent()).toThrow(/outlived/);
});

it('replays authored directory facts while generated outputs are present', () => {
  const { pack } = fixture();
  const view = createPackCompilerInputView(pack);
  views.push(view);
  view.fileSystem.getDirectories(path.join(pack, 'src'));
  const observations = view.observations();
  fs.mkdirSync(path.join(pack, 'src/__generated__'));
  fs.writeFileSync(path.join(pack, 'src/__generated__/types.ts'), 'export {};');
  expect(() => view.assertCurrent()).not.toThrow();
  expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
});

it('retains authored membership and consumed directory queries while ignoring generated output', () => {
  const { pack } = fixture();
  fs.rmdirSync(path.join(pack, 'src'));
  const view = createPackCompilerInputView(pack);
  views.push(view);
  const authored = view.observations();
  for (const directory of ['dist', '.apack', 'src/__generated__']) {
    fs.mkdirSync(path.join(pack, directory), { recursive: true });
    fs.writeFileSync(path.join(pack, directory, 'output.ts'), 'export {};');
  }
  expect(() => view.assertCurrent()).not.toThrow();
  expect(() => assertNativeCompilerObservations(authored)).not.toThrow();
  view.fileSystem.getDirectories(path.join(pack, 'empty'));
  const consumed = view.observations();
  fs.mkdirSync(path.join(pack, 'empty/new-directory'));
  expect(() => view.assertCurrent()).toThrow('namespace changed');
  expect(() => assertNativeCompilerObservations(consumed)).toThrow('Compiler startup input changed');
  fs.rmdirSync(path.join(pack, 'empty/new-directory'));
  fs.writeFileSync(path.join(pack, 'new.ts'), 'export {};');
  expect(view.authoredFiles).toEqual(['value.ts']);
  expect(() => view.assertCurrent()).toThrow('source membership changed');
  expect(() => assertNativeCompilerObservations(consumed)).toThrow('Compiler startup input changed');
});

it('replays explicitly consumed generated bytes without adding generated files to authored membership', () => {
  const { pack } = fixture();
  const generated = path.join(pack, 'src/__generated__/types.ts');
  fs.mkdirSync(path.dirname(generated));
  fs.writeFileSync(generated, 'export type Value = 1;');
  const view = createPackCompilerInputView(pack);
  views.push(view);
  view.captureFile(generated, fs.readFileSync(generated));
  const observations = view.observations();
  expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
  fs.writeFileSync(path.join(path.dirname(generated), 'unconsumed.ts'), 'export {};');
  expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
  fs.writeFileSync(generated, 'export type Value = 2;');
  expect(() => assertNativeCompilerObservations(observations)).toThrow('Compiler startup input changed');
  fs.writeFileSync(generated, 'export type Value = 1;');
  expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
});
