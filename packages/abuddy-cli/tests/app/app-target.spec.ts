import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configuredAppPackagesDir,
  packagedAppPackagesDir,
  parseAppFlags,
  readAppChoice,
  resolveDevelopmentApp,
  resolvePinnedApp,
  saveAppChoice,
  type CliDirs,
} from '../../src/app/app-target';
import { fixtureEnv } from '../../src/commands/test';
import { cliBin } from '../../src/utils';
import { packagedExecutable } from '../../src/app/beta-app';

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

describe('parseAppFlags', () => {
  it('takes the app flags out of the Playwright args', () => {
    expect(parseAppFlags(['--app-root', '/repo', '-g', 'renders', '--app=beta', 'smoke'])).toEqual({
      appRoot: '/repo',
      app: 'beta',
      args: ['-g', 'renders', 'smoke'],
    });
  });

  it('takes --release too, so Playwright never sees it', () => {
    expect(parseAppFlags(['--release', '-g', 'renders'])).toEqual({ release: true, args: ['-g', 'renders'] });
    expect(parseAppFlags(['-g', 'renders'])).toEqual({ args: ['-g', 'renders'] });
  });

  it('rejects unknown app channels', () => {
    expect(() => parseAppFlags(['--app', 'nightly'])).toThrow(/Unknown --app "nightly"/);
  });
});

/**
 * The half that may not consult machine state.
 *
 * `resolveTestApp` used to fall through to `~/.config/abuddy-cli/config.json` and, in a terminal, to a
 * question whose answer it persisted — so a pack's test result depended on what someone typed once on
 * that machine. The data layer was never the problem: the fixture always takes a fresh `mkdtemp` and
 * forces `env: 'test'`, which is why this hid — the isolation you check for is real, one layer below the
 * leak. These cases fail the moment the config read comes back.
 */
describe('resolvePinnedApp', () => {
  const pinned = (overrides: Partial<Parameters<typeof resolvePinnedApp>[0]> = {}) =>
    resolvePinnedApp({ flags: { args: [] }, hostVersion: '>=0.3.0', dirs, env: {}, betaApp: beta, ...overrides });

  it('ignores a saved choice, where the development half would honour it', async () => {
    saveAppChoice(dirs, { source: makeCheckout('saved') });

    await expect(pinned()).resolves.toMatchObject({ kind: 'packaged', version: '0.4.0-beta.2' });
    expect(beta, 'it pinned from hostVersion rather than reading config.json').toHaveBeenCalledWith('>=0.3.0', dirs.cache);
  });

  // There is nothing to ask about: the manifest's hostVersion always yields an answer, which is why
  // dropping the config read leaves no hole
  it('needs no prompt and no terminal, so CI and a laptop agree', async () => {
    await expect(pinned()).resolves.toMatchObject({ kind: 'packaged' });
  });

  it('still takes an explicitly named app', async () => {
    const root = makeCheckout('explicit');
    await expect(pinned({ flags: { appRoot: root, args: [] } })).resolves.toEqual({ kind: 'source', root });
    await expect(pinned({ env: { ABUDDY_ROOT: root } })).resolves.toEqual({ kind: 'source', root });
  });

  // No path yields a production-stamped app: the target is a checkout or a Beta build, and that is what
  // keeps production's data dir and its `abuddy` keychain entry out of reach
  it('never resolves anything but a checkout or a beta build', async () => {
    for (const target of [await pinned(), await pinned({ flags: { app: 'beta', args: [] } })]) {
      expect(['source', 'packaged']).toContain(target.kind);
      if (target.kind === 'packaged') expect(target.version).toMatch(/beta/);
    }
  });
});

