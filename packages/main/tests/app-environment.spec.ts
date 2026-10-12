// Where this process puts its data and its logs, decided once. Every other process is told the answer, so
// a change here reaches all of them — including one that would move an installed app's logs.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = { APACK_ENV: process.env.APACK_ENV, APACK_USER_DATA_DIR: process.env.APACK_USER_DATA_DIR };

beforeEach(() => {
  vi.resetModules();
  process.env.APACK_ENV = 'production';
  delete process.env.APACK_USER_DATA_DIR;
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/**
 * The module under test and the Electron it talks to, from one fresh registry: `vi.resetModules()` gives
 * the module a new stub, so a stub imported at the top of this file would be a different object.
 */
async function load() {
  const { app } = await import('./electron-stub.ts');
  const module = await import('../src/app-environment.ts');
  return { app, ...module };
}

const context = async () => (await load()).getAppEnvironment();

describe('the app context', () => {
  it('reads packaged identity from the manifest rather than the launching environment', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-manifest-'));
    fs.writeFileSync(path.join(dir, 'build-manifest.json'), JSON.stringify({ version: '0.4.0-preview.1', channel: 'preview' }));
    const { app, getAppEnvironment } = await load();
    app.isPackaged = true;
    vi.spyOn(app, 'getAppPath').mockReturnValue(dir);
    try {
      expect(getAppEnvironment().env).toBe('preview');
      expect(getAppEnvironment().appName).toBe('apack-preview');
    } finally {
      app.isPackaged = false;
      vi.restoreAllMocks();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // macOS keeps logs in ~/Library/Logs/<app>, which is where Console.app looks. Putting an installed
  // app's logs under its data dir instead would tidy the layout and take them out of the tool a user
  // reaches for.
  it('leaves an ordinary run where the platform puts its logs', async () => {
    expect((await context()).logsDir).toBe('/platform/logs/apack');
  });

  // Every Playwright worker sharing one log directory is how one reached 23 GB
  it('keeps a run given its own data dir in its own log directory', async () => {
    process.env.APACK_USER_DATA_DIR = '/tmp/isolated-run';

    expect((await context()).logsDir).toBe('/tmp/isolated-run/apack/logs');
  });

  // Electron has to agree, because electron-log and anything else asking it must get the same answer
  it('tells Electron the directories it decided', async () => {
    process.env.APACK_USER_DATA_DIR = '/tmp/isolated-run';
    const { app, getAppEnvironment } = await load();

    const resolved = getAppEnvironment();

    expect(app.paths.get('userData')).toBe(resolved.userDataDir);
    expect(app.paths.get('logs')).toBe(resolved.logsDir);
    expect(app.setNameCalls).toEqual([resolved.appName]);
  });

  // Asking for it is what decides it, and asking twice must not decide it again: the modules that read it
  // do so while they are being imported, in whatever order the bundler settles on
  it('decides once, however many times it is asked', async () => {
    const { app, getAppEnvironment, initAppEnvironment } = await load();

    expect(getAppEnvironment()).toBe(getAppEnvironment());
    expect(initAppEnvironment()).toBe(getAppEnvironment());
    expect(app.setNameCalls).toHaveLength(1);
  });
});
