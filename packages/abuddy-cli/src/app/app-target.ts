import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import envPaths from 'env-paths';
import semver from 'semver';
import { ensureBetaApp, packagedExecutable, type PackagedApp } from './beta-app';

/** The app `abuddy test` launches: a built monorepo checkout, or a packaged app build. */
export type AppTarget =
  | { kind: 'source'; root: string }
  | { kind: 'packaged'; executable: string; version: string };

/** What the author chose on first run, stored in the user config dir. */
export type AppChoice = { source: string } | { beta: true };

export interface CliDirs {
  config: string;
  cache: string;
}

export function cliDirs(): CliDirs {
  const paths = envPaths('abuddy-cli', { suffix: '' });
  return { config: paths.config, cache: paths.cache };
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

/** Missing pieces of a monorepo checkout that `abuddy test` needs; empty when usable. */
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

/** Packaged apps ship each package's dist dir (electron-builder.mjs) next to the app code. */
export function packagedAppPackagesDir(executable: string): string {
  return path.join(path.dirname(path.dirname(executable)), 'Resources', 'app', 'packages');
}

/** ABUDDY_APP: the env form of `--app`, for CI (`ABUDDY_APP=beta`). */
function appFromEnv(env: NodeJS.ProcessEnv): 'beta' | undefined {
  if (env.ABUDDY_APP === undefined || env.ABUDDY_APP === '') return undefined;
  if (env.ABUDDY_APP !== 'beta') throw new Error(`Unknown ABUDDY_APP "${env.ABUDDY_APP}" (supported: beta)`);
  return 'beta';
}

export interface ConfiguredAppOptions {
  dirs?: CliDirs;
  env?: NodeJS.ProcessEnv;
  /** The pack's hostVersion, when a beta has to be downloaded */
  hostVersion?: string;
  betaApp?: (hostVersion: string, cacheDir: string) => Promise<PackagedApp>;
}

/**
 * The built-in packs directory of the app configured for `abuddy test`: ABUDDY_APP=beta
 * (downloaded when needed), ABUDDY_ROOT, or the saved choice (a checkout, or the newest
 * downloaded beta, downloading one if none is cached). Never prompts. Lets a pack resolve
 * dependencies on built-in packs before the app has ever run, including in CI.
 */
export async function configuredAppPackagesDir(options: ConfiguredAppOptions = {}): Promise<{ dir: string; label: string } | null> {
  const { dirs = cliDirs(), env = process.env, hostVersion = '*' } = options;
  const betaApp = options.betaApp ?? ((range, cacheDir) => ensureBetaApp({ hostVersion: range, cacheDir }));
  const downloaded = async () => {
    const app = await betaApp(hostVersion, dirs.cache);
    return { dir: packagedAppPackagesDir(app.executable), label: `AgentBuddy Beta ${app.version}` };
  };

  if (appFromEnv(env) === 'beta') return downloaded();
  const saved = readAppChoice(dirs);
  const root = env.ABUDDY_ROOT ?? (saved && 'source' in saved ? saved.source : undefined);
  if (root) return { dir: path.join(path.resolve(root), 'packages'), label: `AgentBuddy checkout ${path.resolve(root)}` };

  if (saved && 'beta' in saved) {
    const betaDir = path.join(dirs.cache, 'apps', 'beta');
    const newest = (fs.existsSync(betaDir) ? fs.readdirSync(betaDir) : [])
      // Versions appear only once fully extracted (ensureBetaApp renames them into place)
      .filter(version => semver.valid(version))
      .sort(semver.rcompare)[0];
    if (!newest) return downloaded();
    return { dir: packagedAppPackagesDir(packagedExecutable(path.join(betaDir, newest))), label: `AgentBuddy Beta ${newest}` };
  }
  return null;
}

export interface TestAppFlags {
  appRoot?: string;
  app?: string;
  args: string[];
}

/** Pulls `--app-root <path>` and `--app <beta>` out of the args forwarded to Playwright. */
export function parseTestAppFlags(argv: string[]): TestAppFlags {
  const flags: TestAppFlags = { args: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg];
    if (name === '--app-root' || name === '--app') {
      const value = inline ?? argv[++i];
      if (!value) throw new Error(`${name} needs a value`);
      if (name === '--app-root') flags.appRoot = value;
      else flags.app = value;
    } else {
      flags.args.push(arg);
    }
  }
  if (flags.app !== undefined && flags.app !== 'beta') throw new Error(`Unknown --app "${flags.app}" (supported: beta)`);
  return flags;
}

export interface ResolveAppOptions {
  flags: TestAppFlags;
  hostVersion: string;
  dirs?: CliDirs;
  env?: NodeJS.ProcessEnv;
  interactive?: boolean;
  /** Asks the first-run question; injected for tests. */
  prompt?: (question: string) => Promise<string>;
  /** Injected for tests; defaults to ensureBetaApp. */
  betaApp?: (hostVersion: string, cacheDir: string) => Promise<PackagedApp>;
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
 * Which app to test against, in order: --app-root / --app flags, ABUDDY_ROOT, the saved
 * choice, then (interactive terminals only) a first-run prompt whose answer is saved.
 * CI never prompts: without one of the above it fails with the options.
 */
export async function resolveTestApp(options: ResolveAppOptions): Promise<AppTarget> {
  const { flags, hostVersion, dirs = cliDirs(), env = process.env } = options;
  const interactive = options.interactive ?? (Boolean(process.stdin.isTTY) && !env.CI);
  const betaApp = options.betaApp ?? ((range, cacheDir) => ensureBetaApp({ hostVersion: range, cacheDir }));
  const packaged = async (): Promise<AppTarget> => ({ kind: 'packaged', ...(await betaApp(hostVersion, dirs.cache)) });

  if (flags.appRoot) return sourceTarget(flags.appRoot, '--app-root');
  if (flags.app === 'beta' || appFromEnv(env) === 'beta') return packaged();
  if (env.ABUDDY_ROOT) return sourceTarget(env.ABUDDY_ROOT, 'ABUDDY_ROOT');

  const saved = readAppChoice(dirs);
  if (saved && 'source' in saved) return sourceTarget(saved.source, `The saved app root in ${configFile(dirs)}`);
  if (saved && 'beta' in saved) return packaged();

  if (!interactive) {
    throw new Error(
      'No AgentBuddy app to test against. Pass one of:\n' +
      '  --app-root <path>   a local AgentBuddy checkout (installed and built)\n' +
      '  --app beta          the newest AgentBuddy Beta build that satisfies the pack\'s hostVersion\n' +
      'or set ABUDDY_APP=beta or ABUDDY_ROOT. Run `abuddy test` in a terminal once to save a default.',
    );
  }

  const choice = await (options.prompt ? askForApp(options.prompt, dirs) : withTerminalPrompt(prompt => askForApp(prompt, dirs)));
  if ('source' in choice) return { kind: 'source', root: choice.source };
  // Saved only once a beta is actually available here, so a failed first choice asks again next run
  const app = await packaged();
  saveAppChoice(dirs, choice);
  console.log(`Saved to ${configFile(dirs)}`);
  return app;
}

async function askForApp(prompt: (question: string) => Promise<string>, dirs: CliDirs): Promise<AppChoice> {
  console.log('Which AgentBuddy app should `abuddy test` run your pack in?');
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
