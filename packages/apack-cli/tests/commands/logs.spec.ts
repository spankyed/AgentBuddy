import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi, afterEach } from 'vitest';
import { logOptions } from '../../src/commands/logs';
afterEach(() => vi.unstubAllEnvs());
it('selects platform logs by channel, ignoring inherited custom data paths', () => {
  vi.stubEnv('APACK_USER_DATA_DIR', '/unrelated');
  expect(logOptions(['--channel', 'beta', '--follow', '--lines', '0'])).toEqual({
    file: path.join(os.homedir(), 'Library/Logs/apack-beta/main.log'), lines: '0', follow: true,
  });
});
it.each([['--lines', '-1'], ['--lines', '1.5'], ['--lines', 'Infinity'], ['--unknown'], ['extra']])('refuses malformed options %j', (...args) => {
  expect(() => logOptions(args)).toThrow();
});
