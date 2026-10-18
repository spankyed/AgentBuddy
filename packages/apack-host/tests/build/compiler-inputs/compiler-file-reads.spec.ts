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

it.each(['configured', 'on-demand', 'stopped'])('observes loader registration lazily and restores it on stop (%s)', mode => {
  const loader = 'file:///compiler/bin/compiler-startup-loader.mjs';
  const register = vi.spyOn(module, 'register').mockImplementation(() => {});
  vi.stubEnv('NODE_OPTIONS', mode === 'configured' ? `--experimental-loader ${loader}` : '');
  const stop = beginCompilerStartupReads({ asyncLoader: loader, compilation: {
    isInput: () => false, readDataPath: file => file, sourcePath: file => file,
    requireParent: file => file, diagnostic: value => value,
    readMetadata: () => undefined, readDirectory: () => [],
    openDirectory: () => { throw new Error('Unexpected directory read'); },
  } });
  try {
    expect(register).not.toHaveBeenCalled();
    const cached = module.register;
    if (mode === 'stopped') stop();
    cached('first-loader', { data: { value: 42 } });
    cached('second-loader');
    expect(register.mock.calls).toEqual([
      ...(mode === 'on-demand' ? [[loader]] : []), ['first-loader', { data: { value: 42 } }], ['second-loader'],
    ]);
    stop();
    expect(module.register).toBe(register);
    module.register('after-startup');
    expect(register.mock.calls.at(-1)).toEqual(['after-startup']);
  } finally {
    stop(); register.mockRestore(); module.syncBuiltinESMExports(); vi.unstubAllEnvs();
  }
});

