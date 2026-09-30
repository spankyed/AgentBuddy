import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import envPaths from 'env-paths';
import semver from 'semver';
import { ensureBetaApp, packagedExecutable, type PackagedApp } from './beta-app';

/** An app to launch a pack in: a built monorepo checkout, or a packaged app build. */
export type AppTarget =
  | { kind: 'source'; root: string }
  | { kind: 'packaged'; executable: string; version: string };

/** What the author chose on first run, stored in the user config dir. */
export type AppChoice = { source: string } | { beta: true };

export interface CliDirs {
  config: string;
  cache: string;
  /** Machine state the CLI owns and the app does not: today, the instances `abuddy run` creates */
  data: string;
}

export function cliDirs(): CliDirs {
  const paths = envPaths('abuddy-cli', { suffix: '' });
  return { config: paths.config, cache: paths.cache, data: paths.data };
}

const configFile = (dirs: CliDirs) => path.join(dirs.config, 'config.json');

export function readAppChoice(dirs: CliDirs): AppChoice | undefined {
  try {
    const app = JSON.parse(fs.readFileSync(configFile(dirs), 'utf-8')).app;
    // Anything else (hand-edited, older format) counts as no choice: ask again
    if (app && typeof app === 'object' && (typeof app.source === 'string' || app.beta === true)) return app;
  } catch {}
  return undefined;
}

/** `~/AgentBuddy` → the home directory's AgentBuddy. */
export function expandHome(input: string): string {
  return input === '~' || input.startsWith('~/') ? path.join(os.homedir(), input.slice(1)) : input;
}

export function saveAppChoice(dirs: CliDirs, app: AppChoice): void {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(fs.readFileSync(configFile(dirs), 'utf-8'));
  } catch {}
  fs.mkdirSync(dirs.config, { recursive: true });
  fs.writeFileSync(configFile(dirs), JSON.stringify({ ...config, app }, null, 2) + '\n');
}

/** Missing pieces of a monorepo checkout needed to launch a pack in it; empty when usable. */
export function sourceAppProblems(root: string): string[] {
  const problems: string[] = [];
  if (!fs.existsSync(path.join(root, 'packages', 'entry-point.mjs'))) return ['not an AgentBuddy checkout (no packages/entry-point.mjs)'];
  if (!fs.existsSync(path.join(root, 'node_modules', 'electron'))) problems.push('node_modules/electron is missing (run npm install)');
  for (const pkg of ['main', 'renderer']) {
    if (!fs.existsSync(path.join(root, 'packages', pkg, 'dist'))) problems.push(`packages/${pkg}/dist is missing (run npm run build)`);
  }
  return problems;
}

