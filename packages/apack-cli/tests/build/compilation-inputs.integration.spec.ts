import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
// Real TypeScript programs and full installed package graphs are compiler integration work.
import { captureCompilationInputs } from '../../src/build/compilation-inputs.ts';
import * as moduleInputs from '../../src/build/compiler-module-inputs.ts';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

function pack() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-scope-'));
  roots.push(root);
  const library = path.join(root, 'node_modules/external');
  fs.mkdirSync(library, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer', dependencies: { external: '*' } }));
  fs.writeFileSync(path.join(library, 'package.json'), JSON.stringify({ name: 'external', version: '1.0.0' }));
  fs.writeFileSync(path.join(library, 'index.d.ts'), 'export type Value = string;');
  return { root, file: path.join(library, 'index.d.ts') };
}

it('captures once, rejects changed bytes, and accepts exact restoration without a version change', () => {
  const { root, file } = pack(), original = fs.readFileSync(file);
  const captured = captureCompilationInputs(root);
  expect(() => captured.assertCurrent()).not.toThrow();
  fs.writeFileSync(file, 'export type Value = number;');
  expect(() => captured.assertCurrent()).toThrow('Compiler or installed package inputs changed');
  fs.writeFileSync(file, original);
  expect(() => captured.assertCurrent()).not.toThrow();
});

it('captures runtime export conditions as well as package bytes', () => {
  const { root } = pack();
  const captured = captureCompilationInputs(root);
  vi.stubEnv('NODE_OPTIONS', `${process.env.NODE_OPTIONS ?? ''} --conditions=custom`);
  expect(() => captured.assertCurrent()).toThrow('Compiler or installed package inputs changed');
});

it('validates its captured read-set without rebuilding the TypeScript program, including changed bytes and new roots', () => {
  const { root } = pack();
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noLib: true, types: [], moduleResolution: 'bundler' } }));
  const source = path.join(root, 'src/index.ts');
  const original = "export type { Value } from 'external';";
  fs.writeFileSync(source, original);
  const captured = captureCompilationInputs(root);
  const rediscover = vi.spyOn(moduleInputs, 'readCompilerModuleInputs').mockImplementation(() => { throw new Error('Input validation rebuilt the TypeScript program'); });
  expect(() => captured.assertCurrent()).not.toThrow();
  fs.writeFileSync(source, `${original}\nexport const changed = true;`);
  expect(() => captured.assertCurrent()).toThrow('Compiler or installed package inputs changed');
  fs.writeFileSync(source, original);
  expect(() => captured.assertCurrent()).not.toThrow();
  fs.writeFileSync(path.join(root, 'src/new.ts'), 'export {};');
  expect(() => captured.assertCurrent()).toThrow('Compiler or installed package inputs changed');
  expect(rediscover).not.toHaveBeenCalled();
});
