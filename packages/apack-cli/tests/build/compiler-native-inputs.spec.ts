import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { readCompilerModuleInputs } from '../../src/build/compiler-module-inputs.ts';
import { createNativeInputReader } from '../../src/build/compiler-native-inputs.ts';
import { assertCapturedCompilerLibraries } from '../../src/build/compiler-native-libraries.ts';

vi.mock('../../src/build/compiler-native-libraries.ts', () => ({
  captureCompilerLibraryEnvironment: () => ({ macho: {
    libraryPaths: [], fallbackLibraryPaths: undefined, frameworkPaths: [], fallbackFrameworkPaths: undefined, imageSuffixes: [],
  } }),
  assertCapturedCompilerLibraries: vi.fn(() => { throw new Error('Outside native dependency'); }),
}));

function fixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-reader-')));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"native-reader","version":"1.0.0"}');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"compilerOptions":{"noLib":true,"types":[]}}');
  fs.writeFileSync(path.join(root, 'addon.node'), 'INERT');
  const view = readCompilerModuleInputs(root);
  const packages = readPackageInputs([{ id: 'pack', directory: root, development: true }]);
  return { root, view, packages, dispose() { view.dispose(); fs.rmSync(root, { recursive: true, force: true }); } };
}

it('uses the build owner for selected native images and preserves its refusals', () => {
  const context = fixture();
  const owner = vi.fn();
  vi.mocked(assertCapturedCompilerLibraries).mockClear();
  try {
    const reader = createNativeInputReader(context.view, context.packages, file => file, () => {}, { admitNative: owner });
    reader.prepare('node:fs', context.root);
    expect(owner).not.toHaveBeenCalled();
    const image = path.join(context.root, 'addon.node');
    reader.prepare(image, context.root);
    expect(owner).toHaveBeenCalledWith(image);
    expect(assertCapturedCompilerLibraries).not.toHaveBeenCalled();
    owner.mockImplementation(() => { throw new Error('Captured native input changed'); });
    expect(() => reader.prepare(image, context.root)).toThrow('Captured native input changed');
  } finally { context.dispose(); }
});

it('retains native dependency admission without a startup owner', () => {
  const context = fixture();
  try {
    const reader = createNativeInputReader(context.view, context.packages, file => file, () => {});
    expect(() => reader.prepare(path.join(context.root, 'addon.node'), context.root)).toThrow('Outside native dependency');
  } finally { context.dispose(); }
});
