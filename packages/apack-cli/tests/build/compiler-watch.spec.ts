import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompilerWatchMatcher, createCompilerWatchTools, compilerWatchPaths, compilerWatchTargets, mergeCompilerWatchPaths, additionalCompilerObservations } from '../../src/build/compiler-watch.ts';
import { assertNativeCompilerObservations, createCompilerFileView } from '@apackdev/host/build/compiler-inputs';
import * as installation from '../../src/build/compiler-installation.ts';
import * as runtime from '../../src/build/compiler-runtime.ts';
import { startPackBuildWatcher } from '../../src/build/watch.ts';
import * as reload from '../../src/build/dev-reload.ts';
import { assertCompilerTestRunner } from '../_support/compiler-test-runner.ts';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
function fixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-watch-')));
  roots.push(root);
  const pack = path.join(root, 'pack');
  fs.mkdirSync(path.join(pack, 'src'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'src/index.ts'), "export type { Contract } from 'outside';");
  fs.writeFileSync(path.join(pack, 'tsconfig.json'), JSON.stringify({ extends: '../base.json' }));
  const configure = (target = 'contract.d.ts') => fs.writeFileSync(path.join(root, 'base.json'), JSON.stringify({
    compilerOptions: { noLib: true, types: [], baseUrl: '.', paths: { outside: [target] },
      module: 'ESNext', moduleResolution: 'Bundler' },
  }));
  configure();
  fs.writeFileSync(path.join(root, 'contract.d.ts'), 'export type Contract = string;');
  const physicalRoot = fs.realpathSync(root);
  const compiler = path.join(physicalRoot, 'compiler');
  fs.mkdirSync(compiler);
  fs.writeFileSync(path.join(compiler, 'package.json'), '{"name":"fixture-compiler"}');
  const entry = path.join(compiler, 'index.js');
  fs.writeFileSync(entry, 'first compiler');
  const executable = path.join(physicalRoot, 'runtime');
  fs.writeFileSync(executable, 'first runtime', { mode: 0o755 });
  const override = path.join(physicalRoot, 'esbuild');
  vi.spyOn(installation, 'compilerPackageDirectory').mockReturnValue(compiler);
  const readRuntime = runtime.readCompilerRuntimeInputs;
  vi.spyOn(runtime, 'readCompilerRuntimeInputs').mockImplementation((_executable, _electron, onFile) =>
    readRuntime(executable, false, onFile));
  vi.stubEnv('ESBUILD_BINARY_PATH', path.relative(pack, override));
  return { root, pack, configure, compiler, entry, executable, override };
}

it('subscribes to compiler/runtime inputs and a missing esbuild override without authored edits', () => {
  const { pack, entry, executable, override } = fixture();
  const first = compilerWatchPaths(pack);
  expect(first.complete).toBe(true);
  for (const file of [entry, executable, override]) expect(first.paths.get(file)).toBe('file');
  fs.writeFileSync(entry, 'second compiler');
  const compilerChanged = compilerWatchPaths(pack);
  expect(compilerChanged.signature).not.toBe(first.signature);
  fs.writeFileSync(executable, 'second runtime');
  const runtimeChanged = compilerWatchPaths(pack);
  expect(runtimeChanged.signature).not.toBe(compilerChanged.signature);
  fs.writeFileSync(override, 'external esbuild');
  expect(compilerWatchPaths(pack).signature).not.toBe(runtimeChanged.signature);
});

it('retains tooling subscriptions when pack configuration is broken', () => {
  const { pack, root, entry, executable, override } = fixture();
  fs.writeFileSync(path.join(root, 'base.json'), '{broken');
  const broken = compilerWatchPaths(pack);
  expect(broken.complete).toBe(false);
  for (const file of [entry, executable, override]) expect(broken.paths.get(file)).toBe('file');
  fs.writeFileSync(executable, 'repaired runtime');
  expect(compilerWatchPaths(pack).signature).not.toBe(broken.signature);
});

it('keeps runtime probes distinct from the static fingerprint across refreshes', () => {
  const { root, pack } = fixture();
  const outside = path.join(root, 'runtime.txt');
  fs.writeFileSync(outside, 'FIRST');
  const probes = new Map([[outside, 'file']] as const);
  const first = compilerWatchPaths(pack, undefined, probes);
  expect(first.paths.get(outside)).toBe('file');
  expect(first.staticPaths.has(outside)).toBe(false);
  fs.writeFileSync(outside, 'SECOND');
  expect(compilerWatchPaths(pack, undefined, probes).staticPaths.has(outside)).toBe(false);
});

