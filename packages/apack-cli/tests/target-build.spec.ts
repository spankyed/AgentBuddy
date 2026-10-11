import { afterEach, expect, it, vi } from 'vitest';
import { appDataDirFor } from '@apackdev/sdk/env';
import { parseTargetEnv, parseReleaseChannel, targetDataContext } from '../src/utils';
afterEach(() => vi.unstubAllEnvs());
it('uses the bundled channel only for the default data target', () => {
  vi.stubEnv('APACK_CLI_CHANNEL', 'preview');
  expect(parseTargetEnv([]).env).toBe('preview');
  expect(parseReleaseChannel(['--channel', 'production']).env).toBe('production');
});
it('separates release channels from development data', () => {
  expect(parseTargetEnv(['--data=development', 'pack'])).toEqual({ env: 'development', args: ['pack'] });
  expect(() => parseReleaseChannel(['--channel', 'development'])).toThrow('--channel needs');
  expect(() => parseTargetEnv(['--data', 'bogus'])).toThrow('--data needs');
  expect(parseTargetEnv(['--app', '/checkout']).args).toEqual(['--app', '/checkout']);
});

it('explicit stored-data targets cannot be redirected by a shell override', () => {
  vi.stubEnv('APACK_USER_DATA_DIR', '/tmp/apack-target-test');
  expect(targetDataContext('beta', ['--data', 'beta']).userDataDir).toBe(appDataDirFor('beta'));
  expect(targetDataContext('production', []).userDataDir).toBe('/tmp/apack-target-test');
});
