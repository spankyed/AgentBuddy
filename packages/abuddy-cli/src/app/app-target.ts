import * as fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import envPaths from 'env-paths';
import { ensureBetaApp, type PackagedApp } from './beta-app';

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
    return JSON.parse(fs.readFileSync(configFile(dirs), 'utf-8')).app;
  } catch {
    return undefined;
  }
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
  const resolved = path.resolve(root);
  const problems = sourceAppProblems(resolved);
  if (problems.length > 0) {
    throw new Error(`${from} (${resolved}) can't be used:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
  return { kind: 'source', root: resolved };
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

async function askOnce(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
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
  const prompt = options.prompt ?? askOnce;
  const betaApp = options.betaApp ?? ((range, cacheDir) => ensureBetaApp({ hostVersion: range, cacheDir }));
  const packaged = async (): Promise<AppTarget> => ({ kind: 'packaged', ...(await betaApp(hostVersion, dirs.cache)) });

  if (flags.appRoot) return sourceTarget(flags.appRoot, '--app-root');
  if (flags.app === 'beta') return packaged();
  if (env.ABUDDY_ROOT) return sourceTarget(env.ABUDDY_ROOT, 'ABUDDY_ROOT');

  const saved = readAppChoice(dirs);
  if (saved && 'source' in saved) return sourceTarget(saved.source, `The saved app root in ${configFile(dirs)}`);
  if (saved && 'beta' in saved) return packaged();

  if (!interactive) {
    throw new Error(
      'No AgentBuddy app to test against. Pass one of:\n' +
      '  --app-root <path>   a local AgentBuddy checkout (installed and built)\n' +
      '  --app beta          the newest AgentBuddy Beta build that satisfies the pack\'s hostVersion\n' +
      'or set ABUDDY_ROOT. Run `abuddy test` in a terminal once to save a default.',
    );
  }

  console.log('Which AgentBuddy app should `abuddy test` run your pack in?');
  console.log('  1) A local AgentBuddy checkout (installed and built)');
  console.log('  2) The newest AgentBuddy Beta build (downloaded and cached)');
  for (;;) {
    const answer = await prompt('Choose 1 or 2: ');
    if (answer === '2') {
      saveAppChoice(dirs, { beta: true });
      console.log(`Saved to ${configFile(dirs)}`);
      return packaged();
    }
    if (answer === '1') {
      const root = path.resolve(await prompt('Path to the AgentBuddy checkout: '));
      const problems = sourceAppProblems(root);
      if (problems.length > 0) {
        console.log(`${root} can't be used:\n${problems.map(p => `  - ${p}`).join('\n')}`);
        continue;
      }
      saveAppChoice(dirs, { source: root });
      console.log(`Saved to ${configFile(dirs)}`);
      return { kind: 'source', root };
    }
  }
}
