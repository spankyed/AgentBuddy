import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configuredAppPackagesDir,
  packagedAppPackagesDir,
  parseTestAppFlags,
  readAppChoice,
  resolveTestApp,
  saveAppChoice,
  type CliDirs,
} from '../../src/app/app-target';
import { fixtureEnv } from '../../src/commands/test';
import { cliBin } from '../../src/utils';
import { packagedExecutable } from '../../src/app/beta-app';
import { appLaunchEnv } from '../../../abuddy-testing/src/launch-env';

let tmp: string;
let dirs: CliDirs;

function makeCheckout(name: string, { built = true } = {}): string {
  const root = path.join(tmp, name);
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages', 'entry-point.mjs'), '');
  fs.mkdirSync(path.join(root, 'node_modules', 'electron'), { recursive: true });
  if (built) {
    fs.mkdirSync(path.join(root, 'packages', 'main', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages', 'renderer', 'dist'), { recursive: true });
  }
  return root;
}

const beta = vi.fn(async (_range: string, _cacheDir: string) => ({ version: '0.4.0-beta.2', executable: '/cache/AgentBuddy Beta' }));
const noPrompt = async (): Promise<string> => {
  throw new Error('prompted');
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-app-target-'));
  dirs = { config: path.join(tmp, 'config'), cache: path.join(tmp, 'cache') };
  beta.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('parseTestAppFlags', () => {
  it('takes the app flags out of the Playwright args', () => {
    expect(parseTestAppFlags(['--app-root', '/repo', '-g', 'renders', '--app=beta', 'smoke'])).toEqual({
      appRoot: '/repo',
      app: 'beta',
      args: ['-g', 'renders', 'smoke'],
    });
  });

  it('rejects unknown app channels', () => {
    expect(() => parseTestAppFlags(['--app', 'nightly'])).toThrow(/Unknown --app "nightly"/);
  });
});

describe('resolveTestApp', () => {
  const resolve = (overrides: Partial<Parameters<typeof resolveTestApp>[0]> = {}) =>
    resolveTestApp({ flags: { args: [] }, hostVersion: '>=0.3.0', dirs, env: {}, interactive: false, prompt: noPrompt, betaApp: beta, ...overrides });

  it('prefers --app-root over ABUDDY_ROOT and the saved choice', async () => {
    const flagged = makeCheckout('flagged');
    saveAppChoice(dirs, { beta: true });

    await expect(resolve({ flags: { appRoot: flagged, args: [] }, env: { ABUDDY_ROOT: makeCheckout('env') } }))
      .resolves.toEqual({ kind: 'source', root: flagged });
    expect(beta).not.toHaveBeenCalled();
  });

  it('downloads the beta for --app beta, for the pack hostVersion, into the cache dir', async () => {
    await expect(resolve({ flags: { app: 'beta', args: [] }, env: { ABUDDY_ROOT: makeCheckout('env') } }))
      .resolves.toEqual({ kind: 'packaged', version: '0.4.0-beta.2', executable: '/cache/AgentBuddy Beta' });
    expect(beta).toHaveBeenCalledWith('>=0.3.0', dirs.cache);
  });

  it('downloads the beta for ABUDDY_APP=beta, ahead of ABUDDY_ROOT', async () => {
    await expect(resolve({ env: { ABUDDY_APP: 'beta', ABUDDY_ROOT: makeCheckout('env') } }))
      .resolves.toMatchObject({ kind: 'packaged', version: '0.4.0-beta.2' });
  });

  it('uses ABUDDY_ROOT before the saved choice', async () => {
    const envRoot = makeCheckout('env');
    saveAppChoice(dirs, { beta: true });
    await expect(resolve({ env: { ABUDDY_ROOT: envRoot } })).resolves.toEqual({ kind: 'source', root: envRoot });
  });

  it('uses the saved choice without prompting', async () => {
    const saved = makeCheckout('saved');
    saveAppChoice(dirs, { source: saved });
    await expect(resolve({ interactive: true })).resolves.toEqual({ kind: 'source', root: saved });
  });

  it('fails with the options instead of prompting when not interactive (CI)', async () => {
    await expect(resolve()).rejects.toThrow(/--app-root <path>[\s\S]*--app beta[\s\S]*ABUDDY_ROOT/);
  });

  it('explains what an unbuilt checkout is missing', async () => {
    await expect(resolve({ flags: { appRoot: makeCheckout('raw', { built: false }), args: [] } }))
      .rejects.toThrow(/packages\/main\/dist is missing \(run npm run build\)/);
  });

  it('asks on first run, re-asks for an unusable path, and saves the answer', async () => {
    const good = makeCheckout('good');
    const answers = ['1', path.join(tmp, 'nope'), '1', good];
    const prompt = vi.fn(async () => answers.shift()!);

    await expect(resolve({ interactive: true, prompt })).resolves.toEqual({ kind: 'source', root: good });
    expect(readAppChoice(dirs)).toEqual({ source: good });
    expect(prompt).toHaveBeenCalledTimes(4);

    // The next run uses the saved answer
    await expect(resolve({ interactive: true, prompt: noPrompt })).resolves.toEqual({ kind: 'source', root: good });
  });

  it('saves a first-run beta choice', async () => {
    await expect(resolve({ interactive: true, prompt: async () => '2' })).resolves.toMatchObject({ kind: 'packaged' });
    expect(readAppChoice(dirs)).toEqual({ beta: true });
  });
});

describe('configuredAppPackagesDir', () => {
  const opts = (env: NodeJS.ProcessEnv) => ({ dirs, env, hostVersion: '>=0.3.0', betaApp: beta });
  const betaPackages = (version: string) =>
    path.join(dirs.cache, 'apps', 'beta', version, 'AgentBuddy Beta.app', 'Contents', 'Resources', 'app', 'packages');

  it('uses ABUDDY_ROOT, then a saved checkout', async () => {
    const saved = makeCheckout('saved');
    saveAppChoice(dirs, { source: saved });
    expect((await configuredAppPackagesDir(opts({ ABUDDY_ROOT: '/env-root' })))?.dir).toBe('/env-root/packages');
    expect((await configuredAppPackagesDir(opts({})))?.dir).toBe(path.join(saved, 'packages'));
  });

  it('downloads the beta for ABUDDY_APP=beta (CI), ahead of ABUDDY_ROOT and the saved choice', async () => {
    saveAppChoice(dirs, { source: makeCheckout('saved') });
    await expect(configuredAppPackagesDir(opts({ ABUDDY_APP: 'beta', ABUDDY_ROOT: '/env-root' }))).resolves.toEqual({
      dir: packagedAppPackagesDir('/cache/AgentBuddy Beta'),
      label: 'AgentBuddy Beta 0.4.0-beta.2',
    });
    expect(beta).toHaveBeenCalledWith('>=0.3.0', dirs.cache);
    await expect(configuredAppPackagesDir(opts({ ABUDDY_APP: 'nightly' }))).rejects.toThrow(/Unknown ABUDDY_APP "nightly"/);
  });

  it('uses the newest downloaded beta for a saved beta choice, and downloads one when none is cached', async () => {
    saveAppChoice(dirs, { beta: true });
    expect((await configuredAppPackagesDir(opts({})))?.label).toBe('AgentBuddy Beta 0.4.0-beta.2');
    expect(beta).toHaveBeenCalledTimes(1);

    for (const version of ['0.4.0-beta.9', '0.4.0-beta.10', '0.3.9']) {
      const executable = packagedExecutable(path.join(dirs.cache, 'apps', 'beta', version));
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, '');
    }
    fs.mkdirSync(path.join(dirs.cache, 'apps', 'beta', '.0.5.0-beta.0.download-x'));

    await expect(configuredAppPackagesDir(opts({}))).resolves.toEqual({
      dir: betaPackages('0.4.0-beta.10'),
      label: 'AgentBuddy Beta 0.4.0-beta.10',
    });
    expect(beta).toHaveBeenCalledTimes(1);
  });

  it('resolves nothing without a configured app', async () => {
    await expect(configuredAppPackagesDir(opts({}))).resolves.toBeNull();
  });
});

describe('appLaunchEnv (@abuddy/testing)', () => {
  it("doesn't pass the app-bundled launcher's ELECTRON_RUN_AS_NODE to the app under test", () => {
    expect(appLaunchEnv({ ELECTRON_RUN_AS_NODE: '1', HOME: '/home' }, '/tmp/data')).toEqual({
      HOME: '/home',
      PLAYWRIGHT_TEST: 'true',
      ABUDDY_USER_DATA_DIR: '/tmp/data',
    });
  });
});

describe('fixtureEnv', () => {
  it('points the fixture at exactly one app', () => {
    const base = { ABUDDY_ROOT: '/stale', ABUDDY_APP_EXECUTABLE: '/stale-exe', ELECTRON_RUN_AS_NODE: '1', HOME: '/home' };
    expect(fixtureEnv({ kind: 'packaged', executable: '/exe', version: '1.0.0-beta.0' }, '/pack', base))
      .toEqual({ ABUDDY_APP_EXECUTABLE: '/exe', PACK_DIR: '/pack', ABUDDY_CLI: cliBin(), ELECTRON_RUN_AS_NODE: '1', HOME: '/home' });
    expect(fixtureEnv({ kind: 'source', root: '/repo' }, undefined, base))
      .toEqual({ ABUDDY_ROOT: '/repo', ABUDDY_CLI: cliBin(), ELECTRON_RUN_AS_NODE: '1', HOME: '/home' });
    expect(fs.existsSync(cliBin())).toBe(true);
  });
});
