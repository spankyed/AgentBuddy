import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import module, { createRequire } from 'node:module';
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

it.each(['selected', 'missing', 'package-less', 'relative', 'index', 'main', 'subpath', 'symlink'])('observes %s native resolution inputs', kind => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-module-probes-')));
  const parent = path.join(root, 'sub');
  fs.mkdirSync(parent);
  const declare = (directory: string, metadata = true) => {
    fs.mkdirSync(directory, { recursive: true });
    if (metadata) fs.writeFileSync(path.join(directory, 'package.json'), '{"main":"index.js"}');
    fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = 42;');
  };
  if (kind === 'selected' || kind === 'package-less') declare(path.join(root, 'node_modules/probe-package'), kind !== 'package-less');
  if (kind === 'package-less') fs.mkdirSync(path.join(parent, 'node_modules/probe-package'), { recursive: true });
  if (kind === 'index') fs.mkdirSync(path.join(parent, 'value'));
  if (kind === 'symlink') {
    for (const name of ['before', 'after']) fs.writeFileSync(path.join(parent, name + '.js'), 'module.exports = 42;');
    fs.symlinkSync(path.join(parent, 'before.js'), path.join(parent, 'value'), 'file');
  }
  const main = kind === 'subpath' ? path.join(root, 'node_modules/probe-package/sub') : path.join(parent, 'value');
  if (kind === 'main' || kind === 'subpath') {
    declare(main);
    fs.writeFileSync(path.join(main, 'package.json'), '{"main":"missing.js"}');
  }
  const require = createRequire(path.join(parent, 'entry.cjs'));
  const observed = new Set<string>();
  const view = createCompilerFileView(root, { observe: file => { observed.add(file); } });
  const compilation: CompilerFileReadInputs = {
    isInput: file => file.startsWith(root + path.sep),
    readDataPath(file) { view.readDataBytes(file); return file; },
    readMetadata: view.readMetadata, readDirectory: view.readDirectoryData, openDirectory: view.openDirectoryData,
    sourcePath: file => file, requireParent: file => file, diagnostic: message => message,
  };
  const register = module.registerHooks;
  const release = vi.fn();
  const registration = vi.spyOn(module, 'registerHooks').mockImplementation(options => {
    const hooks = register(options);
    return { deregister() { release(); hooks.deregister(); } };
  });
  const stop = beginCompilerStartupReads({ compilation });
  try {
    const request = kind === 'subpath' ? 'probe-package/sub' : ['relative', 'index', 'main', 'symlink'].includes(kind) ? './value' : 'probe-package';
    const resolve = () => require(request);
    if (['selected', 'package-less', 'main', 'subpath', 'symlink'].includes(kind)) expect(resolve()).toBe(42);
    else expect(resolve).toThrow('Cannot find module');
    stop();
    expect(release).toHaveBeenCalledTimes(1);
    if (kind === 'selected' || kind === 'missing') {
      expect(observed.has(path.join(parent, 'node_modules/probe-package/package.json'))).toBe(true);
    }
    expect(() => view.assertCurrent()).not.toThrow();
    if (kind === 'symlink') {
      fs.unlinkSync(path.join(parent, 'value'));
      fs.symlinkSync(path.join(parent, 'after.js'), path.join(parent, 'value'), 'file');
    } else if (kind === 'main' || kind === 'subpath') fs.writeFileSync(path.join(main, 'missing.js'), 'module.exports = 43;');
    else if (kind === 'relative' || kind === 'index') {
      fs.writeFileSync(path.join(parent, kind === 'relative' ? 'value.js' : 'value/index.js'), 'module.exports = 43;');
    } else declare(path.join(parent, 'node_modules/probe-package'), kind !== 'package-less');
    expect(() => view.assertCurrent()).toThrow();
  } finally {
    stop(); registration.mockRestore();
    view.dispose(); fs.rmSync(root, { recursive: true, force: true });
  }
});
