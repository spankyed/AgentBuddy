import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseTestAppFlags, resolveTestApp, type AppTarget } from '../app/app-target';
import { resolvePlaywrightCli } from '../app/playwright';
import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';
import { cliBin, readManifest, resolveVitestCli } from '../utils';
import { VITEST_CONFIG_FILES } from './init.ts';

export const TEST_USAGE = `Usage: abuddy test [--app-root <path> | --app beta] [--release] [playwright args...]
       abuddy test --contract [vitest args...]

Runs the pack's Playwright tests in AgentBuddy. The app is, in order: --app-root (a local
AgentBuddy checkout), --app beta (the newest AgentBuddy Beta build satisfying the pack's
hostVersion, downloaded and cached), ABUDDY_ROOT, or the app you chose on first run.

--release builds the pack the way a release does, so the tests run the artifact that ships.
\`abuddy release\` passes it; on its own the default build is the faster one to debug.

--contract runs the pack's vitest instead, and starts no app: the checks that read compiled
output, generated types and the harness. Nothing to download, nothing to build but the pack.`;

/**
 * Env the @abuddy/testing fixture reads to launch the app and install the pack. The runner gets
 * the @abuddy/source condition only when @abuddy/testing is a checkout's source.
 */
export function fixtureEnv(
  app: AppTarget,
  packDir: string | undefined,
  base: NodeJS.ProcessEnv,
  options: { release?: boolean } = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  // A pack resolves the packages' published dist, whoever runs it: the condition never reaches this run,
  // even when the caller had it (npm test in a checkout)
  const nodeOptions = withoutSourceCondition(base.NODE_OPTIONS);
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;
  delete env.ABUDDY_ROOT;
  // ELECTRON_RUN_AS_NODE (app-bundled launcher) stays: the runner and its workers run on
  // process.execPath. The fixture drops it for the app it launches (appLaunchEnv).
  delete env.ABUDDY_APP_EXECUTABLE;
  // ABUDDY_APP as well as the executable: the fixture builds the pack, and resolving its dependencies
  // on built-in packs reads the app choice, not the launch target. Without it a `--app beta` run
  // resolves against whatever checkout was saved on first run, or finds nothing at all in CI.
  delete env.ABUDDY_APP;
  if (app.kind === 'source') env.ABUDDY_ROOT = app.root;
  else {
    env.ABUDDY_APP_EXECUTABLE = app.executable;
    env.ABUDDY_APP = 'beta';
  }
  if (packDir) env.PACK_DIR = packDir;
  if (options.release) env.ABUDDY_PACK_RELEASE = '1';
  else delete env.ABUDDY_PACK_RELEASE;
  // The fixture builds the pack with this same CLI
  env.ABUDDY_CLI = cliBin();
  return env;
}

/**
 * The pack's own vitest, with no app. A pack author can check compiled output, generated types and the
 * harness specs without an AgentBuddy to run them in — which is the same split the repo's own chain makes
 * between its contract tier and its app tier, offered to packs rather than kept for this repo.
 */
export interface ContractRunner {
  /** Returns the runner's exit status; `null` means it did not exit normally */
  (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }): number | null;
}

const spawnContract: ContractRunner = (command, args, options) =>
  spawnSync(command, [...args], { ...options, stdio: 'inherit' }).status;

export async function contractTest(cwd: string, args: string[], run: ContractRunner = spawnContract): Promise<void> {
  if (!VITEST_CONFIG_FILES.some((file) => fs.existsSync(path.join(cwd, file)))) {
    console.log('No vitest config in this pack, so there are no contract checks to run. `abuddy init-tests` scaffolds one.');
    return;
  }
  // The harness this run loads is built from the checkout's source, so bring it up to date first
  ensureCheckoutPackages(cwd);
  // A pack resolves the packages' published dist, whoever runs it — the same rule the Playwright half
  // follows, and the reason a checkout's own condition must not reach this run
  const env: NodeJS.ProcessEnv = { ...process.env };
  const nodeOptions = withoutSourceCondition(process.env.NODE_OPTIONS);
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;
  env.ABUDDY_CLI = cliBin();

  const status = run(process.execPath, [resolveVitestCli(cwd), 'run', '--root', cwd, ...args], { cwd, env });
  if (status !== 0) throw new Error(`Contract tests failed (vitest exited ${status ?? 'without a status'})`);
}

export async function test(args: string[], run?: ContractRunner): Promise<void> {
  if (args.includes('--help')) {
    console.log(TEST_USAGE);
    return;
  }
  const cwd = process.cwd();

  if (args.includes('--contract')) return contractTest(cwd, args.filter((arg) => arg !== '--contract'), run);

  if (!fs.existsSync(path.join(cwd, 'playwright.config.ts'))) {
    throw new Error('No playwright.config.ts found. Run `abuddy init-tests` first.');
  }

  const manifest = fs.existsSync(path.join(cwd, 'abuddy.json')) ? readManifest(cwd) : undefined;

  const flags = parseTestAppFlags(args);
  const playwrightCli = resolvePlaywrightCli(cwd);
  const app = await resolveTestApp({ flags, hostVersion: manifest?.hostVersion ?? '*' });

  // The harness bundle this run loads is built from the checkout's source, so bring it up to date first
  ensureCheckoutPackages(cwd);

  console.log(app.kind === 'source' ? `Testing in AgentBuddy from ${app.root}` : `Testing in AgentBuddy Beta ${app.version}`);
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...flags.args], {
    cwd,
    env: fixtureEnv(app, manifest ? cwd : undefined, process.env, { release: flags.release }),
    stdio: 'inherit',
  });
  // Thrown, not exited: `abuddy release` calls this, and an exit here skipped the message telling the
  // author their version files are already bumped. The CLI's dispatcher prints the message and exits 1.
  if (result.status !== 0) throw new Error(`E2E tests failed (Playwright exited ${result.status ?? 'without a status'})`);
}
