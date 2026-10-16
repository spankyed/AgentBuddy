import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, fork, spawn, type ChildProcess } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { readPackBuild } from '@apackdev/host/packs';
import { withoutSourceCondition } from '@apackdev/host/build/source-resolution';
import { cliBin } from '../../src/utils.ts';
import { _byDeadline } from '@apackdev/sdk/testing/waiting';

vi.mock('../../src/build/be-bundler', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/build/be-bundler')>(),
  bundlePackRuntime: vi.fn(() => { throw new Error('Supervisor retained its old compiler'); }),
}));
import { bundlePackRuntime } from '../../src/build/be-bundler';
import { buildCommand } from '../../src/commands/build.ts';
import { runPackBuild } from '../../src/build/build-process.ts';
import type { BuildWatchInputs } from '../../src/build/build-watch-inputs.ts';
import { readStamps } from '../../src/build/phase-cache.ts';
import { ensureCheckoutPackages } from '../../src/build/checkout-packages.ts';
import { BUILD_INPUTS_DIRECTORY_ENV, removeCompilerReadTree } from '../../src/build/compiler-read-tree.ts';
import { COMPILER_PROCESS_GROUP_ENV } from '../../src/build/compiler-process-group.ts';
import { captureCompilerInstallation, COMPILER_INPUTS_ENV, type CompilerInstallation } from '../../src/build/compiler-installation.ts';

const roots: string[] = [];
const compilers: CompilerInstallation[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots) {
    const record = path.join(root, '.apack/compiler-child-pid');
    if (fs.existsSync(record)) {
      try { process.kill(Number(fs.readFileSync(record, 'utf8')), 'SIGKILL'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    }
  }
  await Promise.all(compilers.splice(0).map(compiler => compiler.dispose()));
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture(files: Record<string, string> = {}, content = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-worker-'));
  roots.push(root);
  packFixture({ at: root, nodeModules: path.join(REPO_ROOT, 'node_modules'),
    manifest: { id: 'fresh-worker', name: 'Fresh worker', features: {}, content }, files });
  return root;
}

it('uses the captured compiler and retains unchanged build/cache identity on repeat builds', async () => {
  const root = fixture({
    'src/compiler.cjs': `module.exports = () => [{entity: 'Relation', name: 'Paths', source: __filename, directory: __dirname}];`,
    'src/value.txt': 'OWNED',
  }, { formats: { rows: { compiler: 'src/compiler.cjs', entity: 'Relation', identity: ['name'] } },
    sources: { rows: { path: 'src/value.txt', format: 'rows' } } });
  const workspaces: string[] = [];
  const mkdtemp = fs.mkdtempSync;
  vi.spyOn(fs, 'mkdtempSync').mockImplementation(prefix => {
    const directory = mkdtemp(prefix);
    if (String(prefix).includes('apack-build-inputs-')) workspaces.push(directory);
    return directory;
  });
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await buildCommand(['--skip-fe']);
  expect(bundlePackRuntime).not.toHaveBeenCalled();
  expect(readPackBuild(path.join(root, 'dist')).snapshot.manifest.id).toBe('fresh-worker');
  expect(fs.existsSync(path.join(root, 'dist/runtime/fe.js'))).toBe(false);
  const content = JSON.parse(fs.readFileSync(path.join(root, 'dist/runtime/content/rows.content.json'), 'utf8'));
  expect(content.records[0].source).toBe(path.join(fs.realpathSync(root), 'src/compiler.cjs'));
  expect(content.records[0].directory).toBe(path.join(fs.realpathSync(root), 'src'));
  const stamp = readStamps(root).types;
  const revision = readPackBuild(path.join(root, 'dist')).revision;
  expect(stamp).toBeDefined();
  await buildCommand(['--skip-fe']);
  expect(readStamps(root).types).toEqual(stamp);
  expect(readPackBuild(path.join(root, 'dist')).revision).toBe(revision);
  expect(workspaces).toHaveLength(2);
  for (const workspace of workspaces) expect(fs.existsSync(workspace)).toBe(false);
});

it('compiles content through the captured worker without redirecting tool reads to the checkout', async () => {
  const root = fixture({
    'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', jsx: 'react', jsxFactory: 'h', skipLibCheck: true }, include: ['src/**/*'] }),
    'src/compiler.tsx': `import fs from 'node:fs'; const h = () => 'JSX';
      export default ({path}: {path: string}) => [{entity: 'Relation', name: fs.readFileSync(path, 'utf8') + ':' + <marker />, source: import.meta.filename, origin: import.meta.url}];`,
    'src/value.txt': 'OWNED',
  }, { formats: { rows: { compiler: 'src/compiler.tsx', entity: 'Relation', identity: ['name'] } },
    sources: { rows: { path: 'src/value.txt', format: 'rows' } } });
  await runPackBuild(root, { args: ['--skip-fe'] });
  const output = JSON.parse(fs.readFileSync(path.join(root, 'dist/runtime/content/rows.content.json'), 'utf8'));
  expect(output.records[0].name).toBe('OWNED:JSX');
  expect(output.records[0].source).toBe(path.join(fs.realpathSync(root), 'src/compiler.tsx'));
  expect(output.records[0].origin).toBe(pathToFileURL(path.join(fs.realpathSync(root), 'src/compiler.tsx')).href + '?tsx-namespace=apack-build-1');
});

