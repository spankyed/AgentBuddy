import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { compilerWatchMatches, compilerWatchPaths, compilerWatchTargets, mergeCompilerWatchPaths } from '../../src/build/compiler-watch.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-watch-'));
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
  return { root, pack, configure };
}

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

it('collects absent resolution candidates and observes their first existing parent', () => {
  const { root, pack, configure } = fixture();
  configure('future/contract.d.ts');
  const inputs = compilerWatchPaths(pack);
  expect([...inputs.paths.keys()].some(file => file.startsWith(path.join(root, 'future')))).toBe(true);
  const targets = compilerWatchTargets(inputs.paths);
  expect(compilerWatchMatches(targets.get(root)!.paths, path.join(root, 'future'), 'rename')).toBe(true);
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
  expect(compilerWatchMatches(inputs, '/shared/contract.d.ts', 'change')).toBe(true);
  expect(compilerWatchMatches(inputs, '/shared', 'rename')).toBe(true);
  expect(compilerWatchMatches(inputs, '/shared', 'change')).toBe(false);
  expect(compilerWatchMatches(inputs, '/shared/types/new-package', 'rename')).toBe(true);
  expect(compilerWatchMatches(inputs, '/shared/types/unrelated/nested', 'change')).toBe(false);
  expect(compilerWatchMatches(inputs, '/shared/unrelated', 'change')).toBe(false);
});

it('watches the parent of an existing anchor and tolerates missing ancestors beneath a file', () => {
  const { root } = fixture();
  const file = path.join(root, 'contract.d.ts/future/contract.d.ts');
  const targets = compilerWatchTargets(new Map([[file, 'file']]));
  expect(compilerWatchMatches(targets.get(root)!.paths, path.join(root, 'contract.d.ts'), 'rename')).toBe(true);
  expect(compilerWatchMatches(targets.get(path.dirname(root))!.paths, root, 'rename')).toBe(true);
});

it('keeps stronger subscriptions when a failed traversal only probes a previous input as a directory', () => {
  const merged = mergeCompilerWatchPaths(new Map([['/shared/types', 'entries'], ['/shared/config.json', 'file']]),
    new Map([['/shared/types', 'directory'], ['/shared/config.json', 'directory']]));
  expect(compilerWatchMatches(merged, '/shared/types/new-package', 'rename')).toBe(true);
  expect(compilerWatchMatches(merged, '/shared/config.json', 'change')).toBe(true);
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
