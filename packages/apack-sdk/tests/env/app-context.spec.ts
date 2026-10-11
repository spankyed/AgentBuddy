import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _inferElectronAppEnv, parseAppEnv, resolveAppContext } from '../../src/env/index.ts';

const saved = { env: process.env.APACK_ENV, userDataDir: process.env.APACK_USER_DATA_DIR };

beforeEach(() => {
  delete process.env.APACK_ENV;
  delete process.env.APACK_USER_DATA_DIR;
});

afterEach(() => {
  for (const [key, value] of [['APACK_ENV', saved.env], ['APACK_USER_DATA_DIR', saved.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('resolveAppContext', () => {
  it('throws when the build is unknown instead of falling back to production', () => {
    expect(() => resolveAppContext()).toThrow(/App build unknown/);
  });

  it('uses APACK_ENV and derives paths from the platform data dir', () => {
    process.env.APACK_ENV = 'beta';
    const ctx = resolveAppContext();
    expect(ctx.build).toBe('beta');
    expect(ctx.appName).toBe('apack-beta');
    expect(path.basename(ctx.userDataDir)).toBe('apack-beta');
    expect(ctx.userDataDir.startsWith(os.homedir())).toBe(true);
    expect(ctx.packsDir).toBe(path.join(ctx.appDir, 'packs'));
    expect(ctx.installedPacksFile).toBe(path.join(ctx.appDir, 'installed-packs.json'));
    expect(ctx.apiPortFile).toBe(path.join(ctx.appDir, 'api-port'));
    expect(ctx.apiTokenFile).toBe(path.join(ctx.appDir, 'api-token'));
    expect(ctx.urlScheme).toBe('apack-beta');
  });

  it('prefers explicit input over the environment variables', () => {
    process.env.APACK_ENV = 'beta';
    process.env.APACK_USER_DATA_DIR = '/from/env';
    const ctx = resolveAppContext({ build: 'development', profile: '/explicit' });
    expect(ctx.build).toBe('development');
    expect(ctx.appName).toBe('apack-dev');
    expect(ctx.userDataDir).toBe('/explicit');
    expect(ctx.urlScheme).toBe('apack');
  });

  it('honors APACK_USER_DATA_DIR as the data dir override', () => {
    process.env.APACK_ENV = 'test';
    process.env.APACK_USER_DATA_DIR = '/tmp/isolated';
    const ctx = resolveAppContext();
    expect(ctx.appName).toBe('apack-test');
    expect(ctx.appDir).toBe(path.join('/tmp/isolated', 'apack'));
    expect(ctx.packsDir).toBe(path.join('/tmp/isolated', 'apack', 'packs'));
  });

  it('maps each environment to its existing app name', () => {
    expect(resolveAppContext({ build: 'production' }).appName).toBe('apack');
    expect(resolveAppContext({ build: 'beta' }).appName).toBe('apack-beta');
    expect(resolveAppContext({ build: 'development' }).appName).toBe('apack-dev');
    expect(resolveAppContext({ build: 'test' }).appName).toBe('apack-test');
  });

  it('rejects an invalid APACK_ENV', () => {
    process.env.APACK_ENV = 'prod';
    expect(() => resolveAppContext()).toThrow(/Invalid app environment "prod"/);
  });
});

describe('parseAppEnv', () => {
  it('treats unset or empty as unknown', () => {
    expect(parseAppEnv(undefined)).toBeUndefined();
    expect(parseAppEnv('')).toBeUndefined();
  });
});

describe('_inferElectronAppEnv', () => {
  const base = { playwrightTest: false, isPackaged: false, channel: '', envVar: undefined };

  it('Playwright always means test, even for a packaged build', () => {
    expect(_inferElectronAppEnv({ ...base, playwrightTest: true })).toBe('test');
    expect(_inferElectronAppEnv({ ...base, playwrightTest: true, isPackaged: true, channel: 'production' })).toBe('test');
  });

  it('packaged builds use their stamped channel', () => {
    expect(_inferElectronAppEnv({ ...base, isPackaged: true, channel: 'production' })).toBe('production');
    expect(_inferElectronAppEnv({ ...base, isPackaged: true, channel: 'beta' })).toBe('beta');
  });

  it('packaged builds ignore APACK_ENV from the launching shell', () => {
    expect(_inferElectronAppEnv({ ...base, isPackaged: true, channel: 'production', envVar: 'development' })).toBe('production');
  });

  it('a packaged build without a valid stamp refuses to guess', () => {
    expect(() => _inferElectronAppEnv({ ...base, isPackaged: true, channel: '' })).toThrow(/no valid release channel stamp/);
    expect(() => _inferElectronAppEnv({ ...base, isPackaged: true, channel: 'development' })).toThrow(/no valid release channel stamp/);
  });

  it('source runs default to development, or APACK_ENV when set', () => {
    expect(_inferElectronAppEnv(base)).toBe('development');
    expect(_inferElectronAppEnv({ ...base, envVar: 'beta' })).toBe('beta');
    expect(() => _inferElectronAppEnv({ ...base, envVar: 'staging' })).toThrow(/Invalid app environment/);
  });
});
