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
import { spawn, type ChildProcess } from 'node:child_process';
import { findPackRoot, readManifest } from '../utils';
import { cliDirs, parseAppFlags, resolveDevelopmentApp } from '../app/app-target';
import { instanceFor, instanceInUse, parseInstanceFlags, removeInstance, INSTANCE_USAGE } from '../app/instances';
import { fixtureEnv } from './test';
import { appEnv } from './run';
import { copySecretsInto } from '../app/instance-secrets.ts';
import { resolvePlaywrightCli } from '../app/playwright';
import { ensureCheckoutPackages } from '../build/checkout-packages.ts';

const DRIVE_DIR = 'drive';

/**
 * Exported so a spec can hold this text to what the command does.
 *
 * `USAGE` in `src/index.ts`, this, the CLI's `CLAUDE.md` table and `docs/public-facing/cli.md` are four
 * hand-kept copies of the same facts, and nothing held any of them together. `TEST_USAGE` is the
 * precedent: exported for exactly this, and asserted in `tests/commands/test-contract.spec.ts`.
 */
export const DRIVE_USAGE = `
Usage: abuddy drive [script | --serve] [--app-root <path> | --app beta] [instance]

Launch AgentBuddy and drive it from a script: navigate, send events, read state, screenshot.
Mainly for an agent debugging or developing against the app; a person can watch, the windows are shown.
Scripts live in ${DRIVE_DIR}/ and are not tests — no runner collects them, and nothing gates on them.

With no script, every file in ${DRIVE_DIR}/ runs. The app's windows are shown, so you can watch.

--serve holds the app open and answers requests instead of running a script, so an agent can drive one
session many times rather than editing and re-launching for each question. It prints the address and a
curl line; ${DRIVE_DIR}/results/engine.json has the address and the token, and POST /close ends it.

By default the app gets a fresh data dir that is thrown away afterwards, so each session starts clean.
Name an instance to keep its state between sessions.

Options:
  --serve             hold the app open and answer HTTP requests (see above)
  --app-root <path>   a local AgentBuddy checkout (installed and built)
  --app beta          the newest AgentBuddy Beta build that satisfies the pack's hostVersion
${INSTANCE_USAGE}
  --help, -h          Show this help
`.trim();

const HELP = DRIVE_USAGE;

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
  // Beside the scripts rather than Playwright's default \`test-results/\` at the pack root: driving output
  // is not test output, which is why the screenshots are here too
  outputDir: 'results',
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

/**
 * The engine's config and session, written on `--serve`.
 *
 * **`.mts`, and that extension is the mechanism.** The config this command scaffolds collects
 * `**\/*.ts`, which — measured — picks up a dot-directory but not a `.mts` file. So the engine's
 * session is invisible to a plain `abuddy drive` while its own config names it exactly, and no pack
 * scaffolded before this existed needs migrating: `scaffold` only writes files that are absent, so a
 * `testIgnore` added to the template would have reached new packs and left every existing one
 * collecting the engine and hanging on it.
 *
 * Both are gitignored by the `*` the layer already carries, so they are not tracked, not a chain input
 * and not linted — which is right for generated files, and the reason the engine's own code lives in
 * `@abuddy/testing` where all three apply.
 */
const ENGINE_SESSION_FILE = 'engine-session.mts';
const ENGINE_CONFIG_FILE = 'engine.config.mts';

const ENGINE_CONFIG = `import { defineConfig } from '@playwright/test';

// Written by \`abuddy drive --serve\`. Only the engine's session, named exactly rather than by a glob,
// so a pack's own .mts driving script is not dragged into a serving run.
export default defineConfig({
  testDir: '.',
  testMatch: '${ENGINE_SESSION_FILE}',
  workers: 1,
  // A session ends when something asks it to, not when a clock says so
  timeout: 0,
  reporter: 'list',
  outputDir: 'results',
});
`;

const ENGINE_SESSION = `import { drive, driveEngineBody } from '@abuddy/testing';

// Scaffolded once by \`abuddy drive --serve\`, then yours: this file is never rewritten.
//
// The core verbs are @abuddy/testing's and are true of any AgentBuddy app. Add your own below, in your
// pack's own nouns — they are merged over the core table, so you can replace one too. A verb here saves
// an agent spelling out the same several calls every time it wants one thing.
drive('drive engine', driveEngineBody({
  // The size to open at. Without it the window keeps its own, which is what you want while watching it.
  // viewport: { width: 1400, height: 900 },
  verbs: (session) => ({
    // 'POST /note': one call instead of a \`/tx\` whose code you have to get right each time
    // '/note': {
    //   method: 'POST',
    //   run: ({ title }) => session.tx(\`return createEntityWithDefaults(EARS.Entity.Note, { title: \${JSON.stringify(title)} }).id\`),
    // },
  }),
}));
`;

/**
 * Takes `--serve` out of the arguments before anything else sees them.
 *
 * Every unconsumed flag ends up in `flags.args`, which is forwarded to the Playwright CLI verbatim — so
 * a flag this command means for itself has to be removed here or Playwright is asked about it.
 */
export function takeServeFlag(args: string[]): { serve: boolean; rest: string[] } {
  const rest = args.filter(arg => arg !== '--serve');
  return { serve: rest.length !== args.length, rest };
}

/**
 * Writes the engine's pair the first time, and never again.
 *
 * The session file is where a verb of this app's own goes (`driveEngineBody({ verbs })`), so it is a file
 * its owner keeps rather than output this command owns. It used to be rewritten on every `--serve`, which
 * meant the one file worth extending was the one that could not be.
 */