function sourceTarget(root: string, from: string): AppTarget {
  const resolved = path.resolve(expandHome(root));
  const problems = sourceAppProblems(resolved);
  if (problems.length > 0) {
    throw new Error(`${from} (${resolved}) can't be used:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
  return { kind: 'source', root: resolved };
}

/** The app package inside a packaged build, which electron-builder ships unpacked (`asar: false`). */
function packagedAppDir(executable: string): string {
  return path.join(path.dirname(path.dirname(executable)), 'Resources', 'app');
}

/** Packaged apps ship each package's dist dir (electron-builder.mjs) next to the app code. */
export function packagedAppPackagesDir(executable: string): string {
  return path.join(packagedAppDir(executable), 'packages');
}

/** What a packaged build says its own version is, beside the packages dir above. */
function packagedAppVersion(executable: string): string | undefined {
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(packagedAppDir(executable), 'package.json'), 'utf-8'));
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/** ABUDDY_APP: the env form of `--app`, for CI (`ABUDDY_APP=beta`). */
function appFromEnv(env: NodeJS.ProcessEnv): 'beta' | undefined {
  if (env.ABUDDY_APP === undefined || env.ABUDDY_APP === '') return undefined;
  if (env.ABUDDY_APP !== 'beta') throw new Error(`Unknown ABUDDY_APP "${env.ABUDDY_APP}" (supported: beta)`);
  return 'beta';
}

/** What every lookup here needs: where to look, and how to reach a beta when the answer is one. */
export interface AppLookupOptions {
  dirs?: CliDirs;
  env?: NodeJS.ProcessEnv;
  /** The pack's hostVersion, for choosing or downloading a beta */
  hostVersion?: string;
  /** Injected for tests; defaults to ensureBetaApp. */
  betaApp?: (hostVersion: string, cacheDir: string) => Promise<PackagedApp>;
}

export type ConfiguredAppOptions = AppLookupOptions;

const betaAppFrom = (options: AppLookupOptions) =>
  options.betaApp ?? ((range: string, cacheDir: string) => ensureBetaApp({ hostVersion: range, cacheDir }));

/** A place an app can be named; `from` is what an error message calls it. */
interface NamedApp {
  choice: AppChoice;
  from: string;
  /**
   * The stored preference rather than something asked for on this run. It may be answered from the
   * download cache where an explicit `ABUDDY_APP=beta` is not — see `configuredAppPackagesDir`.
   */
  stored?: boolean;
}

/** The stored preference as a named app, labelled for the errors `sourceTarget` throws. */
function savedApp(dirs: CliDirs): NamedApp | undefined {
  const saved = readAppChoice(dirs);
  return saved && { choice: saved, from: `The saved app root in ${configFile(dirs)}`, stored: true };
}

/**
 * Where an app can be named, in precedence order — the one place that order is written. It used to be
 * written once per caller, and two of the three spelled the same rule differently: one ordered the
 * checks, the other kept beta out of the ABUDDY_ROOT branch with a negative guard.
 *
 * `saved` is the caller's policy rather than something this reads, so a pinned run passes nothing. That
 * argument is what "consults no machine state" looks like at the call site, where it used to be the
 * absence of a line.
 */
function namedApp(flags: AppFlags | undefined, env: NodeJS.ProcessEnv, saved?: NamedApp): NamedApp | undefined {
  // Read before anything can outrank it, so a typo'd value is refused wherever it sits. It used to be
  // short-circuited in the resolvers, which made `ABUDDY_APP=nightly` an error during `build` and
  // silence during `test` whenever --app-root or --app beta won.
  const envApp = appFromEnv(env);
  if (flags?.appRoot) return { choice: { source: flags.appRoot }, from: '--app-root' };
  if (flags?.app === 'beta') return { choice: { beta: true }, from: '--app beta' };
  if (envApp === 'beta') return { choice: { beta: true }, from: 'ABUDDY_APP=beta' };
  if (env.ABUDDY_ROOT) return { choice: { source: env.ABUDDY_ROOT }, from: 'ABUDDY_ROOT' };
  return saved;
}

/**
 * The built-in packs directory of the app `abuddy build` resolves dependencies through: ABUDDY_APP=beta
 * (downloaded when needed), ABUDDY_ROOT, or the saved choice (a checkout, or the newest
 * downloaded beta, downloading one if none is cached). Never prompts. Lets a pack resolve
 * dependencies on built-in packs before the app has ever run, including in CI.
 *
 * It reads the saved choice where `resolvePinnedApp` refuses to, and the difference is that this one
 * cannot surprise anyone: it never prompts and never writes a choice, so the preference it reads is one
 * some other command was asked to hold. Pinning it instead would make every author's `build` download a
 * beta, or set ABUDDY_ROOT on each invocation, to reach the checkout they already named once.
 */
export async function configuredAppPackagesDir(options: ConfiguredAppOptions = {}): Promise<{ dir: string; label: string } | null> {
  const { dirs = cliDirs(), env = process.env, hostVersion = '*' } = options;
  const betaApp = betaAppFrom(options);
  const downloaded = async () => {
    const app = await betaApp(hostVersion, dirs.cache);
    return { dir: packagedAppPackagesDir(app.executable), label: `AgentBuddy Beta ${app.version}` };
  };

  const named = namedApp(undefined, env, savedApp(dirs));
  if (!named) return null;

  if ('source' in named.choice) {
    // No `sourceAppProblems` here, and that is the point of the branch being its own: a build reads the
    // checkout's `packages/`, where launching it needs main/dist, renderer/dist and electron. Validating
    // would fail `abuddy build` on a checkout nobody has run `npm run build` in.
    const root = path.resolve(expandHome(named.choice.source));
    return { dir: path.join(root, 'packages'), label: `AgentBuddy checkout ${root}` };
  }

  // A beta asked for on this run is fetched; the stored one may be answered from the cache, which is what
  // lets a build work offline — `ensureBetaApp` lists releases over the network before it looks at the
  // cache at all, so calling it here would put a round trip in every build.
  if (!named.stored) return downloaded();
  return cachedBeta(dirs, hostVersion) ?? await downloaded();
}

/**
 * The newest already-downloaded beta the pack's range accepts, or nothing. The range check is the half
 * this lacked: it took the newest cached build whatever the pack asked for, so a pack pinned to an older
 * host resolved its dependency types from a newer one, silently.
 *
 * **It matches on the app's own version, not the directory's name**, because those differ by design. A
 * beta promoted from a production release is tagged `v0.4.2-beta.0` on the released commit
 * (`build/release/beta-tag.sh`) while the app inside is `0.4.2`, and the cache directory is named after
 * the tag where `pickBetaRelease` matched the range against the app. Matching the directory name would
 * reject that build for every pack whose floor is a released version, on every build, and the fallback is
 * not a free round trip — `ensureBetaApp` needs the network before it will look at the cache at all, so
 * offline it turns a build that worked into one that fails.
 */
function cachedBeta(dirs: CliDirs, hostVersion: string): { dir: string; label: string } | null {
  const betaDir = path.join(dirs.cache, 'apps', 'beta');
  const tags = (fs.existsSync(betaDir) ? fs.readdirSync(betaDir) : [])
    // A version appears only once fully extracted: ensureBetaApp renames it into place, and stages under
    // a dot-prefixed name that fails this
    .filter(tag => semver.valid(tag))
    .sort(semver.rcompare);

  for (const tag of tags) {
    const executable = packagedExecutable(path.join(betaDir, tag));
    const version = packagedAppVersion(executable) ?? tag;
    // `includePrerelease` as pickBetaRelease passes it, and load-bearing rather than tidy: without it a
    // beta satisfies no range at all, `*` included — which is what a pack declaring no hostVersion gets,
    // so omitting it would empty the cache for most packs
    if (semver.satisfies(version, hostVersion, { includePrerelease: true })) {
      return { dir: packagedAppPackagesDir(executable), label: `AgentBuddy Beta ${tag}` };
    }
  }
  return null;
}

export interface AppFlags {
  appRoot?: string;
  app?: string;
  /** Build the pack as a release before testing it, so the tests run what a release ships */
  release?: boolean;
  args: string[];
}

/** Pulls `--app-root <path>`, `--app <beta>` and `--release` out of the args forwarded to Playwright. */
export function parseAppFlags(argv: string[]): AppFlags {
  const flags: AppFlags = { args: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg];
    if (name === '--app-root' || name === '--app') {
      const value = inline ?? argv[++i];
      if (!value) throw new Error(`${name} needs a value`);
      if (name === '--app-root') flags.appRoot = value;
      else flags.app = value;
    } else if (name === '--release') {
      flags.release = true;
    } else {
      flags.args.push(arg);
    }
  }
  if (flags.app !== undefined && flags.app !== 'beta') throw new Error(`Unknown --app "${flags.app}" (supported: beta)`);
  return flags;
}

export interface ResolveAppOptions extends AppLookupOptions {
  flags: AppFlags;
  hostVersion: string;
  interactive?: boolean;
  /** Asks the first-run question; injected for tests. */
  prompt?: (question: string) => Promise<string>;
}

/** The Beta build the pack's `hostVersion` asks for, downloaded if it isn't cached. */
async function packagedTarget(options: ResolveAppOptions): Promise<AppTarget> {
  const { hostVersion, dirs = cliDirs() } = options;
  return { kind: 'packaged', ...(await betaAppFrom(options)(hostVersion, dirs.cache)) };
}

/** One readline for the whole conversation: answers typed ahead are buffered, not lost between questions. */
async function withTerminalPrompt<T>(fn: (prompt: (question: string) => Promise<string>) => Promise<T>): Promise<T> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // The line iterator queues lines as they arrive; rl.question drops lines typed before it's asked
  const lines = rl[Symbol.asyncIterator]();
  try {
    return await fn(async question => {
      process.stdout.write(question);
      const { value, done } = await lines.next();
      if (done) throw new Error('No answer: input closed');
      return value.trim();
    });
  } finally {
    rl.close();
  }
}

/**
 * The app a run is *pinned* to: the flags, the environment, then the Beta build the pack's `hostVersion`
 * asks for. **It never prompts and never reads the saved choice.**
 *
 * That separation is the point. `resolveTestApp` used to fall through to `~/.config/abuddy-cli/config.json`
 * and, in a terminal, to a question whose answer it then persisted — so a pack's test result depended on
 * what someone typed once on that machine, and two authors on one commit could be testing different app
 * builds. The data layer was never the problem: the fixture always takes a fresh `mkdtemp` and forces
 * `env: 'test'`, which is why this hid for so long — the isolation people check for is real, one layer
 * below where the leak was.
 *
 * Removing the config read leaves no hole, because the pinned answer already existed: `--app beta`
 * computes it from the manifest. The saved choice was shadowing a correct default, not supplying a
 * missing one.
 *
 * `resolveDevelopmentApp` below is the other half, for the commands whose job *is* to hold a preference.
 */
export async function resolvePinnedApp(options: ResolveAppOptions): Promise<AppTarget> {
  const { flags, env = process.env } = options;

  const named = namedApp(flags, env, undefined);
  if (named && 'source' in named.choice) return sourceTarget(named.choice.source, named.from);
  // The default, not just the `--app beta` case: a pinned run always has an answer, from the manifest
  return packagedTarget(options);
}

/**
 * Which app to develop against, in order: --app-root / --app flags, ABUDDY_ROOT, the saved
 * choice, then (interactive terminals only) a first-run prompt whose answer is saved.
 * CI never prompts: without one of the above it fails with the options.
 *
 * Holding a preference is this function's job and nothing else's — see `resolvePinnedApp`.
 */
export async function resolveDevelopmentApp(options: ResolveAppOptions): Promise<AppTarget> {
  const { flags, dirs = cliDirs(), env = process.env } = options;
  const interactive = options.interactive ?? (Boolean(process.stdin.isTTY) && !env.CI);

  const named = namedApp(flags, env, savedApp(dirs));
  if (named) {
    return 'source' in named.choice ? sourceTarget(named.choice.source, named.from) : packagedTarget(options);
  }

  if (!interactive) {
    throw new Error(
      'No AgentBuddy app to develop against. Pass one of:\n' +
      '  --app-root <path>   a local AgentBuddy checkout (installed and built)\n' +
      '  --app beta          the newest AgentBuddy Beta build that satisfies the pack\'s hostVersion\n' +
      'or set ABUDDY_APP=beta or ABUDDY_ROOT. Run it in a terminal once to save a default.',
    );
  }

  const choice = await (options.prompt ? askForApp(options.prompt, dirs) : withTerminalPrompt(prompt => askForApp(prompt, dirs)));
  if ('source' in choice) return { kind: 'source', root: choice.source };
  // Saved only once a beta is actually available here, so a failed first choice asks again next run
  const app = await packagedTarget(options);
  saveAppChoice(dirs, choice);
  console.log(`Saved to ${configFile(dirs)}`);
  return app;
}

async function askForApp(prompt: (question: string) => Promise<string>, dirs: CliDirs): Promise<AppChoice> {
  console.log('Which AgentBuddy app should your pack run in?');
  console.log('  1) A local AgentBuddy checkout (installed and built)');
  console.log('  2) The newest AgentBuddy Beta build (downloaded and cached)');
  for (;;) {
    const answer = await prompt('Choose 1 or 2: ');
    if (answer === '2') return { beta: true };
    if (answer === '1') {
      const root = path.resolve(expandHome(await prompt('Path to the AgentBuddy checkout: ')));
      const problems = sourceAppProblems(root);
      if (problems.length > 0) {
        console.log(`${root} can't be used:\n${problems.map(p => `  - ${p}`).join('\n')}`);
        continue;
      }
      saveAppChoice(dirs, { source: root });
      console.log(`Saved to ${configFile(dirs)}`);
      return { source: root };
    }
  }
}
