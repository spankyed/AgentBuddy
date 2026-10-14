import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { captureCompilationInputs, compilationConditions } from '../../src/build/compilation-inputs.ts';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

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

it('normalizes equivalent launch paths while retaining custom export selectors', () => {
  expect(compilationConditions(['--require', '/test-loader.js', '--conditions=custom', '-C', 'custom'],
    '--import /other-loader.js --conditions="@apackdev/source" --conditions="custom with space"'))
    .toEqual(['custom', 'custom with space']);
  expect(compilationConditions([], '--conditions=@apackdev/source')).toEqual(compilationConditions([], ''));
});
