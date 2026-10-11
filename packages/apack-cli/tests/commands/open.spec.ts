import { afterEach, expect, it, vi } from 'vitest';
const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: launch }));
import { open } from '../../src/commands/open';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it('opens production by default even when the bundled CLI is beta', async () => {
  vi.stubEnv('APACK_CLI_CHANNEL', 'beta');
  await open([]);
  expect(launch).toHaveBeenCalledWith('open', ['-a', 'apack'], { stdio: 'pipe' });
});

it('refuses development-session options on installed-app open', async () => {
  await expect(open(['--fresh'])).rejects.toThrow('Unexpected arguments');
  expect(launch).not.toHaveBeenCalled();
});

it('never enables debugging through installed-app open', async () => {
  for (const flag of ['--session', '--attach', '--app']) await expect(open([flag])).rejects.toThrow('Unexpected arguments');
});

it('rejects conflicting installed release selectors', async () => {
  await expect(open(['--channel', 'production', '--channel', 'beta'])).rejects.toThrow('Specify --channel once');
  expect(launch).not.toHaveBeenCalled();
});
