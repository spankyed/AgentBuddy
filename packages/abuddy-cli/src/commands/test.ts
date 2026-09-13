import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseTestAppFlags, resolveTestApp, type AppTarget } from '../app/app-target';
import { resolvePlaywrightCli } from '../app/playwright';
import { cliBin } from '../utils';

export const TEST_USAGE = `Usage: abuddy test [--app-root <path> | --app beta] [playwright args...]

Runs the pack's Playwright tests in AgentBuddy. The app is, in order: --app-root (a local
AgentBuddy checkout), --app beta (the newest AgentBuddy Beta build satisfying the pack's
hostVersion, downloaded and cached), ABUDDY_ROOT, or the app you chose on first run.`;

/** Env the @abuddy/testing fixture reads to launch the app and install the pack. */
export function fixtureEnv(app: AppTarget, packDir: string | undefined, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  delete env.ABUDDY_ROOT;
  delete env.ABUDDY_APP_EXECUTABLE;
  if (app.kind === 'source') env.ABUDDY_ROOT = app.root;
  else env.ABUDDY_APP_EXECUTABLE = app.executable;
  if (packDir) env.PACK_DIR = packDir;
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

  const manifestPath = path.join(cwd, 'abuddy.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : undefined;

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

  console.log(app.kind === 'source' ? `Testing in AgentBuddy from ${app.root}` : `Testing in AgentBuddy Beta ${app.version}`);
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...flags.args], {
    cwd,
    env: fixtureEnv(app, manifest ? cwd : undefined, process.env),
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
