import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import ts from 'typescript';
import { compilerModuleInputsHash } from '../../src/build/compiler-module-inputs.ts';
import { readPackCompilerConfiguration } from '../../src/build/compiler-configuration.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-config-'));
  roots.push(root);
  const pack = path.join(root, 'pack');
  fs.mkdirSync(pack);
  const write = (file: string, value: unknown) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  };
  return { root, pack, write };
}

it('distinguishes absent configuration from malformed or incomplete inheritance', () => {
  const { pack, write } = fixture();
  expect(readPackCompilerConfiguration(pack)).toBeUndefined();
  write('pack/tsconfig.json', '{broken');
  expect(() => readPackCompilerConfiguration(pack)).toThrow('could not be read');
  write('pack/tsconfig.json', { extends: '../missing.json' });
  expect(() => readPackCompilerConfiguration(pack)).toThrow('missing.json');
});

it('resolves external relative inheritance, including arrays and JSON comments', () => {
  const { pack, write } = fixture();
  write('one.json', '// parent\n{"compilerOptions":{"strict":true,"target":"ES2022"}}');
  write('two.json', { compilerOptions: { moduleResolution: 'bundler', module: 'esnext' } });
  write('pack/tsconfig.json', { extends: ['../one.json', '../two.json'], include: ['src'] });
  const configuration = readPackCompilerConfiguration(pack)!;
  expect(configuration.options.strict).toBe(true);
  expect(configuration.options.target).toBe(ts.ScriptTarget.ES2022);
  expect(configuration.options.moduleResolution).toBe(ts.ModuleResolutionKind.Bundler);
  expect([...configuration.files.keys()].map(file => path.basename(file))).toEqual(expect.arrayContaining(['tsconfig.json', 'one.json', 'two.json']));
  const before = compilerModuleInputsHash(pack);
  write('one.json', { compilerOptions: { strict: false, target: 'ES2022' } });
  expect(compilerModuleInputsHash(pack)).not.toBe(before);
});

it('captures package-based inherited configuration without importing its entry', () => {
  const { pack, write } = fixture();
  write('pack/tsconfig.json', { extends: 'config-package/base.json' });
  write('pack/node_modules/config-package/package.json', { name: 'config-package', version: '1.0.0' });
  write('pack/node_modules/config-package/index.js', 'throw new Error("No activation");');
  write('pack/node_modules/config-package/base.json', { compilerOptions: { strict: true } });
  const before = compilerModuleInputsHash(pack);
  expect(readPackCompilerConfiguration(pack)!.options.strict).toBe(true);
  write('pack/node_modules/config-package/base.json', { compilerOptions: { strict: false } });
  expect(compilerModuleInputsHash(pack)).not.toBe(before);
});

it('is independent of checkout location and touches', () => {
  const first = fixture(), second = fixture();
  for (const { write } of [first, second]) {
    write('base.json', { compilerOptions: { target: 'ES2022' } });
    write('pack/tsconfig.json', { extends: '../base.json' });
  }
  fs.utimesSync(path.join(second.root, 'base.json'), new Date(), new Date(Date.now() + 60_000));
  expect(compilerModuleInputsHash(first.pack)).toBe(compilerModuleInputsHash(second.pack));
});

it('reports circular inheritance and invalid options instead of empty defaults', () => {
  const { pack, write } = fixture();
  write('base.json', { extends: './pack/tsconfig.json' });
  write('pack/tsconfig.json', { extends: '../base.json' });
  expect(() => readPackCompilerConfiguration(pack)).toThrow('Circularity');
  write('pack/tsconfig.json', { compilerOptions: { moduleResolution: 'invalid' } });
  expect(() => readPackCompilerConfiguration(pack)).toThrow('moduleResolution');
});
