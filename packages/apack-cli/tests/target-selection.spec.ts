import { afterEach, expect, it, vi } from 'vitest';
import { appDataDirFor } from '@apackdev/sdk/env';
import { parseStorageProfile, parseAppChannel, profileLabel, targetDataContext } from '../src/utils';
afterEach(() => vi.unstubAllEnvs());
it('uses the bundled channel only for the default data target', () => {
  vi.stubEnv('APACK_CLI_CHANNEL', 'preview');
  expect(parseStorageProfile([]).env).toBe('preview');
  expect(parseAppChannel(['--channel', 'production']).channel).toBe('production');
});
it('separates release channels from development data', () => {
  expect(parseStorageProfile(['--profile=development', 'pack'])).toEqual({ env: 'development', profile: 'development', args: ['pack'] });
  expect(() => parseAppChannel(['--channel', 'development'])).toThrow('--channel needs');
  expect(() => targetDataContext('production', ['--profile', 'bogus'])).toThrow();
  expect(parseStorageProfile(['--host', '/checkout']).args).toEqual(['--host', '/checkout']);
});

it('explicit stored-data targets cannot be redirected by a shell override', () => {
  vi.stubEnv('APACK_USER_DATA_DIR', '/tmp/apack-target-test');
  expect(targetDataContext('beta', ['--profile', 'beta']).userDataDir).toBe(appDataDirFor('beta'));
  expect(targetDataContext('production', []).userDataDir).toBe('/tmp/apack-target-test');
});

it('accepts a custom profile name without treating it as an environment', () => {
  expect(parseStorageProfile(['--profile', 'my-project']).profile).toBe('my-project');
});

it('labels explicitly selected storage independently of the bundled app channel', () => {
  expect(profileLabel('beta', 'my-development')).toBe(' (profile my-development)');
  expect(profileLabel('production', 'production')).toBe(' (profile production)');
});