it('terminates pack-created background work before accepting its candidate', async () => {
  const root = fixture({
    'src/compiler.ts': `import fs from 'node:fs'; import {spawn} from 'node:child_process';
      if (process.platform !== 'win32') {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
        fs.writeFileSync('.apack/compiler-child-pid', String(child.pid));
        child.unref();
      }
      setInterval(() => {}, 1000);
      export default () => [{entity: 'Relation', name: 'COMPLETE'}];`,
    'src/value.txt': 'DATA',
  }, { formats: { rows: { compiler: 'src/compiler.ts', entity: 'Relation', identity: ['name'] } },
    sources: { rows: { path: 'src/value.txt', format: 'rows' } } });
  await runPackBuild(root, { args: ['--skip-fe'] });
  const output = JSON.parse(fs.readFileSync(path.join(root, 'dist/runtime/content/rows.content.json'), 'utf8'));
  expect(output.records[0].name).toBe('COMPLETE');
  if (process.platform !== 'win32') {
    const pid = Number(fs.readFileSync(path.join(root, '.apack/compiler-child-pid'), 'utf8'));
    let state = '';
    try { state = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim(); }
    catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
    expect(state === '' || state.startsWith('Z'), `Compiler subprocess ${pid} is still ${state}`).toBe(true);
  }
});

it('refuses candidate output changed by a compiler exit handler and retains the incumbent', async () => {
  const root = fixture({
    'src/compiler.ts': `import fs from 'node:fs';
      process.on('exit', () => {
        fs.writeFileSync('.apack/exit-state', fs.existsSync('.apack/build/integrity.json') ? 'SEALED' : 'UNSEALED');
        fs.writeFileSync('.apack/build/runtime/content/rows.content.json', 'LATE EXIT WRITE');
      });
      export default () => [{entity: 'Relation', name: 'COMPLETE'}];`,
    'src/value.txt': 'DATA',
  }, { formats: { rows: { compiler: 'src/compiler.ts', entity: 'Relation', identity: ['name'] } },
    sources: { rows: { path: 'src/value.txt', format: 'rows' } } });
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/incumbent.txt'), 'ACCEPTED');
  await expect(runPackBuild(root, { args: ['--skip-fe'] })).rejects.toThrow();
  expect(fs.readFileSync(path.join(root, '.apack/exit-state'), 'utf8')).toBe('SEALED');
  expect(fs.readFileSync(path.join(root, 'dist/incumbent.txt'), 'utf8')).toBe('ACCEPTED');
  expect(fs.readdirSync(path.join(root, 'dist'))).toEqual(['incumbent.txt']);
  expect(fs.existsSync(path.join(root, '.apack/build'))).toBe(false);
});

