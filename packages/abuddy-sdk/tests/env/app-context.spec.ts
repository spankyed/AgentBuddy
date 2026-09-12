import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inferElectronAppEnv, parseAppEnv, resolveAppContext } from '../../src/env';

const saved = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };

beforeEach(() => {
  delete process.env.ABUDDY_ENV;
  delete process.env.ABUDDY_USER_DATA_DIR;
});

afterEach(() => {
  for (const [key, value] of [['ABUDDY_ENV', saved.env], ['ABUDDY_USER_DATA_DIR', saved.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('resolveAppContext', () => {
  it('throws when the environment is unknown instead of falling back to production', () => {
    expect(() => resolveAppContext()).toThrow(/App environment unknown/);
  });

  it('uses ABUDDY_ENV and derives paths from the platform data dir', () => {
    process.env.ABUDDY_ENV = 'beta';
    const ctx = resolveAppContext();
    expect(ctx.env).toBe('beta');
    expect(ctx.appName).toBe('abuddy-beta');
    expect(path.basename(ctx.userDataDir)).toBe('abuddy-beta');
    expect(ctx.userDataDir.startsWith(os.homedir())).toBe(true);
    expect(ctx.packsDir).toBe(path.join(ctx.userDataDir, 'packs'));
    expect(ctx.registryFile).toBe(path.join(ctx.userDataDir, 'pack-registry.json'));
    expect(ctx.apiPortFile).toBe(path.join(ctx.userDataDir, 'api-port'));
    expect(ctx.urlScheme).toBe('abuddy-beta');
  });

  it('prefers explicit input over the environment variables', () => {
    process.env.ABUDDY_ENV = 'beta';
    process.env.ABUDDY_USER_DATA_DIR = '/from/env';
    const ctx = resolveAppContext({ env: 'development', userDataDir: '/explicit' });
    expect(ctx.env).toBe('development');
    expect(ctx.appName).toBe('abuddy-dev');
    expect(ctx.userDataDir).toBe('/explicit');
    expect(ctx.urlScheme).toBe('abuddy');
  });

  it('honors ABUDDY_USER_DATA_DIR as the data dir override', () => {
    process.env.ABUDDY_ENV = 'test';
    process.env.ABUDDY_USER_DATA_DIR = '/tmp/isolated';
    const ctx = resolveAppContext();
    expect(ctx.appName).toBe('abuddy-test');
    expect(ctx.packsDir).toBe(path.join('/tmp/isolated', 'packs'));
  });

  it('maps each environment to its existing app name', () => {
    expect(resolveAppContext({ env: 'production' }).appName).toBe('abuddy');
    expect(resolveAppContext({ env: 'beta' }).appName).toBe('abuddy-beta');
    expect(resolveAppContext({ env: 'development' }).appName).toBe('abuddy-dev');
    expect(resolveAppContext({ env: 'test' }).appName).toBe('abuddy-test');
  });

  it('rejects an invalid ABUDDY_ENV', () => {
    process.env.ABUDDY_ENV = 'prod';
    expect(() => resolveAppContext()).toThrow(/Invalid app environment "prod"/);
  });
});

describe('parseAppEnv', () => {
  it('treats unset or empty as unknown', () => {
    expect(parseAppEnv(undefined)).toBeUndefined();
    expect(parseAppEnv('')).toBeUndefined();
  });
});

describe('inferElectronAppEnv', () => {
  const base = { playwrightTest: false, isPackaged: false, channel: '', envVar: undefined };

  it('Playwright always means test, even for a packaged build', () => {
    expect(inferElectronAppEnv({ ...base, playwrightTest: true })).toBe('test');
    expect(inferElectronAppEnv({ ...base, playwrightTest: true, isPackaged: true, channel: 'production' })).toBe('test');
  });

  it('packaged builds use their stamped channel', () => {
    expect(inferElectronAppEnv({ ...base, isPackaged: true, channel: 'production' })).toBe('production');
    expect(inferElectronAppEnv({ ...base, isPackaged: true, channel: 'beta' })).toBe('beta');
  });

  it('packaged builds ignore ABUDDY_ENV from the launching shell', () => {
    expect(inferElectronAppEnv({ ...base, isPackaged: true, channel: 'production', envVar: 'development' })).toBe('production');
  });

  it('a packaged build without a valid stamp refuses to guess', () => {
    expect(() => inferElectronAppEnv({ ...base, isPackaged: true, channel: '' })).toThrow(/no valid release channel stamp/);
    expect(() => inferElectronAppEnv({ ...base, isPackaged: true, channel: 'development' })).toThrow(/no valid release channel stamp/);
  });

  it('source runs default to development, or ABUDDY_ENV when set', () => {
    expect(inferElectronAppEnv(base)).toBe('development');
    expect(inferElectronAppEnv({ ...base, envVar: 'beta' })).toBe('beta');
    expect(() => inferElectronAppEnv({ ...base, envVar: 'staging' })).toThrow(/Invalid app environment/);
  });
});
