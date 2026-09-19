import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseTestAppFlags, resolveTestApp, type AppTarget } from '../app/app-target';
import { resolvePlaywrightCli } from '../app/playwright';
import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';
import { cliBin, readManifest } from '../utils';

export const TEST_USAGE = `Usage: abuddy test [--app-root <path> | --app beta] [--release] [playwright args...]

Runs the pack's Playwright tests in AgentBuddy. The app is, in order: --app-root (a local
AgentBuddy checkout), --app beta (the newest AgentBuddy Beta build satisfying the pack's
hostVersion, downloaded and cached), ABUDDY_ROOT, or the app you chose on first run.

--release builds the pack the way a release does, so the tests run the artifact that ships.
\`abuddy release\` passes it; on its own the default build is the faster one to debug.`;

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

export async function test(args: string[]): Promise<void> {
  if (args.includes('--help')) {
    console.log(TEST_USAGE);
    return;
  }
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'playwright.config.ts'))) {
    console.error('No playwright.config.ts found. Run `abuddy init-tests` first.');
    process.exit(1);
  }

  const manifest = fs.existsSync(path.join(cwd, 'abuddy.json')) ? readManifest(cwd) : undefined;

  let app: AppTarget;
  let playwrightCli: string;
  let flags;
  try {
    flags = parseTestAppFlags(args);
    playwrightCli = resolvePlaywrightCli(cwd);
    app = await resolveTestApp({ flags, hostVersion: manifest?.hostVersion ?? '*' });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // The harness bundle this run loads is built from the checkout's source, so bring it up to date first
  try {
    ensureCheckoutPackages(cwd);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  console.log(app.kind === 'source' ? `Testing in AgentBuddy from ${app.root}` : `Testing in AgentBuddy Beta ${app.version}`);
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...flags.args], {
    cwd,
    env: fixtureEnv(app, manifest ? cwd : undefined, process.env, { release: flags.release }),
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
