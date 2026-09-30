/**
 * `abuddy drive` — run the app and poke at it.
 *
 * Driving is looking at what you built: clicking through it, firing an event, taking a screenshot.
 *
 * **Mainly this is for an agent.** It is how a coding agent debugs and develops against the app it is
 * changing — open what it just built, read the state back, screenshot it, and find out whether the change
 * worked rather than arguing about it. A person can use it the same way, and the windows are shown so
 * they can watch, but an agent is the one with no other way to see a running app.
 *
 * It used to be done by writing a Playwright spec — in this repo the gitignored
 * `tests/e2e/scratch.spec.ts`, in a pack one more file under `tests/e2e/` — and that is the confusion
 * this command exists to end. A driving script asserts nothing, nothing should gate on it, and a test
 * runner should never collect it.
 *
 * **It is not `abuddy test`.** `test` is pinned, ephemeral and assertive on purpose. This is your app,
 * your instance, and state that is still there next session.
 *
 * **It is not `abuddy run`.** `run` spawns the app as a plain child and hands back no handle; driving
 * needs a page, which only the Playwright fixture produces. So `drive` launches its own app and shows its
 * windows. Electron's single-instance lock is scoped to the data dir, so it cannot join an app `run`
 * already has on that instance — which is why a person who wants to watch what a driver is doing should
 * watch the driver's window rather than start their own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findPackRoot, readManifest } from '../utils';
import { cliDirs, parseAppFlags, resolveDevelopmentApp } from '../app/app-target';
import { instanceFor, parseInstanceFlags, removeInstance, INSTANCE_USAGE } from '../app/instances';
import { fixtureEnv } from './test';
import { resolvePlaywrightCli } from '../app/playwright';
import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import { build } from './build';

const DRIVE_DIR = 'drive';

const HELP = `
Usage: abuddy drive [script] [--app-root <path> | --app beta] [instance]

Launch AgentBuddy and drive it from a script: navigate, send events, read state, screenshot.
Mainly for an agent debugging or developing against the app; a person can watch, the windows are shown.
Scripts live in ${DRIVE_DIR}/ and are not tests — no runner collects them, and nothing gates on them.

With no script, every file in ${DRIVE_DIR}/ runs. The app's windows are shown, so you can watch.

Options:
  --app-root <path>   a local AgentBuddy checkout (installed and built)
  --app beta          the newest AgentBuddy Beta build that satisfies the pack's hostVersion
${INSTANCE_USAGE}
  --help, -h          Show this help
`.trim();

const CONFIG = `import { defineConfig } from '@playwright/test';

// Driving, not testing. Playwright is only the thing that can hold a page open and talk to Electron;
// nothing here asserts, and \`abuddy test\` never sees this directory.
export default defineConfig({
  testDir: '.',
  // Any .ts file, because a driving script is not named like a spec and should not have to be
  testMatch: '**/*.ts',
  testIgnore: 'playwright.config.ts',
  // One app, one script at a time: they would otherwise fight over the same instance
  workers: 1,
  timeout: 0,
  reporter: 'list',
});
`;

const README = `# drive/

Scripts that drive the app. **Not tests.** Nothing here is collected by \`abuddy test\` or gates anything.

**Mainly for an agent.** This is how a coding agent debugs and develops against your pack: open what it
just built, click through it, read the state back, screenshot it, and see whether the change worked. You
can use it the same way — the app's windows are shown so you can watch.

\`\`\`ts
// drive/notes.ts
import { drive } from '@abuddy/testing';

drive('open notes and look at it', async ({ app, appPage }) => {
  await app.navigate('notes');
  await app.screenshot('notes');
  // appPage is a Playwright Page: click, type, evaluate — whatever you need
});
\`\`\`

Run everything with \`abuddy drive\`, or one script with \`abuddy drive drive/notes.ts\`.

Add \`--instance <name>\` to keep the app's data between sessions, or \`--ephemeral\` to start clean and
leave nothing behind. Everything but this file and \`playwright.config.ts\` is gitignored.
`;

const GITIGNORE = `*
!.gitignore
!README.md
!playwright.config.ts
`;

/** Writes the layer the first time, so driving needs no setup step of its own. */
function scaffold(root: string): boolean {
  const dir = path.join(root, DRIVE_DIR);
  if (fs.existsSync(path.join(dir, 'playwright.config.ts'))) return false;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of [['playwright.config.ts', CONFIG], ['README.md', README], ['.gitignore', GITIGNORE]] as const) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, body);
  }
  return true;
}

export async function drive(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);

  const { mode, rest } = parseInstanceFlags(args);
  const flags = parseAppFlags(rest);
  const app = await resolveDevelopmentApp({ flags, hostVersion: manifest.hostVersion ?? '*' });
  const instance = instanceFor(mode, app.kind, cliDirs());

  if (scaffold(root)) console.log(`Created ${DRIVE_DIR}/ — put your driving scripts there.\n`);

  ensureCheckoutPackages(root);
  console.log('Building the pack...\n');
  await build([]);

  if (instance) {
    console.log(`Instance ${instance.name}${instance.ephemeral ? ' (removed when this exits)' : ''}`);
    console.log(`  ${instance.dir}\n`);
  }

  const env = fixtureEnv(app, root, process.env);
  // Shown, because the whole point is to watch it. Under Playwright the app hides its windows unless
  // this says otherwise (the guards in packages/main).
  env.PLAYWRIGHT_VISIBLE = '1';
  // The fixture makes a throwaway dir unless it is given one; an instance is the caller's to keep
  if (instance) env.E2E_DATA_DIR = instance.dir;

  try {
    const result = spawnSync(
      process.execPath,
      [resolvePlaywrightCli(root), 'test', '--config', path.join(DRIVE_DIR, 'playwright.config.ts'), ...flags.args],
      { cwd: root, env, stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error(`drive exited ${result.status ?? 'without a status'}`);
  } finally {
    if (instance?.ephemeral) {
      removeInstance(cliDirs(), instance.dir);
      console.log(`\nRemoved the ephemeral instance ${instance.name}.`);
    }
  }
}