it.each(['selected', 'missing', 'package-less', 'relative', 'index', 'main', 'subpath', 'symlink', 'resolve-paths', 'resolve-relative', 'module-paths', 'literal-colon'])('observes %s native resolution inputs', kind => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-module-probes-')));
  const parent = path.join(root, 'sub');
  fs.mkdirSync(parent);
  const declare = (directory: string, metadata = true) => {
    fs.mkdirSync(directory, { recursive: true });
    if (metadata) fs.writeFileSync(path.join(directory, 'package.json'), '{"main":"index.js"}');
    fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = 42;');
  };
  if (kind === 'selected' || kind === 'package-less') declare(path.join(root, 'node_modules/probe-package'), kind !== 'package-less');
  const custom = path.join(root, 'custom');
  const colonRequest = process.platform === 'win32' ? path.parse(root).root.slice(0, 2) + 'probe-package' : 'literal:probe-package';
  const colonPackage = process.platform === 'win32' ? 'probe-package' : colonRequest;
  if (kind === 'literal-colon') declare(path.join(root, 'node_modules', colonPackage));
  if (kind === 'resolve-paths' || kind === 'module-paths') declare(path.join(root, 'node_modules/probe-package'));
  if (kind === 'resolve-relative') declare(path.join(custom, 'value'));
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
    if (kind === 'literal-colon') {
      expect(require.resolve(colonRequest, { paths: [custom] })).toBe(path.join(root, 'node_modules', colonPackage, 'index.js'));
    } else if (kind === 'resolve-paths') {
      expect(require.resolve('probe-package', { paths: [custom] })).toBe(path.join(root, 'node_modules/probe-package/index.js'));
    } else if (kind === 'resolve-relative') {
      expect(require.resolve('./value', { paths: [custom] })).toBe(path.join(custom, 'value/index.js'));
    } else if (kind === 'module-paths') {
      const owner = new module.Module(path.join(parent, 'entry.cjs'));
      owner.filename = owner.id;
      owner.paths = [path.join(custom, 'node_modules'), path.join(root, 'node_modules')];
      expect(owner.require('probe-package')).toBe(42);
    } else if (['selected', 'package-less', 'main', 'subpath', 'symlink'].includes(kind)) expect(resolve()).toBe(42);
    else expect(resolve).toThrow('Cannot find module');
    stop();
    expect(release).toHaveBeenCalledTimes(1);
    if (kind === 'selected' || kind === 'missing') {
      expect(observed.has(path.join(parent, 'node_modules/probe-package/package.json'))).toBe(true);
    }
    expect(() => view.assertCurrent()).not.toThrow();
    if (kind === 'literal-colon') declare(path.join(custom, 'node_modules', colonPackage));
    else if (kind === 'resolve-paths' || kind === 'module-paths') declare(path.join(custom, 'node_modules/probe-package'));
    else if (kind === 'resolve-relative') fs.writeFileSync(path.join(custom, 'value.js'), 'module.exports = 43;');
    else if (kind === 'symlink') {
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

it.each(['exports', 'exports-pattern', 'imports-file', 'imports-pattern', 'imports-package', 'self'] as const)('observes missing %s mapping targets without choosing them', kind => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-module-mapping-')));
  const parent = path.join(root, 'sub');
  fs.mkdirSync(parent);
  const packageRoot = path.join(root, 'node_modules/probe-package');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: 'probe-package', exports: kind === 'exports' ? { require: './missing.cjs', default: './index.cjs' }
      : kind === 'exports-pattern' ? { './*': './*.cjs' } : './index.cjs',
  }));
  fs.writeFileSync(path.join(packageRoot, 'index.cjs'), 'module.exports = 42;');
  fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({
    name: 'self-probe', exports: './missing.cjs',
    imports: { [kind === 'imports-pattern' ? '#value/*' : '#value']:
      kind === 'imports-pattern' ? './*.cjs' : kind === 'imports-file' ? './missing.cjs' : 'probe-package' },
  }));
  const view = createCompilerFileView(root);
  const resolveFilename = Reflect.get(module, '_resolveFilename');
  const findPath = Reflect.get(module, '_findPath');
  const stop = beginCompilerStartupReads({ compilation: {
    isInput: file => file.startsWith(root + path.sep),
    readDataPath(file) { view.readDataBytes(file); return file; },
    readMetadata: view.readMetadata, readDirectory: view.readDirectoryData, openDirectory: view.openDirectoryData,
    sourcePath: file => file, requireParent: file => file, diagnostic: message => message,
  } });
  try {
    const require = createRequire(path.join(parent, 'entry.cjs'));
    const request = kind === 'exports' ? 'probe-package' : kind === 'exports-pattern' ? 'probe-package/missing'
      : kind === 'imports-pattern' ? '#value/missing' : kind === 'self' ? 'self-probe' : '#value';
    if (kind === 'imports-package') expect(require.resolve(request)).toBe(path.join(packageRoot, 'index.cjs'));
    else expect(() => require.resolve(request)).toThrow('Cannot find module');
    stop();
    expect(Reflect.get(module, '_resolveFilename')).toBe(resolveFilename);
    expect(Reflect.get(module, '_findPath')).toBe(findPath);
    expect(() => view.assertCurrent()).not.toThrow();
    if (kind === 'imports-package') {
      const nearer = path.join(parent, 'node_modules/probe-package');
      fs.mkdirSync(nearer, { recursive: true });
      fs.writeFileSync(path.join(nearer, 'package.json'), '{"exports":"./index.cjs"}');
      fs.writeFileSync(path.join(nearer, 'index.cjs'), 'module.exports = 43;');
    } else fs.writeFileSync(path.join(kind.startsWith('exports') ? packageRoot : parent, 'missing.cjs'), 'module.exports = 43;');
    expect(() => view.assertCurrent()).toThrow();
    fs.rmSync(kind === 'imports-package' ? path.join(parent, 'node_modules')
      : path.join(kind.startsWith('exports') ? packageRoot : parent, 'missing.cjs'), { recursive: true });
    expect(() => view.assertCurrent()).not.toThrow();
  } finally { stop(); view.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});