it('replays worker bytes and native metadata while leaving ordinary static bytes to their fingerprint', () => {
  const { root, pack } = fixture();
  const worker = path.join(root, 'worker.txt');
  const shared = path.join(root, 'shared.txt');
  fs.writeFileSync(worker, 'FIRST');
  fs.writeFileSync(shared, 'SHARED');
  const view = createCompilerFileView(pack);
  try {
    view.readDataBytes(worker);
    view.readDataBytes(shared);
    Reflect.get(view.readMetadata('stat', shared, []) as object, 'mtimeMs');
    const observed = additionalCompilerObservations(view.observations(),
      new Map([[worker, 'file'], [shared, 'file']]), new Map([[shared, 'file']]));
    assertNativeCompilerObservations(observed);
    fs.writeFileSync(worker, 'SECOND');
    expect(() => assertNativeCompilerObservations(observed)).toThrow(/changed/);
    fs.writeFileSync(worker, 'FIRST');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(shared, future, future);
    expect(() => assertNativeCompilerObservations(observed)).toThrow(/changed/);
  } finally { view.dispose(); }
});

it('rebuilds an idle session on actual tooling filesystem events', async () => {
  assertCompilerTestRunner();
  const { pack, entry, executable, override } = fixture();
  fs.writeFileSync(path.join(pack, 'apack.json'), JSON.stringify({ id: 'watch-tooling', name: 'Watch tooling', version: '1.0.0' }));
  vi.spyOn(reload, 'reloadPack').mockResolvedValue({ status: 'not-running', detail: 'fixture has no app' });
  let builds = 0;
  const watcher = await startPackBuildWatcher(pack, { builder: {
    build: async () => { builds++; }, subscribeFrontendInputs: () => () => {}, isFrontendCurrent: async () => true,
  } });
  try {
    expect(builds).toBe(1);
    for (const [index, file] of [entry, executable, override].entries()) {
      fs.writeFileSync(file, `changed tooling ${index}`);
      await vi.waitFor(() => expect(builds).toBe(index + 2), { timeout: 2_000 });
    }
  } finally { await watcher.close(); }
});

it('collects inherited configuration and resolved outside files, excluding the authored tree', () => {
  const { root, pack } = fixture();
  const before = compilerWatchPaths(pack);
  expect(before.complete).toBe(true);
  expect(before.paths.get(path.join(root, 'base.json'))).toBe('file');
  expect(before.paths.get(path.join(root, 'contract.d.ts'))).toBe('file');
  expect(before.paths.has(path.join(pack, 'src/index.ts'))).toBe(false);
  fs.writeFileSync(path.join(root, 'contract.d.ts'), 'export type Contract = number;');
  expect(compilerWatchPaths(pack).signature).not.toBe(before.signature);
});

it('keeps authored files out of external subscriptions when the pack root is a link', () => {
  const { root, pack } = fixture();
  const alias = path.join(root, 'linked-pack');
  fs.symlinkSync(pack, alias, 'dir');
  const direct = compilerWatchPaths(pack), linked = compilerWatchPaths(alias);
  expect(linked.complete).toBe(true);
  expect(linked.signature).not.toBe(direct.signature);
  expect(linked.paths.has(path.join(pack, 'src/index.ts'))).toBe(false);
  expect(linked.paths.has(path.join(alias, 'src/index.ts'))).toBe(false);
  expect(linked.paths.get(path.join(root, 'contract.d.ts'))).toBe('file');
});

it('collects absent resolution candidates and observes their first existing parent', () => {
  const { root, pack, configure } = fixture();
  configure('future/contract.d.ts');
  const inputs = compilerWatchPaths(pack);
  expect([...inputs.paths.keys()].some(file => file.startsWith(path.join(root, 'future')))).toBe(true);
  const targets = compilerWatchTargets(inputs.paths);
  expect(createCompilerWatchMatcher(targets.get(root)!.paths)(path.join(root, 'future'), 'rename')).toBe(true);
  fs.mkdirSync(path.join(root, 'future'));
  fs.writeFileSync(path.join(root, 'future/contract.d.ts'), 'export type Contract = string;');
  expect(compilerWatchPaths(pack).signature).not.toBe(inputs.signature);
});