it('reports frontend inputs that remain available after its compiler installation is removed', async () => {
  const root = fixture({
    'src/pack-entry-fe.ts': 'import "./Panel.vue"; export { default } from "./__generated__/pack-entry-fe.ts";',
    'src/Panel.vue': '<script setup lang="ts">import { computed } from "vue"; const label = computed(() => "Hello");</script><template><div>{{ label }}</div></template>',
  });
  const reports: BuildWatchInputs[] = [];
  await runPackBuild(root, { onInputs: inputs => { reports.push(inputs); } });
  expect(reports.some(report => report.successful && report.files.some(file => file.endsWith('Panel.vue')))).toBe(true);
  for (const report of reports) {
    expect([...report.files, ...report.directories].some(file => /[\\/]apack-compiler-[^\\/]+[\\/]/.test(file))).toBe(false);
    for (const file of report.files) expect(fs.existsSync(file), file).toBe(true);
  }
  const reads = JSON.parse(fs.readFileSync(path.join(root, '.apack/reads.json'), 'utf8')) as { phases: Record<string, string[]> };
  for (const file of Object.values(reads.phases).flat()) {
    expect(file).not.toMatch(/apack-compiler-[^/]+\//);
    expect(fs.existsSync(path.resolve(fs.realpathSync(root), file)), file).toBe(true);
  }
});

function finished(child: ChildProcess, event: 'exit' | 'close' = 'close'): Promise<number | null> {
  return new Promise((resolve, reject) => { child.once('error', reject); child.once(event, resolve); });
}

it('terminates a compiling worker when its parent IPC disconnects without publishing', async () => {
  const root = fixture({
    'src/compiler.ts': `import fs from 'node:fs'; import {spawn} from 'node:child_process';
      export default async function() {
        if (process.platform !== 'win32') {
          const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
          fs.writeFileSync('.apack/compiler-child-pid', String(child.pid)); child.unref();
        }
        fs.writeFileSync('ready', 'ready'); await new Promise(() => {}); return [];
      }`,
    'src/data.ts': 'export default [];',
  }, { formats: { waiting: { compiler: 'src/compiler.ts', entity: 'Relation' } }, sources: { waiting: { path: 'src/data.ts', format: 'waiting' } } });
  ensureCheckoutPackages(REPO_ROOT);
  const compiler = await captureCompilerInstallation();
  compilers.push(compiler);
  const inputs = path.join(root, '.apack/compiler-inputs');
  fs.mkdirSync(inputs, { recursive: true });
  const grouped = process.platform !== 'win32';
  const child = fork(compiler.bin, ['pack', 'build', '--skip-fe'], { cwd: root, detached: grouped, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, [BUILD_INPUTS_DIRECTORY_ENV]: inputs, [COMPILER_PROCESS_GROUP_ENV]: grouped ? '1' : undefined, APACK_BUILD_WORKER: '1', [COMPILER_INPUTS_ENV]: compiler.inputsFile, NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS) } });
  // Node can omit close after a parent-initiated IPC disconnect; assert exit and drained streams.
  const stopped = finished(child, 'exit');
  let output = '';
  child.stdout?.on('data', chunk => { output += chunk; });
  child.stderr?.on('data', chunk => { output += chunk; });
  try {
    await vi.waitFor(() => expect(fs.existsSync(path.join(root, 'ready')), output).toBe(true), { timeout: 20_000 });
    child.disconnect();
    expect(await _byDeadline(stopped, 'worker exit after parent loss', 2_000)).toBe(grouped ? null : 1);
    if (grouped) {
      expect(child.signalCode).toBe('SIGKILL');
      const pid = Number(fs.readFileSync(path.join(root, '.apack/compiler-child-pid'), 'utf8'));
      await vi.waitFor(() => {
        let state = '';
        try { state = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim(); }
        catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
        expect(state === '' || state.startsWith('Z')).toBe(true);
      }, { timeout: 2_000 });
    }
    await vi.waitFor(() => expect(child.stdout?.readableEnded && child.stderr?.readableEnded).toBe(true), { timeout: 2_000 });
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    try { await _byDeadline(stopped, 'worker cleanup', 2_000); }
    finally { child.stdout?.destroy(); child.stderr?.destroy(); removeCompilerReadTree(inputs); }
  }
});

