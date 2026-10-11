import { afterEach, expect, it, vi } from 'vitest';
const { launch, hold } = vi.hoisted(() => ({ launch: vi.fn(), hold: vi.fn(async () => {}) }));
vi.mock('node:child_process', () => ({ execFileSync: launch }));
vi.mock('../../src/commands/dev', () => ({ holdSession: hold }));
import { open } from '../../src/commands/open';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it('opens production by default even when the bundled CLI is beta', async () => {
  vi.stubEnv('APACK_CLI_CHANNEL', 'beta');
  await open([]);
  expect(launch).toHaveBeenCalledWith('open', ['-a', 'apack'], { stdio: 'pipe' });
  expect(hold).not.toHaveBeenCalled();
});

it('holds an app-only session and forwards build/profile options', async () => {
  await open(['--session', '--build', '/checkout', '--profile', 'review']);
  expect(hold).toHaveBeenCalledWith(['--build', '/checkout', '--profile', 'review'], 'app');
  expect(launch).not.toHaveBeenCalled();
});

it('refuses session options without an explicit session', async () => {
  await expect(open(['--fresh'])).rejects.toThrow('require --session');
  expect(hold).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});
