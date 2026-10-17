import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, fork } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { captureCompilerInstallation, type CompilerInstallation } from '../../src/build/compiler-installation.ts';
import { cliBin } from '../../src/utils.ts';
import { _byDeadline } from '@apackdev/sdk/testing/waiting';

const roots: string[] = [];
const installations: CompilerInstallation[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(installations.splice(0).map(installation => installation.dispose()));
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-fixture-'));
  roots.push(root);
  const write = (file: string, contents: string) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  write('package.json', JSON.stringify({ name: 'compiler', type: 'module', dependencies: { helper: '*' } }));
  write('bin/apack.mjs', 'import helper from "helper"; console.log(helper);');
  write('node_modules/helper/package.json', JSON.stringify({ name: 'helper', main: 'index.cjs', dependencies: { nested: '*' } }));
  write('node_modules/helper/index.cjs', 'module.exports = require("nested");');
  write('node_modules/helper/node_modules/nested/package.json', JSON.stringify({ name: 'nested', main: 'index.cjs' }));
  write('node_modules/helper/node_modules/nested/index.cjs', 'module.exports = "captured";');
  return { root, write, async capture() {
    const installation = await captureCompilerInstallation(root);
    installations.push(installation);
    return installation;
  } };
}

function esbuildFixture() {
  const compiler = fixture();
  const require = createRequire(import.meta.url);
  const dependency = path.dirname(require.resolve('esbuild/package.json'));
  const executable = createRequire(path.join(dependency, 'package.json')).resolve(`@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-external-esbuild-'));
  roots.push(outside);
  const file = path.join(outside, path.basename(executable));
  const bytes = fs.readFileSync(executable);
  compiler.write('package.json', JSON.stringify({ type: 'module', dependencies: { esbuild: '*' } }));
  fs.symlinkSync(dependency, path.join(compiler.root, 'node_modules/esbuild'), 'dir');
  compiler.write('bin/apack.mjs', `import {transformSync} from 'esbuild'; console.log(transformSync('let value = 1', {minify:true}).code.trim());`);
  const options = { cwd: compiler.root, env: { ESBUILD_BINARY_PATH: path.relative(compiler.root, file) } };
  const run = (installation: CompilerInstallation) => execFileSync(process.execPath, [installation.bin], {
    cwd: compiler.root, encoding: 'utf8', timeout: 2_000, env: { ...process.env, ...installation.environment },
  }).trim();
  const capture = async () => {
    const installation = await captureCompilerInstallation(compiler.root, options);
    installations.push(installation);
    return installation;
  };
  return { ...compiler, options, file, bytes, capture, run };
}

it('owns a relative external esbuild executable and detects changed selection, bytes and copy damage', async () => {
  const compiler = esbuildFixture();
  fs.writeFileSync(compiler.file, compiler.bytes, { mode: 0o755 });
  const first = await compiler.capture();
  const same = await compiler.capture();
  expect(first.hash).toBe(same.hash);
  expect(first.isCurrent(compiler.root, compiler.options)).toBe(true);
  expect(compiler.run(first)).toBe('let value=1;');
  fs.writeFileSync(compiler.file, 'CHANGED');
  expect(first.isCurrent(compiler.root, compiler.options)).toBe(false);
  const changed = await compiler.capture();
  expect(changed.hash).not.toBe(first.hash);
  expect(compiler.run(first)).toBe('let value=1;');
  fs.rmSync(compiler.file);
  expect(compiler.run(first)).toBe('let value=1;');
  fs.writeFileSync(compiler.file, compiler.bytes, { mode: 0o755 });
  expect(first.isCurrent(compiler.root, { ...compiler.options, env: {} })).toBe(false);
  expect(first.isCurrent(compiler.root, compiler.options)).toBe(true);
  const captured = first.environment.ESBUILD_BINARY_PATH!;
  fs.chmodSync(captured, 0o755);
  fs.writeFileSync(captured, 'DAMAGED');
  expect(first.isCurrent(compiler.root, compiler.options)).toBe(false);
  fs.chmodSync(path.dirname(captured), 0o755);
  fs.rmSync(captured);
  fs.symlinkSync(compiler.file, captured, 'file');
  expect(first.isCurrent(compiler.root, compiler.options)).toBe(false);
});

it('keeps the package-native fallback when a missing external override appears after capture', async () => {
  const compiler = esbuildFixture();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const installation = await compiler.capture();
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('Ignoring bad configuration: ESBUILD_BINARY_PATH='));
  expect(installation.isCurrent(compiler.root, compiler.options)).toBe(true);
  fs.writeFileSync(compiler.file, 'LATE INVALID EXECUTABLE', { mode: 0o755 });
  expect(compiler.run(installation)).toBe('let value=1;');
  expect(installation.isCurrent(compiler.root, compiler.options)).toBe(false);
});

it('executes captured nested dependencies after their original files are removed', async () => {
  const compiler = fixture();
  const installation = await compiler.capture();
  compiler.write('node_modules/helper/node_modules/nested/index.cjs', 'throw new Error("live compiler escaped");');
  fs.rmSync(compiler.root, { recursive: true, force: true });
  expect(execFileSync(process.execPath, [installation.bin], { encoding: 'utf8' }).trim()).toBe('captured');
  await installation.dispose();
  expect(fs.existsSync(installation.bin)).toBe(false);
});

it.each(['executable', 'addon'] as const)('executes a captured platform %s after its source package is removed', async kind => {
  const require = createRequire(import.meta.url);
  const compiler = fixture();
  let source: string;
  let expected: string;
  let file: string;
  if (kind === 'executable') {
    const esbuild = createRequire(require.resolve('esbuild/package.json'));
    source = esbuild.resolve(`@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`);
    expected = require('esbuild/package.json').version;
    file = process.platform === 'win32' ? 'native.exe' : 'native';
    compiler.write('node_modules/helper/index.cjs', `module.exports = require('node:child_process').execFileSync(require('node:path').join(__dirname, '${file}'), ['--version'], {encoding: 'utf8'}).trim();`);
  } else {
    require('rollup/parseAst');
    const addon = Object.keys(require.cache).find(file => file.endsWith('.node') && path.basename(file).startsWith('rollup.'));
    if (!addon) throw new Error('Rollup did not load its platform addon');
    source = addon;
    expected = 'function';
    file = 'native.node';
    compiler.write('node_modules/helper/index.cjs', `module.exports = typeof require('./native.node').parse;`);
  }
  fs.copyFileSync(source, path.join(compiler.root, 'node_modules/helper', file));
  const installation = await compiler.capture();
  fs.rmSync(compiler.root, { recursive: true, force: true });
  expect(execFileSync(process.execPath, [installation.bin], { encoding: 'utf8' }).trim()).toBe(expected);
});

it('preserves workspace links, file-link module resolution, cycles and executable permissions', async () => {
  const compiler = fixture();
  compiler.write('workspace/package.json', JSON.stringify({ name: 'helper', main: 'entry.cjs', dependencies: { compiler: '*' } }));
  compiler.write('workspace/actual/index.cjs', 'module.exports = require("./value.cjs");');
  compiler.write('workspace/actual/value.cjs', 'module.exports = "linked";');
  fs.symlinkSync('actual/index.cjs', path.join(compiler.root, 'workspace/entry.cjs'));
  fs.rmSync(path.join(compiler.root, 'node_modules/helper'), { recursive: true });
  fs.symlinkSync('../workspace', path.join(compiler.root, 'node_modules/helper'), 'dir');
  fs.symlinkSync(compiler.root, path.join(compiler.root, 'node_modules/compiler'), 'dir');
  fs.renameSync(path.join(compiler.root, 'package.json'), path.join(compiler.root, 'metadata.json'));
  fs.symlinkSync('metadata.json', path.join(compiler.root, 'package.json'));
  fs.chmodSync(path.join(compiler.root, 'workspace/actual/index.cjs'), 0o755);
  const installation = await compiler.capture();
  fs.rmSync(compiler.root, { recursive: true, force: true });
  expect(execFileSync(process.execPath, [installation.bin], { encoding: 'utf8' }).trim()).toBe('linked');
  const helper = fs.realpathSync(path.join(path.dirname(path.dirname(installation.bin)), 'node_modules/helper'));
  expect(fs.statSync(path.join(helper, 'entry.cjs')).mode & 0o111).toBe(0o111);
  expect(fs.statSync(path.join(helper, 'entry.cjs')).mode & 0o222).toBe(0);
});

it('keeps independent captures immutable and gives changed bytes a different identity', async () => {
  const compiler = fixture();
  const first = await compiler.capture();
  const second = await compiler.capture();
  expect(second.hash).toBe(first.hash);
  expect(second.bin).not.toBe(first.bin);
  compiler.write('node_modules/helper/node_modules/nested/index.cjs', 'module.exports = "new compiler";');
  const changed = await compiler.capture();
  expect(changed.hash).not.toBe(first.hash);
  expect(execFileSync(process.execPath, [first.bin], { encoding: 'utf8' }).trim()).toBe('captured');
  expect(execFileSync(process.execPath, [changed.bin], { encoding: 'utf8' }).trim()).toBe('new compiler');
});

it('preserves a dangling package link without reading outside the captured installation', async () => {
  const compiler = fixture();
  fs.symlinkSync('not-installed.cjs', path.join(compiler.root, 'node_modules/helper/optional.cjs'));
  const installation = await compiler.capture();
  const link = path.join(path.dirname(path.dirname(installation.bin)), 'node_modules/helper/optional.cjs');
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(fs.existsSync(link)).toBe(false);
});

it('captures dependencies resolved through NODE_PATH and executes without their live global directory', async () => {
  const compiler = fixture();
  const global = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-global-dependency-'));
  roots.push(global);
  fs.renameSync(path.join(compiler.root, 'node_modules/helper'), path.join(global, 'helper'));
  const script = `
    import fs from 'node:fs';
    import {execFileSync} from 'node:child_process';
    import {captureCompilerInstallation} from ${JSON.stringify(new URL('../../src/build/compiler-installation.ts', import.meta.url).href)};
    const captured = await captureCompilerInstallation(process.argv[1]);
    try {
      fs.rmSync(process.argv[2], {recursive: true, force: true});
      console.log(execFileSync(process.execPath, [captured.bin], {encoding: 'utf8', env: {...process.env, NODE_PATH: ''}}).trim());
    } finally { await captured.dispose(); }
  `;
  expect(execFileSync(process.execPath, ['--import', 'tsx', '--conditions=@apackdev/source', '--input-type=module', '-e', script, compiler.root, global], {
    encoding: 'utf8', env: { ...process.env, NODE_PATH: global },
  }).trim()).toBe('captured');
});

it('removes an incomplete private installation when capture fails', async () => {
  const compiler = fixture();
  const mkdtemp = fs.mkdtempSync;
  let temporary = '';
  vi.spyOn(fs, 'mkdtempSync').mockImplementation(prefix => {
    temporary = mkdtemp(prefix);
    return temporary;
  });
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('capture write failed'); });
  await expect(compiler.capture()).rejects.toThrow('capture write failed');
  expect(temporary).not.toBe('');
  expect(fs.existsSync(temporary)).toBe(false);
});

it('refuses captured bytes that differ from the captured package graph', async () => {
  const compiler = fixture();
  const write = fs.writeFileSync;
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, bytes, options) => {
    write(file, bytes, options);
    if (typeof file === 'string' && file.endsWith('/nested/index.cjs')) {
      fs.chmodSync(file, 0o644);
      write(file, 'module.exports = "corrupted copy";');
    }
  });
  await expect(compiler.capture()).rejects.toThrow('Captured compiler installation differs from its inputs');
});

it('keeps an owned worker in its captured compiler instead of handing off to the project CLI', async () => {
  const compiler = fixture();
  compiler.write('package.json', JSON.stringify({ name: '@apackdev/cli', type: 'module', dependencies: { tsx: '*' } }));
  compiler.write('bin/apack.mjs', fs.readFileSync(cliBin(), 'utf8'));
  compiler.write('dist/cli.js', 'throw new Error("Public dispatcher must not run");');
  compiler.write('dist/build-worker.js', 'process.send({ compiled: true }); process.disconnect();');
  compiler.write('node_modules/tsx/package.json', JSON.stringify({ name: 'tsx', type: 'module', exports: { './esm/api': './api.mjs' } }));
  compiler.write('node_modules/tsx/api.mjs', 'export function register() {}');
  compiler.write('project/package.json', '{"name":"pack"}');
  compiler.write('project/node_modules/@apackdev/cli/package.json', '{"name":"@apackdev/cli","type":"module"}');
  compiler.write('project/node_modules/@apackdev/cli/bin/apack.mjs', 'throw new Error("Escaped to the project compiler");');
  const installation = await compiler.capture();
  const child = fork(installation.bin, ['pack', 'build'], {
    cwd: path.join(compiler.root, 'project'), env: { ...process.env, APACK_BUILD_WORKER: '1' }, execArgv: [],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const messages: unknown[] = [];
  let errors = '';
  child.on('message', message => messages.push(message));
  child.stderr!.on('data', chunk => { errors += chunk; });
  const closed = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  try {
    expect(await _byDeadline(closed, 'captured compiler worker', 2_000), errors).toBe(0);
    expect(messages).toEqual([{ compiled: true }]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await _byDeadline(closed, 'captured compiler cleanup', 2_000);
  }
});
