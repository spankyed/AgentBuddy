import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cliPackageDirectory } from '../../src/build/tool-identity.ts';
import { createCompilerInputObservations } from '@apackdev/host/build/compiler-inputs';
import { expect, it, vi } from 'vitest';
import { compilationConditions, captureCompilationInputs } from '../../src/build/compilation-inputs.ts';

it('normalizes equivalent launch paths while retaining custom export selectors', () => {
  expect(compilationConditions(['--require', '/test-loader.js', '--conditions=custom', '-C', 'custom'],
    '--import /other-loader.js --conditions="@apackdev/source" --conditions="custom with space"'))
    .toEqual(['custom', 'custom with space']);
  expect(compilationConditions([], '--conditions=@apackdev/source')).toEqual(compilationConditions([], ''));
});

it('preserves literal single quotes and unquoted backslashes in environment selectors', () => {
  expect(compilationConditions([], String.raw`--conditions='two words' --conditions=back\slash`))
    .toEqual(["'two", String.raw`back\slash`]);
});

it("retains skipped phases' consumed inputs and refuses changes before completing their replacement", async () => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-completed-inputs-')));
  const root = path.join(temporary, 'pack');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noLib: true, types: [] } }));
  fs.writeFileSync(path.join(root, 'value.ts'), 'export const value = 1;');
  const metadata = path.join(temporary, 'compiler.json');
  fs.writeFileSync(metadata, JSON.stringify({ hash: 'a'.repeat(64), packages: [cliPackageDirectory()], paths: [] }));
  vi.stubEnv('APACK_COMPILER_INPUTS', metadata);
  const file = path.join(temporary, 'external.txt');
  fs.writeFileSync(file, 'FIRST');
  try {
    const first = captureCompilationInputs(root);
    const inputs = await (async () => {
      try {
        first.readFile(file);
        first.prepareNativeSource(path.join(root, 'virtual.ts'), Buffer.from('export {};'));
        return await first.finish([]);
      }
      finally { first.dispose(); }
    })();
    // Native resolution inventories authored siblings, not the output directory publication creates.
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist/compiled.js'), 'output');
    const replacement = captureCompilationInputs(root);
    try {
      replacement.retainInputs(inputs);
      replacement.retainInputs(inputs);
      const completed = await replacement.finish([]);
      expect(completed.observations).toEqual(createCompilerInputObservations(root,
        [{ root, entries: completed.observations }, { root, entries: inputs.observations }]).snapshot().entries);
      expect(JSON.stringify(completed)).not.toContain(temporary);
    } finally { replacement.dispose(); }
    const changed = captureCompilationInputs(root);
    try {
      changed.retainInputs(inputs);
      fs.writeFileSync(file, 'OTHER');
      await expect(changed.finish([])).rejects.toThrow(/input changed/);
    } finally { changed.dispose(); }
  } finally {
    vi.unstubAllEnvs();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
