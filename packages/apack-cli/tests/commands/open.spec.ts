import { afterEach, expect, it, vi } from 'vitest';
const { launch, hold } = vi.hoisted(() => ({ launch: vi.fn(), hold: vi.fn(async () => {}) }));
vi.mock('node:child_process', () => ({ execFileSync: launch }));
vi.mock('../../src/commands/dev', () => ({ holdSession: hold }));
import { devOpen } from '../../src/commands/dev-open';
import { open } from '../../src/commands/open';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it('opens production by default even when the bundled CLI is beta', async () => {
  vi.stubEnv('APACK_CLI_CHANNEL', 'beta');
  await open([]);
  expect(launch).toHaveBeenCalledWith('open', ['-a', 'apack'], { stdio: 'pipe' });
  expect(hold).not.toHaveBeenCalled();
});

it('holds an app-only session and forwards build/profile options', async () => {
  await devOpen(['--app', '/checkout', '--profile', 'review']);
  expect(hold).toHaveBeenCalledWith(['--app', '/checkout', '--profile', 'review'], 'app');
  expect(launch).not.toHaveBeenCalled();
});

it('refuses session options without an explicit session', async () => {
  await expect(open(['--fresh'])).rejects.toThrow('development sessions use apack dev open');
  expect(hold).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});

it('never enables debugging through installed-app open', async () => {
  for (const flag of ['--session', '--attach', '--app']) await expect(open([flag])).rejects.toThrow('Unexpected arguments');
  expect(hold).not.toHaveBeenCalled();
});

it('rejects conflicting installed release selectors', async () => {
  await expect(open(['--channel', 'production', '--channel', 'beta'])).rejects.toThrow('Specify --channel once');
  expect(launch).not.toHaveBeenCalled();
});