it('retains partial configuration probes and changes its failure signature on an external repair', () => {
  const { root, pack } = fixture();
  fs.writeFileSync(path.join(root, 'base.json'), '{broken');
  const broken = compilerWatchPaths(pack);
  expect(broken.complete).toBe(false);
  expect(broken.paths.has(path.join(root, 'base.json'))).toBe(true);
  expect(compilerWatchPaths(pack).signature).toBe(broken.signature);
  fs.writeFileSync(path.join(root, 'base.json'), '{different error');
  expect(compilerWatchPaths(pack).signature).not.toBe(broken.signature);
});

it('distinguishes file bytes, directory replacement and type-directory membership from unrelated events', () => {
  const inputs = new Map([
    ['/shared/contract.d.ts', 'file'], ['/shared/types', 'entries'], ['/shared', 'directory'],
  ] as const);
  const matches = createCompilerWatchMatcher(inputs);
  expect(matches('/shared/contract.d.ts', 'change')).toBe(true);
  expect(matches('/shared', 'rename')).toBe(true);
  expect(matches('/shared', 'change')).toBe(false);
  expect(matches('/shared/types/new-package', 'rename')).toBe(true);
  expect(matches('/shared/types/unrelated/nested', 'change')).toBe(false);
  expect(matches('/shared/types/unrelated/nested', 'rename')).toBe(false);
  expect(matches('/shared/unrelated', 'change')).toBe(false);
  expect(matches('/shared/unrelated', 'rename')).toBe(false);
  expect(matches('/share', 'rename')).toBe(false);
});

it('watches the parent of an existing anchor and tolerates missing ancestors beneath a file', () => {
  const { root } = fixture();
  const file = path.join(root, 'contract.d.ts/future/contract.d.ts');
  const targets = compilerWatchTargets(new Map([[file, 'file']]));
  expect(createCompilerWatchMatcher(targets.get(root)!.paths)(path.join(root, 'contract.d.ts'), 'rename')).toBe(true);
  expect(createCompilerWatchMatcher(targets.get(path.dirname(root))!.paths)(root, 'rename')).toBe(true);
});

it('keeps stronger subscriptions when a failed traversal only probes a previous input as a directory', () => {
  const merged = mergeCompilerWatchPaths(new Map([['/shared/types', 'entries'], ['/shared/config.json', 'file']]),
    new Map([['/shared/types', 'directory'], ['/shared/config.json', 'directory']]));
  expect(createCompilerWatchMatcher(merged)('/shared/types/new-package', 'rename')).toBe(true);
  expect(createCompilerWatchMatcher(merged)('/shared/config.json', 'change')).toBe(true);
});

it('tracks physical targets behind dangling directory links so creation can recover resolution', () => {
  const { root, pack, configure } = fixture();
  const missing = path.join(root, 'future');
  fs.symlinkSync(missing, path.join(root, 'bridge'), 'dir');
  configure('bridge/contract.d.ts');
  const inputs = compilerWatchPaths(pack);
  const physical = path.join(fs.realpathSync(root), 'future');
  expect([...inputs.paths.keys()].some(file => file.startsWith(physical))).toBe(true);
  fs.mkdirSync(missing);
  fs.writeFileSync(path.join(missing, 'contract.d.ts'), 'export type Contract = string;');
  expect(compilerWatchPaths(pack).signature).not.toBe(inputs.signature);
});

