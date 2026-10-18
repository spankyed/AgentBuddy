import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createCompilerFileView } from '@apackdev/host/build/compiler-inputs';
import { createCompilerNativeInputs } from '../../src/build/compiler-native-input-owner.ts';
import { BUILD_INPUTS_DIRECTORY_ENV, removeCompilerReadTree } from '../../src/build/compiler-read-tree.ts';

// Exercise capture ownership with inert bytes; actual native loading belongs on disposable runners.
vi.mock('../../src/build/compiler-native-libraries.ts', () => ({
  assertCapturedCompilerLibraries(file: string, _root: string, input: { read(file: string): unknown }) {
    input.read(file);
    input.read(file.replace('addon.node', 'value.dll'));
  },
}));

it.each(['author', 'dependency'] as const)('keeps generated-output ownership with the %s package', owner => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-owner-')));
  const pack = path.join(root, 'pack'), workspace = path.join(root, 'workspace');
  const directory = owner === 'author' ? pack : path.join(root, 'dependency');
  const generated = path.join(directory, 'src/__generated__/events.ts');
  fs.mkdirSync(pack); fs.mkdirSync(workspace);
  fs.mkdirSync(path.dirname(generated), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), '{}');
  fs.writeFileSync(generated, 'BEFORE');
  fs.writeFileSync(path.join(directory, 'addon.node'), 'ADDON');
  fs.writeFileSync(path.join(directory, 'value.dll'), 'VALUE');
  vi.stubEnv(BUILD_INPUTS_DIRECTORY_ENV, workspace);
  const view = createCompilerFileView(pack);
  const native = createCompilerNativeInputs(view, workspace, [], { macho: {
    libraryPaths: [], fallbackLibraryPaths: undefined, frameworkPaths: [], fallbackFrameworkPaths: undefined, imageSuffixes: [],
  } }, { capture: 'package' });
  try {
    const captured = native.nativeModule(path.join(directory, 'addon.node'));
    expect(fs.readFileSync(captured, 'utf8')).toBe('ADDON');
    expect(fs.readFileSync(path.join(path.dirname(captured), 'value.dll'), 'utf8')).toBe('VALUE');
    fs.writeFileSync(generated, 'AFTER');
    const captureGenerated = () => view.captureFile(generated, Buffer.from('AFTER'));
    if (owner === 'author') expect(captureGenerated).not.toThrow();
    else expect(captureGenerated).toThrow('Compiler input changed during capture');
  } finally {
    native.dispose();
    vi.unstubAllEnvs();
    removeCompilerReadTree(root);
  }
});
