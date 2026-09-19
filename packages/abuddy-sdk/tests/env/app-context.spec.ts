import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _inferElectronAppEnv, parseAppEnv, readApiEndpoint, resolveAppContext } from '../../src/env/index.ts';

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
    expect(ctx.installedPacksFile).toBe(path.join(ctx.userDataDir, 'installed-packs.json'));
    expect(ctx.apiPortFile).toBe(path.join(ctx.userDataDir, 'api-port'));
    expect(ctx.apiTokenFile).toBe(path.join(ctx.userDataDir, 'api-token'));
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

  it('packaged builds ignore ABUDDY_ENV from the launching shell', () => {
    expect(_inferElectronAppEnv({ ...base, isPackaged: true, channel: 'production', envVar: 'development' })).toBe('production');
  });

  it('a packaged build without a valid stamp refuses to guess', () => {
    expect(() => _inferElectronAppEnv({ ...base, isPackaged: true, channel: '' })).toThrow(/no valid release channel stamp/);
    expect(() => _inferElectronAppEnv({ ...base, isPackaged: true, channel: 'development' })).toThrow(/no valid release channel stamp/);
  });

  it('source runs default to development, or ABUDDY_ENV when set', () => {
    expect(_inferElectronAppEnv(base)).toBe('development');
    expect(_inferElectronAppEnv({ ...base, envVar: 'beta' })).toBe('beta');
    expect(() => _inferElectronAppEnv({ ...base, envVar: 'staging' })).toThrow(/Invalid app environment/);
  });
});

describe('readApiEndpoint', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-endpoint-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const file = () => path.join(dir, 'api-port');
  const write = (content: unknown) => fs.writeFileSync(file(), typeof content === 'string' ? content : JSON.stringify(content));
  /** A process id no process has any more */
  const exitedPid = () => spawnSync(process.execPath, ['-e', '']).pid!;

  it('reads the API a running process published', () => {
    write({ port: 3001, pid: process.pid });
    expect(readApiEndpoint(file())).toEqual({ port: 3001, pid: process.pid });
  });

  it('reads nothing from a file a crashed run left behind', () => {
    write({ port: 3001, pid: exitedPid() });
    expect(readApiEndpoint(file())).toBeNull();
  });

  // Pids are recycled, so after a reboot a crashed run's file names an unrelated live process. Without the
  // boot bound `abuddy dev` and the pack watcher believe an API is there and talk to a port nobody holds.
  it('reads nothing from a file written before this boot, whatever pid it names', () => {
    write({ port: 3001, pid: process.pid });
    expect(readApiEndpoint(file())).toEqual({ port: 3001, pid: process.pid });

    const before = new Date(Date.now() - os.uptime() * 1000 - 60_000);
    fs.utimesSync(file(), before, before);
    expect(readApiEndpoint(file())).toBeNull();
  });

  it('reads nothing from a missing file, or one that makes no sense', () => {
    expect(readApiEndpoint(file())).toBeNull();
    for (const content of ['', 'not json', '3001', { port: 3001 }, { pid: process.pid }, { port: 0, pid: process.pid },
      { port: 70000, pid: process.pid }, { port: '3001', pid: process.pid }, { port: 3001, pid: -1 }]) {
      write(content);
      expect(readApiEndpoint(file()), JSON.stringify(content)).toBeNull();
    }
  });
});
