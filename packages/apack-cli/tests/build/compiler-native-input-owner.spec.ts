import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { assertNativeCompilerObservations, beginCompilerStartupReads, createCompilerFileView } from '@apackdev/host/build/compiler-inputs';
import { createCompilerNativeInputs } from '../../src/build/compiler-native-input-owner.ts';
import { BUILD_INPUTS_DIRECTORY_ENV, removeCompilerReadTree } from '../../src/build/compiler-read-tree.ts';

// Exercise capture ownership with inert bytes; actual native loading belongs on disposable runners.
const runtimeProbe = vi.hoisted(() => ({ file: undefined as string | undefined }));
vi.mock('../../src/build/compiler-native-libraries.ts', () => ({
  assertCapturedCompilerLibraries(file: string, _root: string, input: {
    read(file: string): unknown; directoryExists(file: string): boolean;
  }) {
    input.read(file);
    input.read(file.replace('addon.node', 'value.dll'));
    if (runtimeProbe.file) { input.read(runtimeProbe.file); input.directoryExists(runtimeProbe.file); }
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
  const native = createCompilerNativeInputs(view, workspace, { directory: path.join(root, 'compiler'), paths: [] }, { macho: {
    libraryPaths: [], fallbackLibraryPaths: undefined, frameworkPaths: [], fallbackFrameworkPaths: undefined, imageSuffixes: [],
  } }, { capture: 'package' });
  try {
    runtimeProbe.file = path.join(workspace, 'node.exe.local');
    fs.mkdirSync(runtimeProbe.file);
    const captured = native.nativeModule(path.join(directory, 'addon.node'));
    expect(fs.readFileSync(captured, 'utf8')).toBe('ADDON');
    expect(fs.readFileSync(path.join(path.dirname(captured), 'value.dll'), 'utf8')).toBe('VALUE');
    // Runtime distribution membership belongs to the installation, not this pack's source receipt.
    fs.rmdirSync(runtimeProbe.file);
    expect(() => native.assertCurrent()).not.toThrow();
    fs.writeFileSync(generated, 'AFTER');
    const captureGenerated = () => view.captureFile(generated, Buffer.from('AFTER'));
    if (owner === 'author') expect(captureGenerated).not.toThrow();
    else expect(captureGenerated).toThrow('Compiler input changed during capture');
  } finally {
    runtimeProbe.file = undefined;
    native.dispose();
    vi.unstubAllEnvs();
    removeCompilerReadTree(root);
  }
});

it('keeps compiler copy locations out of replayable source input identity', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-owned-lookups-')));
  const pack = path.join(root, 'pack'), workspace = path.join(root, 'workspace');
  fs.mkdirSync(pack); fs.mkdirSync(workspace);
  vi.stubEnv(BUILD_INPUTS_DIRECTORY_ENV, workspace);
  const hashes: string[] = [];
  try {
    for (const name of ['compiler-a', 'compiler-b']) {
      const directory = path.join(root, name);
      const captured = path.join(directory, 'tree/drive');
      const dependency = path.join(captured, 'tool/node_modules/helper');
      fs.mkdirSync(dependency, { recursive: true });
      fs.writeFileSync(path.join(dependency, 'package.json'), '{"main":"index.js"}');
      fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports = 42;');
      const view = createCompilerFileView(pack);
      const native = createCompilerNativeInputs(view, workspace, {
        directory, paths: [{ captured, source: path.join(root, 'original') }],
      }, { macho: { libraryPaths: [], fallbackLibraryPaths: undefined, frameworkPaths: [], fallbackFrameworkPaths: undefined, imageSuffixes: [] } }, { capture: 'images' });
      const stop = beginCompilerStartupReads({ outputDirectory: workspace, compilation: {
        isInput: native.includes, readDataPath: native.readDataPath, sourcePath: native.sourcePath,
        readMetadata: view.readMetadata, readDirectory: view.readDirectoryData, openDirectory: view.openDirectoryData,
        requireParent: file => file, diagnostic: value => value,
      } });
      let observations;
      try {
        expect(createRequire(path.join(captured, 'tool/entry.cjs'))('helper')).toBe(42);
        hashes.push(view.hash());
        observations = view.observations();
      } finally { stop(); native.dispose(); }
      removeCompilerReadTree(directory);
      expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
    }
    expect(hashes[1]).toBe(hashes[0]);
  } finally { vi.unstubAllEnvs(); removeCompilerReadTree(root); }
});
