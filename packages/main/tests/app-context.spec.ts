// Where this process puts its data and its logs, decided once. Every other process is told the answer, so
// a change here reaches all of them — including one that would move an installed app's logs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = { ABUDDY_ENV: process.env.ABUDDY_ENV, ABUDDY_USER_DATA_DIR: process.env.ABUDDY_USER_DATA_DIR };

beforeEach(() => {
  vi.resetModules();
  process.env.ABUDDY_ENV = 'production';
  delete process.env.ABUDDY_USER_DATA_DIR;
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
  const module = await import('../src/app-context.ts');
  return { app, ...module };
}

const context = async () => (await load()).getAppContext();

describe('the app context', () => {
  // macOS keeps logs in ~/Library/Logs/<app>, which is where Console.app looks. Putting an installed
  // app's logs under its data dir instead would tidy the layout and take them out of the tool a user
  // reaches for.
  it('leaves an ordinary run where the platform puts its logs', async () => {
    expect((await context()).logsDir).toBe('/platform/logs/abuddy');
  });

  // Every Playwright worker sharing one log directory is how one reached 23 GB
  it('keeps a run given its own data dir in its own log directory', async () => {
    process.env.ABUDDY_USER_DATA_DIR = '/tmp/isolated-run';

    expect((await context()).logsDir).toBe('/tmp/isolated-run/logs');
  });

  // Electron has to agree, because electron-log and anything else asking it must get the same answer
  it('tells Electron the directories it decided', async () => {
    process.env.ABUDDY_USER_DATA_DIR = '/tmp/isolated-run';
    const { app, getAppContext } = await load();

    const resolved = getAppContext();

    expect(app.paths.get('userData')).toBe(resolved.userDataDir);
    expect(app.paths.get('logs')).toBe(resolved.logsDir);
    expect(app.setNameCalls).toEqual([resolved.appName]);
  });

  // Asking for it is what decides it, and asking twice must not decide it again: the modules that read it
  // do so while they are being imported, in whatever order the bundler settles on
  it('decides once, however many times it is asked', async () => {
    const { app, getAppContext, initAppContext } = await load();

    expect(getAppContext()).toBe(getAppContext());
    expect(initAppContext()).toBe(getAppContext());
    expect(app.setNameCalls).toHaveLength(1);
  });
});
