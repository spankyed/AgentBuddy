import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
import { packageInputsHash } from '../../src/build/package-inputs.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-npm-inputs-'));
  roots.push(root);
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const manifest = (directory: string, fields: object) => write(`${directory}/package.json`, JSON.stringify(fields));
  manifest('.', { name: 'consumer', dependencies: { compiler: '*' } });
  manifest('node_modules/compiler', { name: 'compiler', version: '1.0.0', exports: { '.': './index.js' }, dependencies: { helper: '*' } });
  manifest('node_modules/helper', { name: 'helper', version: '1.0.0' });
  write('node_modules/compiler/index.js', 'throw new Error("Never activate to hash packages");');
  write('node_modules/helper/index.js', 'export const value = 1;');
  return { root, write, manifest, hash: () => packageInputsHash([{ id: 'pack', directory: root, development: true }]) };
}

it('hashes blocked package metadata and transitive helper bytes without loading code', () => {
  const pack = tree();
  expect(() => createRequire(path.join(pack.root, 'package.json')).resolve('compiler/package.json')).toThrow();
  const before = pack.hash();
  pack.write('node_modules/helper/index.js', 'export const value = 2;');
  expect(pack.hash()).not.toBe(before);
});

it.each(['types.d.ts', 'data.json', 'styles.css', 'native.node'])('includes installed package input %s and its addition/removal', file => {
  const pack = tree(), target = `node_modules/compiler/${file}`;
  const before = pack.hash();
  pack.write(target, 'before');
  const added = pack.hash();
  expect(added).not.toBe(before);
  pack.write(target, 'after');
  expect(pack.hash()).not.toBe(added);
  fs.rmSync(path.join(pack.root, target));
  expect(pack.hash()).toBe(before);
});

it('follows package-local overrides and observes changes to resolution edges', () => {
  const pack = tree(), before = pack.hash();
  pack.manifest('node_modules/compiler/node_modules/helper', { name: 'helper', version: '1.0.0' });
  pack.write('node_modules/compiler/node_modules/helper/index.js', 'export const value = 3;');
  expect(pack.hash()).not.toBe(before);
  const overridden = pack.hash();
  pack.write('node_modules/helper/index.js', 'unresolved parent changes');
  expect(pack.hash()).toBe(overridden);
  pack.write('node_modules/compiler/node_modules/helper/index.js', 'changed local helper');
  expect(pack.hash()).not.toBe(overridden);
});

it('records absent optional packages and current conditional export changes', () => {
  const pack = tree();
  pack.manifest('node_modules/compiler', { name: 'compiler', optionalDependencies: { optional: '*' },
    exports: { import: './index.js', require: './other.cjs', types: './types.d.ts' } });
  const before = pack.hash();
  pack.manifest('node_modules/optional', { name: 'optional', version: '1.0.0' });
  expect(pack.hash()).not.toBe(before);
  const installed = pack.hash();
  pack.manifest('node_modules/compiler', { name: 'compiler', optionalDependencies: { optional: '*' }, exports: './index.js' });
  expect(pack.hash()).not.toBe(installed);
});

it('is independent of checkout paths and touches, and excludes root build output', () => {
  const first = tree(), second = tree();
  fs.utimesSync(path.join(second.root, 'node_modules/helper/index.js'), new Date(), new Date(Date.now() + 60_000));
  second.write('dist/runtime/index.cjs', 'consumer output');
  expect(first.hash()).toBe(second.hash());
});

it('bounds workspace inputs by source exports and published roots, including globbed data roots', () => {
  const pack = tree();
  pack.manifest('node_modules/compiler', { name: 'compiler', exports: { '.': { '@apackdev/source': './src/index.ts', default: './dist/index.js' } }, files: ['dist', 'data/*.json'] });
  pack.write('node_modules/compiler/src/index.ts', 'source');
  pack.write('node_modules/compiler/dist/index.js', 'published');
  pack.write('node_modules/compiler/data/schema.json', '{}');
  const before = pack.hash();
  pack.write('node_modules/compiler/.temp/scratch.js', 'scratch');
  pack.write('node_modules/compiler/tests/test.ts', 'test');
  expect(pack.hash()).toBe(before);
  pack.write('node_modules/compiler/data/schema.json', '{"changed":true}');
  expect(pack.hash()).not.toBe(before);
});

it('does not recurse through dependency cycles or include root output via a cycle', () => {
  const pack = tree();
  pack.manifest('node_modules/helper', { name: 'helper', dependencies: { consumer: '*' } });
  fs.symlinkSync(pack.root, path.join(pack.root, 'node_modules/consumer'), 'dir');
  const before = pack.hash();
  pack.write('dist/output.js', 'new output');
  expect(pack.hash()).toBe(before);
});

it('preserves development dependency coverage for a root first reached through another root', () => {
  const pack = tree();
  const owner = path.join(pack.root, 'node_modules/compiler');
  pack.manifest('node_modules/compiler', { name: 'compiler', devDependencies: { helper: '*' } });
  const hash = () => packageInputsHash([{ id: 'pack', directory: pack.root }, { id: 'compiler', directory: owner, development: true }]);
  const before = hash();
  pack.write('node_modules/helper/index.js', 'changed root development dependency');
  expect(hash()).not.toBe(before);
});

it('rejects workspace source and file declarations escaping their package owner', () => {
  const pack = tree();
  pack.manifest('node_modules/compiler', { name: 'compiler', exports: { '@apackdev/source': './src/index.ts' }, files: ['../outside'] });
  expect(pack.hash).toThrow('escape its owner');
  pack.manifest('node_modules/compiler', { name: 'compiler', exports: { '@apackdev/source': './../outside.js' } });
  expect(pack.hash).toThrow('escape its owner');
});