it('shares package scopes on native recursive platforms and uses selected leaf directories on Linux', () => {
  const { root, pack } = fixture();
  const library = path.join(root, 'node_modules/library');
  fs.mkdirSync(path.join(library, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(library, 'package.json'), '{}');
  const inputs = new Map([
    [path.join(library, 'package.json'), 'file'], [path.join(library, 'nested/types.d.ts'), 'file'],
    [path.join(pack, 'src/node_modules/missing/types.d.ts'), 'file'],
  ] as const);
  const native = compilerWatchTargets(inputs, pack, 'darwin');
  expect([...native.values()].filter(target => target.recursive)).toHaveLength(1);
  expect(native.get(path.join(root, 'node_modules'))?.paths.has(path.join(library, 'nested/types.d.ts'))).toBe(true);
  const linux = compilerWatchTargets(inputs, pack, 'linux');
  expect([...linux.values()].every(target => !target.recursive)).toBe(true);
  expect(linux.get(path.join(library, 'nested'))?.paths.has(path.join(library, 'nested/types.d.ts'))).toBe(true);
  expect(linux.has(path.join(pack, 'src'))).toBe(false);
});

it('watches package runtime bytes, directory membership and missing transitive dependencies behind unchanged types', () => {
  const { root, pack } = fixture();
  const library = path.join(fs.realpathSync(root), 'node_modules/library');
  fs.mkdirSync(library, { recursive: true });
  fs.writeFileSync(path.join(pack, 'src/index.ts'), "import { value } from 'library'; export { value };");
  fs.writeFileSync(path.join(library, 'package.json'), JSON.stringify({ name: 'library', types: 'index.d.ts', optionalDependencies: { helper: '*' } }));
  fs.writeFileSync(path.join(library, 'index.d.ts'), 'export declare const value: string;');
  const runtime = path.join(library, 'runtime.js');
  fs.writeFileSync(runtime, 'before');
  const before = compilerWatchPaths(pack);
  expect(before.complete).toBe(true);
  expect(createCompilerWatchMatcher(before.paths)(runtime, 'change')).toBe(true);
  expect(createCompilerWatchMatcher(before.paths)(path.join(library, 'new-file.js'), 'rename')).toBe(true);
  fs.writeFileSync(runtime, 'after');
  expect(compilerWatchPaths(pack).signature).not.toBe(before.signature);
  fs.writeFileSync(runtime, 'before');
  expect(compilerWatchPaths(pack).signature).toBe(before.signature);
  const helper = path.join(fs.realpathSync(root), 'node_modules/helper');
  expect(createCompilerWatchMatcher(before.paths)(helper, 'rename')).toBe(true);
  fs.mkdirSync(helper);
  fs.writeFileSync(path.join(helper, 'package.json'), '{"name":"helper"}');
  fs.writeFileSync(path.join(helper, 'index.js'), 'helper');
  expect(compilerWatchPaths(pack).signature).not.toBe(before.signature);
});

it('reuses tooling discovery for pack edits, but refreshes on tooling events and environment changes', () => {
  const { pack, entry } = fixture();
  const tools = createCompilerWatchTools(pack);
  const read = vi.mocked(runtime.readCompilerRuntimeInputs);
  const first = compilerWatchPaths(pack, tools);
  const source = path.join(pack, 'src/index.ts');
  fs.writeFileSync(source, 'export type Contract = boolean;');
  tools.changed(source, 'change');
  const authored = compilerWatchPaths(pack, tools);
  expect(authored.signature).not.toBe(first.signature);
  expect(read).toHaveBeenCalledTimes(1);
  fs.writeFileSync(entry, 'updated compiler');
  tools.changed(entry, 'change');
  const second = compilerWatchPaths(pack, tools);
  expect(second.signature).not.toBe(authored.signature);
  expect(read).toHaveBeenCalledTimes(2);
  vi.stubEnv('APACK_TEST_COMPILER_ENV', 'changed');
  expect(compilerWatchPaths(pack, tools).signature).not.toBe(second.signature);
  expect(read).toHaveBeenCalledTimes(3);
  tools.changed(undefined, 'rename');
  compilerWatchPaths(pack, tools);
  expect(read).toHaveBeenCalledTimes(4);
  const beforeMember = compilerWatchPaths(pack, tools).signature;
  fs.writeFileSync(path.join(path.dirname(entry), 'new.js'), 'new compiler member');
  tools.changed(path.dirname(entry), 'rename');
  expect(compilerWatchPaths(pack, tools).signature).not.toBe(beforeMember);
  expect(read).toHaveBeenCalledTimes(5);
});

it.runIf(process.platform === 'win32')('keeps authored watch subscriptions covered for extended Windows paths', () => {
  const { pack } = fixture();
  const file = path.toNamespacedPath(path.join(pack, 'src/index.ts'));
  const observed = new Map([[file, 'file' as const]]);
  const inputs = compilerWatchPaths(pack, undefined, observed);
  expect(inputs.complete).toBe(true);
  expect(inputs.paths.has(file)).toBe(false);
  expect(compilerWatchTargets(observed, pack).size).toBe(0);
});
