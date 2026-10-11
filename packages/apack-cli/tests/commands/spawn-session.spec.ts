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

it('spawns pack development through the CLI', async () => {
  await spawnDevApp('/pack-directory', dataDir, ['--profile', 'review'], 'pack');
  expect(spawn).toHaveBeenCalledWith(process.execPath, [expect.any(String), 'pack', 'dev', '--profile', 'review'], expect.objectContaining({ cwd: '/pack-directory', detached: true }));
});

it('spawns app development through the repository entry point', async () => {
  const checkout = path.resolve(import.meta.dirname, '../../../..');
  await spawnDevApp(checkout, dataDir, ['--profile', 'review'], 'app');
  expect(spawn).toHaveBeenCalledWith(process.execPath, [
    '--conditions=@apackdev/source', path.join(checkout, 'scripts/app-dev.mjs'), 'open', '--profile', 'review',
  ], expect.objectContaining({ cwd: checkout, detached: true }));
});

it('refuses app spawning outside a checkout before creating data or launching', async () => {
  const absent = path.join(dataDir, 'absent');
  await expect(spawnDevApp(dataDir, absent, [], 'app')).rejects.toThrow('source checkout');
  expect(fs.existsSync(absent)).toBe(false);
  expect(spawn).not.toHaveBeenCalled();
});