describe('resolveDevelopmentApp', () => {
  const resolve = (overrides: Partial<Parameters<typeof resolveDevelopmentApp>[0]> = {}) =>
    resolveDevelopmentApp({ flags: { args: [] }, hostVersion: '>=0.3.0', dirs, env: {}, interactive: false, prompt: noPrompt, betaApp: beta, ...overrides });

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

  // tests/scripts/test-packaged-authoring.sh writes this file itself rather than driving the prompt with
  // `expect` and a real tty, so the shape it writes is pinned here.
  it('writes the saved choice where the packaged-authoring script expects it', () => {
    saveAppChoice(dirs, { source: '/a/checkout' });
    const written = JSON.parse(fs.readFileSync(path.join(dirs.config, 'config.json'), 'utf-8'));
    expect(written).toEqual({ app: { source: '/a/checkout' } });
  });

  it("doesn't save a first-run beta choice that can't be satisfied, so the next run asks again", async () => {
    const unavailable = vi.fn(async () => { throw new Error('No AgentBuddy Beta release satisfies'); });
    await expect(resolve({ interactive: true, prompt: async () => '2', betaApp: unavailable })).rejects.toThrow(/No AgentBuddy Beta/);
    expect(readAppChoice(dirs)).toBeUndefined();
  });

  it('treats a malformed saved choice as none and expands ~ in checkout paths', async () => {
    fs.mkdirSync(dirs.config, { recursive: true });
    fs.writeFileSync(path.join(dirs.config, 'config.json'), JSON.stringify({ app: 'beta' }));
    expect(readAppChoice(dirs)).toBeUndefined();
    await expect(resolve()).rejects.toThrow(/No AgentBuddy app to develop against/);

    const home = os.homedir();
    const checkout = fs.mkdtempSync(path.join(home, '.abuddy-app-target-'));
    try {
      for (const dir of ['packages/main/dist', 'packages/renderer/dist', 'node_modules/electron']) fs.mkdirSync(path.join(checkout, dir), { recursive: true });
      fs.writeFileSync(path.join(checkout, 'packages', 'entry-point.mjs'), '');
      await expect(resolve({ flags: { appRoot: `~/${path.basename(checkout)}`, args: [] } }))
        .resolves.toEqual({ kind: 'source', root: checkout });
    } finally {
      fs.rmSync(checkout, { recursive: true, force: true });
    }
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

  // An empty ABUDDY_ROOT used to swallow a saved checkout and resolve nothing: the lookup read
  // `env.ABUDDY_ROOT ?? saved.source`, and '' is not nullish, so it won the `??` and then failed the
  // `if`. The two resolvers beside it had always treated '' as unset.
  it('treats an empty ABUDDY_ROOT as unset, as the resolvers do', async () => {
    const saved = makeCheckout('saved');
    saveAppChoice(dirs, { source: saved });
    expect((await configuredAppPackagesDir(opts({ ABUDDY_ROOT: '' })))?.dir).toBe(path.join(saved, 'packages'));
  });

  /**
   * The cache is what lets a build resolve built-in dependencies offline — `ensureBetaApp` lists releases
   * over the network before it will even look at the cache — so the range has to be checked here rather
   * than by downloading. It never was, and the newest cached build was used whatever the pack asked for.
   */
  describe('a saved beta choice, against the range the pack asks for', () => {
    const cacheBeta = (tag: string, appVersion?: string) => {
      const executable = packagedExecutable(path.join(dirs.cache, 'apps', 'beta', tag));
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, '');
      if (appVersion !== undefined) {
        const appDir = path.join(path.dirname(path.dirname(executable)), 'Resources', 'app');
        fs.mkdirSync(appDir, { recursive: true });
        fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ version: appVersion }));
      }
    };

    beforeEach(() => { saveAppChoice(dirs, { beta: true }); });

    it('skips a cached build the range excludes, and downloads nothing to do it', async () => {
      cacheBeta('0.5.0-beta.0');
      cacheBeta('0.4.0-beta.10');
      cacheBeta('0.4.0-beta.9');
      await expect(configuredAppPackagesDir({ dirs, env: {}, hostVersion: '^0.4.0-0', betaApp: beta }))
        .resolves.toMatchObject({ label: 'AgentBuddy Beta 0.4.0-beta.10' });
      expect(beta, 'the cache is the offline path; checking the range must not cost a download')
        .not.toHaveBeenCalled();
    });

    it('downloads when no cached build satisfies the range', async () => {
      cacheBeta('0.5.0-beta.0');
      await expect(configuredAppPackagesDir({ dirs, env: {}, hostVersion: '^0.4.0-0', betaApp: beta }))
        .resolves.toMatchObject({ label: 'AgentBuddy Beta 0.4.0-beta.2' });
      expect(beta).toHaveBeenCalledWith('^0.4.0-0', dirs.cache);
    });

    // A beta promoted from a released commit is tagged v<version>-beta.0 (build/release/beta-tag.sh)
    // while the app inside is <version>, and pickBetaRelease matched the range against the app. Matching
    // the directory name instead would reject this build on every run, for every pack whose floor is a
    // released version — and offline that is a build that fails rather than one that downloads.
    it('matches the app its own version, not the tag the cache directory is named after', async () => {
      cacheBeta('0.4.2-beta.0', '0.4.2');
      await expect(configuredAppPackagesDir({ dirs, env: {}, hostVersion: '>=0.4.2', betaApp: beta }))
        .resolves.toMatchObject({ label: 'AgentBuddy Beta 0.4.2-beta.0' });
      expect(beta).not.toHaveBeenCalled();
    });

    // hostVersion defaults to '*', and a prerelease satisfies no range without includePrerelease — '*'
    // included. Dropping that option would empty the cache for every pack that declares no hostVersion.
    it('still accepts a prerelease when the pack declares no hostVersion', async () => {
      cacheBeta('0.4.0-beta.10');
      await expect(configuredAppPackagesDir({ dirs, env: {}, betaApp: beta }))
        .resolves.toMatchObject({ label: 'AgentBuddy Beta 0.4.0-beta.10' });
      expect(beta).not.toHaveBeenCalled();
    });
  });
});

