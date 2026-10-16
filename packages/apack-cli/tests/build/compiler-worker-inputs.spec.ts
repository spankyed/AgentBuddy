import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { cliBin } from '../../src/utils.ts';
import { COMPILER_INPUTS_ENV } from '../../src/build/compiler-installation.ts';
import { _byDeadline } from '@apackdev/sdk/testing/waiting';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

it.each([false, true])('refuses an uncaptured worker with parent IPC (unrelated metadata: %s)', async unrelated => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-worker-inputs-'));
  roots.push(root);
  const inputsFile = path.join(root, 'compiler-inputs.json');
  if (unrelated) fs.writeFileSync(inputsFile, JSON.stringify({ hash: '0'.repeat(64), packages: [root], paths: [] }));
  const child = fork(cliBin(), ['pack', 'build'], {
    cwd: root, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, APACK_BUILD_WORKER: '1', [COMPILER_INPUTS_ENV]: unrelated ? inputsFile : undefined },
  });
  let errors = '';
  child.stderr!.on('data', chunk => { errors += chunk; });
  const closed = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  try {
    expect(await _byDeadline(closed, 'uncaptured worker refusal', 2_000)).toBe(1);
    expect(errors).toContain('Pack build worker requires captured compiler inputs');
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await _byDeadline(closed, 'uncaptured worker cleanup', 2_000);
  }
});
