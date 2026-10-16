import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
// Real TypeScript programs and full installed package graphs are compiler integration work.
import { captureCompilationInputs } from '../../src/build/compilation-inputs.ts';
import * as moduleInputs from '../../src/build/compiler-module-inputs.ts';
import { withCompilerFileReads } from '../../src/build/compiler-file-reads.ts';

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

it('formats diagnostics without materializing or reading the owned tree', () => {
  const { root } = pack();
  const compilation = captureCompilationInputs(root);
  const allocate = vi.spyOn(fs, 'mkdtempSync').mockImplementation(() => { throw new Error('Diagnostic allocated storage'); });
  expect(compilation.diagnostic('Missing source input')).toBe('Missing source input');
  expect(allocate).not.toHaveBeenCalled();
  compilation.dispose();
});


it('refuses retained async reads after disposal without recreating input storage', async () => {
  const { root, file } = pack();
  const compilation = captureCompilationInputs(root);
  const tree = compilation.readTree();
  const owned = tree.path(file);
  let resume!: () => void;
  const ready = new Promise<void>(resolve => { resume = resolve; });
  const retained = withCompilerFileReads({ compilation, outputDirectory: path.join(root, '.apack/build') }, async () => {
    await ready;
    return fs.promises.readFile(file, 'utf8');
  });
  compilation.dispose();
  expect(fs.existsSync(tree.directory)).toBe(false);
  const allocate = vi.spyOn(fs, 'mkdtempSync').mockImplementation(() => { throw new Error('Retired read allocated storage'); });
  const refused = expect(retained).rejects.toThrow('Compiler input operation outlived its build');
  resume();
  await refused;
  expect(() => compilation.readTree()).toThrow(/outlived/);
  expect(() => compilation.prepareNativeSource(file, Buffer.from('export {};'))).toThrow(/outlived/);
  expect(() => compilation.assertCurrent()).toThrow(/outlived/);
  expect(compilation.diagnostic(owned)).toBe(file);
  compilation.dispose();
  expect(allocate).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, 'utf8')).toBe('export type Value = string;');
});