// ABUDDY_APP used to be read only where nothing outranked it, so a typo was an error during `build` and
// silence during `test` and `run` — and the two resolvers disagreed with each other on the same input.
describe('an unusable ABUDDY_APP', () => {
  const flags = { args: [] };
  it('is refused by both resolvers, whatever else names an app', async () => {
    const root = makeCheckout('env');
    for (const env of [{ ABUDDY_APP: 'nightly' }, { ABUDDY_APP: 'nightly', ABUDDY_ROOT: root }]) {
      await expect(resolvePinnedApp({ flags, hostVersion: '*', dirs, env, betaApp: beta }))
        .rejects.toThrow(/Unknown ABUDDY_APP "nightly"/);
      await expect(resolveDevelopmentApp({ flags, hostVersion: '*', dirs, env, betaApp: beta, interactive: false }))
        .rejects.toThrow(/Unknown ABUDDY_APP "nightly"/);
    }
  });

  it('is refused even when a flag would have won', async () => {
    await expect(resolvePinnedApp({
      flags: { app: 'beta', args: [] }, hostVersion: '*', dirs, env: { ABUDDY_APP: 'nightly' }, betaApp: beta,
    })).rejects.toThrow(/Unknown ABUDDY_APP "nightly"/);
  });
});

describe('fixtureEnv', () => {
  it('points the fixture at exactly one app', () => {
    const base = { ABUDDY_ROOT: '/stale', ABUDDY_APP_EXECUTABLE: '/stale-exe', ABUDDY_APP: 'beta', ELECTRON_RUN_AS_NODE: '1', HOME: '/home' };
    expect(fixtureEnv({ kind: 'packaged', executable: '/exe', version: '1.0.0-beta.0' }, '/pack', base))
      .toEqual({ ABUDDY_APP_EXECUTABLE: '/exe', ABUDDY_APP: 'beta', PACK_DIR: '/pack', ABUDDY_CLI: cliBin(), ELECTRON_RUN_AS_NODE: '1', HOME: '/home' });
    expect(fixtureEnv({ kind: 'source', root: '/repo' }, undefined, base))
      .toEqual({ ABUDDY_ROOT: '/repo', ABUDDY_CLI: cliBin(), ELECTRON_RUN_AS_NODE: '1', HOME: '/home' });
    expect(fs.existsSync(cliBin())).toBe(true);
  });

  // The executable says which app to launch; ABUDDY_APP says which app to resolve dependencies against,
  // and the fixture builds the pack. Without both, `--app beta` builds against whatever checkout was
  // saved on first run, and against nothing at all in CI.
  it('tells the fixture which app to resolve dependencies against, not just which to launch', () => {
    expect(fixtureEnv({ kind: 'packaged', executable: '/exe', version: '1.0.0-beta.0' }, '/pack', {}).ABUDDY_APP).toBe('beta');
    expect(fixtureEnv({ kind: 'source', root: '/repo' }, '/pack', { ABUDDY_APP: 'beta' })).not.toHaveProperty('ABUDDY_APP');
  });

  it('asks for a release build only when the caller does', () => {
    const app = { kind: 'source', root: '/repo' } as const;
    expect(fixtureEnv(app, '/pack', {}, { release: true }).ABUDDY_PACK_RELEASE).toBe('1');
    expect(fixtureEnv(app, '/pack', {})).not.toHaveProperty('ABUDDY_PACK_RELEASE');
    expect(fixtureEnv(app, '/pack', { ABUDDY_PACK_RELEASE: '1' })).not.toHaveProperty('ABUDDY_PACK_RELEASE');
  });

  it('never gives the runner the @abuddy/source condition: a pack resolves the published dist', () => {
    const app = { kind: 'source', root: '/repo' } as const;
    // The caller's own flags survive; the condition does not, however the run was started
    expect(fixtureEnv(app, undefined, { NODE_OPTIONS: '--max-old-space-size=4096' }).NODE_OPTIONS)
      .toBe('--max-old-space-size=4096');
    expect(fixtureEnv(app, undefined, { NODE_OPTIONS: '--conditions=@abuddy/source --max-old-space-size=4096' }).NODE_OPTIONS)
      .toBe('--max-old-space-size=4096');
    expect(fixtureEnv(app, undefined, { NODE_OPTIONS: '--conditions=@abuddy/source' })).not.toHaveProperty('NODE_OPTIONS');
  });
});

