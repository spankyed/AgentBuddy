import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { beginCompilerNativeModules, beginCompilerStartupReads, type CompilerFileReadInputs } from '../../../src/build/compiler-inputs/compiler-file-reads.ts';
import { createCompilerFileView } from '../../../src/build/compiler-inputs/compiler-file-view.ts';

it('preserves omitted and explicit dlopen flags while replacing only the admitted filename', () => {
  const original = process.dlopen;
  const native = vi.fn<typeof process.dlopen>();
  process.dlopen = native;
  const dispose = beginCompilerNativeModules(file => file + '.captured');
  try {
    const module = { exports: {} };
    process.dlopen(module, 'addon.node');
    process.dlopen(module, 'addon.node', 2);
    process.dlopen(module, 'addon.node', undefined);
    expect(native.mock.calls).toEqual([
      [module, 'addon.node.captured'],
      [module, 'addon.node.captured', 2],
      [module, 'addon.node.captured', undefined],
    ]);
  } finally {
    dispose();
    process.dlopen = original;
  }
});

it.each(['selected', 'missing'])('observes nearer package declarations during %s native resolution', selected => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-module-probes-'));
  const parent = path.join(root, 'sub');
  fs.mkdirSync(parent);
  const declare = (directory: string) => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), '{"main":"index.cjs"}');
    fs.writeFileSync(path.join(directory, 'index.cjs'), 'module.exports = 42;');
  };
  if (selected === 'selected') declare(path.join(root, 'node_modules/probe-package'));
  const require = createRequire(path.join(parent, 'entry.cjs'));
  const view = createCompilerFileView(root);
  const compilation: CompilerFileReadInputs = {
    isInput: file => file.startsWith(root + path.sep),
    readDataPath(file) { view.readDataBytes(file); return file; },
    readMetadata: view.readMetadata, readDirectory: view.readDirectoryData, openDirectory: view.openDirectoryData,
    sourcePath: file => file, requireParent: file => file, diagnostic: message => message,
  };
  const stop = beginCompilerStartupReads({ compilation });
  try {
    const resolve = () => require('probe-package');
    if (selected === 'selected') expect(resolve()).toBe(42);
    else expect(resolve).toThrow('Cannot find module');
    stop();
    expect(() => view.assertCurrent()).not.toThrow();
    declare(path.join(parent, 'node_modules/probe-package'));
    expect(() => view.assertCurrent()).toThrow();
  } finally { stop(); view.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});
