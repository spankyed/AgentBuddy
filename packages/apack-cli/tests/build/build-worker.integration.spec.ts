import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawn, type ChildProcess } from 'node:child_process';
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

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

function fixture(files: Record<string, string> = {}, content = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-worker-'));
  roots.push(root);
  packFixture({ at: root, nodeModules: path.join(REPO_ROOT, 'node_modules'),
    manifest: { id: 'fresh-worker', name: 'Fresh worker', features: {}, content }, files });
  return root;
}

it('compiles public build flags in a fresh worker instead of the supervisor compiler', async () => {
  const root = fixture();
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await buildCommand(['--skip-fe']);
  expect(bundlePackRuntime).not.toHaveBeenCalled();
  expect(readPackBuild(path.join(root, 'dist')).snapshot.manifest.id).toBe('fresh-worker');
  expect(fs.existsSync(path.join(root, 'dist/runtime/fe.js'))).toBe(false);
});

function finished(child: ChildProcess, event: 'exit' | 'close' = 'close'): Promise<number | null> {
  return new Promise((resolve, reject) => { child.once('error', reject); child.once(event, resolve); });
}

it('terminates a compiling worker when its parent IPC disconnects without publishing', async () => {
  const root = fixture({
    'src/compiler.ts': 'import fs from "node:fs"; export default async function() { fs.writeFileSync("ready", "ready"); await new Promise(() => {}); return []; }',
    'src/data.ts': 'export default [];',
  }, { formats: { waiting: { compiler: 'src/compiler.ts', entity: 'Relation' } }, sources: { waiting: { path: 'src/data.ts', format: 'waiting' } } });
  const child = fork(cliBin(), ['pack', 'build', '--skip-fe'], { cwd: root, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, APACK_BUILD_WORKER: '1', NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS) } });
  // Node can omit close after a parent-initiated IPC disconnect; assert exit and drained streams.
  const stopped = finished(child, 'exit');
  let output = '';
  child.stdout?.on('data', chunk => { output += chunk; });
  child.stderr?.on('data', chunk => { output += chunk; });
  try {
    await vi.waitFor(() => expect(fs.existsSync(path.join(root, 'ready')), output).toBe(true), { timeout: 20_000 });
    child.disconnect();
    expect(await _byDeadline(stopped, 'worker exit after parent loss', 2_000)).toBe(1);
    await vi.waitFor(() => expect(child.stdout?.readableEnded && child.stderr?.readableEnded).toBe(true), { timeout: 2_000 });
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    try { await _byDeadline(stopped, 'worker cleanup', 2_000); }
    finally { child.stdout?.destroy(); child.stderr?.destroy(); }
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
