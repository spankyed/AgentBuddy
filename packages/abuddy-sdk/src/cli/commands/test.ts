import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureSdkLink } from '../utils';

export async function test(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'playwright.config.ts'))) {
    console.error('No playwright.config.ts found. Run `abuddy init-tests` first.');
    process.exit(1);
  }

  if (!process.env.ABUDDY_ROOT) {
    console.error('ABUDDY_ROOT is not set.');
    console.error('Point it to your local AgentBuddy monorepo clone (installed + built):');
    console.error('  export ABUDDY_ROOT=/path/to/AgentBuddy');
    process.exit(1);
  }

  const appRoot = path.resolve(process.env.ABUDDY_ROOT);
  if (!fs.existsSync(path.join(appRoot, 'packages', 'entry-point.mjs'))) {
    console.error(`ABUDDY_ROOT (${appRoot}) does not look like an AgentBuddy monorepo.`);
    console.error('Expected to find packages/entry-point.mjs');
    process.exit(1);
  }

  ensureSdkLink(cwd);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ABUDDY_ROOT: appRoot,
  };

  if (fs.existsSync(path.join(cwd, 'abuddy.json'))) {
    env.PACK_DIR = cwd;
  }

  const playwrightArgs = ['playwright', 'test', ...args];

  try {
    execFileSync('npx', playwrightArgs, { cwd, env, stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}