it('refuses private worker bootstrap without a parent IPC channel', async () => {
  const child = spawn(process.execPath, [cliBin(), 'pack', 'build'], {
    cwd: fixture(), env: { ...process.env, APACK_BUILD_WORKER: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr?.on('data', chunk => { output += chunk; });
  expect(await _byDeadline(finished(child), 'private bootstrap refusal', 2_000)).toBe(1);
  expect(output).toContain('Pack build worker requires its parent IPC channel');
});

it.each([
  { name: 'watch is ready', watch: true, phase: 'ready', release: false },
  { name: 'watch is compiling', watch: true, phase: 'compiling', release: false },
  { name: 'one-shot is compiling', watch: false, phase: 'compiling', release: false },
  { name: 'release verification is compiling', watch: false, phase: 'compiling', release: true },
] as const)('removes its worker and compiler when the public build command is stopped while $name', async ({ watch, phase, release }) => {
  // Shutdown removes a complete compiler file tree, unlike the IPC-only exit checks above.
  const cleanupDeadlineMs = 20_000;
  const root = fixture({
    'src/compiler.ts': `import fs from 'node:fs'; export default async function() {
      fs.writeFileSync('.apack/compiler-inputs-path', process.env.${COMPILER_INPUTS_ENV}!);
      fs.writeFileSync('.apack/compiler-pid', String(process.pid));
      if (fs.existsSync('hold-build')) { console.log('APACK_TEST_COMPILER_STARTED'); await new Promise(() => {}); }
      return [];
    }`,
    'src/data.ts': 'export default [];',
  }, { formats: { tags: { compiler: 'src/compiler.ts', entity: 'Relation' } }, sources: { tags: { path: 'src/data.ts', format: 'tags' } } });
  if (phase === 'compiling') fs.writeFileSync(path.join(root, 'hold-build'), '');
  const args = release ? ['pack', 'release', '--dry-run', '--skip-tests', '--skip-e2e'] : ['pack', 'build', ...(watch ? ['--watch'] : [])];
  const child = fork(cliBin(), args, { cwd: root, execArgv: [],
    env: { ...process.env, APACK_BUILD_WORKER: undefined, [COMPILER_INPUTS_ENV]: undefined }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stderr?.on('data', chunk => { output += chunk; });
  const closed = finished(child);
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout?.on('data', chunk => {
      output += chunk;
      if (phase === 'compiling' && output.includes('APACK_TEST_COMPILER_STARTED')) resolve();
    });
    child.on('message', message => { if (phase === 'ready' && (message as { type?: string }).type === 'ready') resolve(); });
    child.once('close', () => reject(new Error(`Watch stopped before ready: ${output}`)));
  });
  try {
    await _byDeadline(ready, `public watcher startup (${phase})`, 60_000);
    const inputs = fs.readFileSync(path.join(root, '.apack/compiler-inputs-path'), 'utf8');
    const worker = Number(fs.readFileSync(path.join(root, '.apack/compiler-pid'), 'utf8'));
    expect(fs.existsSync(inputs)).toBe(true);
    child.kill('SIGTERM');
    await _byDeadline(closed, 'public watcher shutdown', cleanupDeadlineMs);
    expect(child.signalCode, output).toBe('SIGTERM');
    expect(fs.existsSync(inputs), inputs).toBe(false);
    expect(() => process.kill(worker, 0)).toThrow();
    if (phase === 'compiling') expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
    if (release) expect(fs.existsSync(path.join(root, '.apack/release'))).toBe(false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await _byDeadline(closed, 'public watcher cleanup', cleanupDeadlineMs);
  }
});