export function writeEngineFiles(root: string): void {
  const dir = path.join(root, DRIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of [[ENGINE_CONFIG_FILE, ENGINE_CONFIG], [ENGINE_SESSION_FILE, ENGINE_SESSION]] as const) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, body);
  }
}

/** The driving scripts in a pack, which is what decides whether there is anything to run. */
export function driveScripts(root: string): string[] {
  try {
    // Recursive, because the config this scaffolds is `testDir: '.'` with `testMatch: '**/*.ts'` — a
    // shallow read would refuse a pack whose only script sits in a subdirectory, for a file Playwright
    // would have collected and run
    return fs.readdirSync(path.join(root, DRIVE_DIR), { recursive: true, encoding: 'utf-8' })
      .filter(name => name.endsWith('.ts') && name !== 'playwright.config.ts');
  } catch {
    return [];
  }
}

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
  const { serve, rest: unserved } = takeServeFlag(args);
  const { mode, withSecrets, rest } = parseInstanceFlags(unserved);
  const flags = parseAppFlags(rest);

  // Before the app is resolved, which can prompt and can download a Beta: a first run has nothing to
  // drive, and used to find that out only after paying for a build and a launch and then failing with
  // Playwright's "No tests found"
  if (scaffold(root)) console.log(`Created ${DRIVE_DIR}/ — a README and a config are in there.\n`);
  if (serve) writeEngineFiles(root);
  // A serving session is the thing being run, so a pack with no scripts of its own is not empty-handed
  if (!serve && driveScripts(root).length === 0) {
    console.log(`No driving scripts yet. Write one in ${DRIVE_DIR}/ and run this again:\n`);
    console.log(`  // ${DRIVE_DIR}/look.ts`);
    console.log("  import { drive } from '@abuddy/testing';\n");
    console.log("  drive('look at it', async ({ app, appPage }) => {");
    console.log("    await app.screenshot('look');");
    console.log('  });');
    return;
  }

  const app = await resolveDevelopmentApp({ flags, hostVersion: manifest.hostVersion ?? '*' });
  const instance = instanceFor(mode, cliDirs());
  if (instance?.created && withSecrets) {
    const { count, from } = copySecretsInto(instance, appEnv(app));
    console.log(`Copied ${count} secret${count === 1 ? '' : 's'} from ${from}\n`);
  }

  /**
   * Reachable from every way this ends, and set up the moment the instance exists — a signal or a throw
   * in between used to leak it, and `ensureCheckoutPackages` below is a package rebuild that takes
   * seconds and throws on failure, so "in between" is where an interrupt actually lands.
   *
   * It declines rather than throws when an app still holds the dir: this runs in a `finally`, where a
   * throw would replace whatever the session was already reporting.
   */
  let tornDown = false;
  function teardown(): void {
    if (tornDown || !instance?.ephemeral) return;
    tornDown = true;
    if (instanceInUse(instance.dir)) {
      console.warn(`\nLeft the ephemeral instance ${instance.name}: an app is still running on it.`);
      return;
    }
    removeInstance(cliDirs(), instance.dir);
    console.log(`\nRemoved the ephemeral instance ${instance.name}.`);
  }

  let child: ChildProcess | undefined;
  let interrupted = false;
  // A handler is also what stops the default action killing this process where it stands, which is how
  // the teardown was skipped before there was one
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      interrupted = true;
      if (child) return void child.kill(signal);
      teardown();
      process.exit(0);
    });
  }

  try {
    await session();
  } finally {
    teardown();
  }

  async function session(): Promise<void> {
    // Electron allows one app per data dir, so a second one here would die inside Playwright's 45s window
    // for a main window and report that it never saw one, which names neither the instance nor the cause
    if (instance && instanceInUse(instance.dir)) {
      throw new Error(`An app is already running on instance ${instance.name}. Close it, or drive a different instance.`);
    }

    // No build here: the fixture builds the pack itself when PACK_DIR is set, which `fixtureEnv` does
    // below. `abuddy test` leaves it to the fixture for the same reason
    ensureCheckoutPackages(root);

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
    // Beside the scripts that take them, not under `tests/` — driving output is not test output
    env.E2E_SCREENSHOT_DIR = path.join(root, DRIVE_DIR, 'screenshots');

    // Spawned rather than spawnSync'd so this process keeps an event loop. With spawnSync a Ctrl-C took
    // the default action and killed this process where it stood, so the teardown below never ran and an
    // ephemeral instance was left on disk — measured, not reasoned about.
    child = spawn(
      process.execPath,
      [
        resolvePlaywrightCli(root), 'test',
        '--config', path.join(DRIVE_DIR, serve ? ENGINE_CONFIG_FILE : 'playwright.config.ts'),
        ...flags.args,
      ],
      { cwd: root, env, stdio: 'inherit' },
    );
    const [code, killedBy] = await new Promise<[number | null, NodeJS.Signals | null]>(resolve => {
      child!.on('exit', (exitCode, signal) => resolve([exitCode, signal]));
    });
    // A driving session someone interrupted ended the way they asked, not in failure. Tracked rather than
    // read off the status, because Playwright turns the signal into an exit code of its own (130) that is
    // otherwise indistinguishable from a script failing
    if (!interrupted && killedBy === null && code !== 0) {
      throw new Error(`drive exited ${code ?? 'without a status'}`);
    }
  }
}
