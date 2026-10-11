import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn(() => ({ unref: vi.fn(), once: vi.fn() })) }));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), spawn }));
vi.mock('@apackdev/host/dev-session', async importOriginal => ({
  ...await importOriginal<typeof import('@apackdev/host/dev-session')>(),
  waitForSession: async (dataDir: string) => ({ dataDir, debugPort: 1234, supervisorPid: process.pid, startedBy: 'drive' }),
}));
import { spawnDevApp } from '../../src/app/drive-attach';

let dataDir: string;
beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-spawn-session-')); });
afterEach(() => { vi.clearAllMocks(); fs.rmSync(dataDir, { recursive: true, force: true }); });

it.each([
  ['app', ['dev', 'open']],
  ['pack', ['pack', 'dev']],
] as const)('spawns an explicit %s session without relying on cwd inference', async (scope, command) => {
  await spawnDevApp('/pack-directory', dataDir, ['--profile', 'review'], scope);
  expect(spawn).toHaveBeenCalledWith(process.execPath, [expect.any(String), ...command, '--profile', 'review'], expect.objectContaining({ cwd: '/pack-directory', detached: true }));
});
