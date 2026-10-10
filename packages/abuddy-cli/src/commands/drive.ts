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
 * your profile, and state that is still there next session.
 *
 * **It is not `abuddy run`.** `run` spawns the app as a plain child and hands back no handle; driving
 * needs a page, which only the Playwright fixture produces. So `drive` launches its own app and shows its
 * windows. Electron's single-instance lock is scoped to the data dir, so it cannot join an app `run`
 * already has on that profile — which is why a person who wants to watch what a driver is doing should
 * watch the driver's window rather than start their own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { findPackRootOrNone, readManifest } from '../utils';
import { cliDirs, parseAppFlags, resolveLaunchApp } from '../app/app-target';
import { profileFor, profileInUse, parseProfileFlags, removeProfile, PROFILE_USAGE } from '../app/profiles';
import { ONE_SHOT_ASKS, type AskName, type EngineAsk } from '../app/drive-engine.ts';
import { oneShot } from '../app/drive-one-shot.ts';
import { fixtureEnv } from './test';
import { appEnv } from './run';
import { copySecretsInto } from '../app/profile-secrets.ts';
import { resolvePlaywrightCli } from '../app/playwright';
import { renderTemplate } from '../templates.ts';
import { configCallsHelper } from '../build/config-text.ts';
import { checkoutFor, ensureCheckoutPackages } from '../build/checkout-packages.ts';

const DRIVE_DIR = 'drive';

/**
 * Exported so a spec can hold this text to what the command does.
 *
 * `USAGE` in `src/index.ts`, this, the CLI's `CLAUDE.md` table and `docs/public-facing/cli.md` are four
 * hand-kept copies of the same facts, and nothing held any of them together. `TEST_USAGE` is the
 * precedent: exported for exactly this, and asserted in `tests/commands/test-contract.spec.ts`.
 */
export const DRIVE_USAGE = `
Usage: abuddy drive [script | --serve | --eval <body>] [--app-root <path> | --app beta] [profile]

Launch AgentBuddy and drive it from a script: navigate, send events, read state, screenshot.
Mainly for an agent debugging or developing against the app; a person can watch, the windows are shown.
Scripts live in ${DRIVE_DIR}/ and are not tests — no runner collects them, and nothing gates on them.

With no script, every file in ${DRIVE_DIR}/ runs. The app's windows are shown, so you can watch.

--serve holds the app open and answers requests instead of running a script, so an agent can drive one
session many times rather than editing and re-launching for each question. It prints the address and a
curl line; ${DRIVE_DIR}/results/engine.json has the address and the token, and POST /close ends it.

It drives a built app, not a dev server: \`abuddy run\` serves your pack's frontend with HMR, and this
launches an app of its own, so a question about one is not answerable with the other.

By default the app gets a fresh data dir that is thrown away afterwards, so each session starts clean.
Name a profile to keep its state between sessions.

**One question, without writing a script.** --eval, --query and --state launch the app, ask the session one
thing, print the answer and exit — the same verbs --serve answers, asked once. The answer is the engine's
own envelope, one JSON line on stdout and nothing else there, so it can be read by a program; everything
else goes to stderr, and the exit code follows the envelope's "ok". Headless, because nothing is watching
one question.

  abuddy drive --eval 'return document.title'      ->  {"ok":true,"value":"Agent X"}
  abuddy drive --state                             ->  {"ok":true,"value":{...}}

--eval takes a function *body*, not an expression, exactly as the /eval verb does — so "return" is
required, and a body without one answers {"ok":true}. --attach asks a --serve session that is already
running instead of launching an app: milliseconds instead of a launch, and it leaves that session up.

Options:
  --serve             hold the app open and answer HTTP requests (see above)
  --eval <body>       launch, evaluate one function body in the page, print the envelope, exit
  --query <code>      the same, for one EARS read over the bus
  --state             the same, for the app shell's state
  --attach            ask a running --serve session rather than launching an app
  --app-root <path>   a local AgentBuddy checkout (installed and built)
  --app beta          the newest AgentBuddy Beta build that satisfies the pack's hostVersion
${PROFILE_USAGE}
  --help, -h          Show this help
`.trim();

const HELP = DRIVE_USAGE;

const CONFIG = (): string => renderTemplate('drive/playwright.config.ts');

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

For one question, no script is needed — \`abuddy drive --eval 'return document.title'\` launches the app,
answers with the engine's \`{ ok, value }\` envelope on stdout and exits. It is a function *body*, so
\`return\` is required. \`--query\` and \`--state\` ask the same way, and \`--attach\` asks a
\`--serve\` session that is already up.

This drives a built app, not a dev server — \`abuddy run\` is the one that serves your frontend with HMR.

\`app.report(name, value)\` is for an answer you want to read rather than watch: it writes
\`drive/results/<name>.json\` and prints one \`[drive:report] <name> <json>\` line.

Add \`--profile <name>\` to keep the app's data between sessions, or \`--fresh --rm\` to start clean and
leave nothing behind. With neither, the app gets a fresh data dir that is thrown away afterwards, so a
script cannot reach your real data. Everything but this file and \`playwright.config.ts\` is gitignored.
`;

const GITIGNORE = `*
!.gitignore
!README.md
!playwright.config.ts
`;

/**
 * The engine's config and session, written on `--serve`.
 *
 * **`.mts` is a second line of defence, no longer the only one.** A driving run must not collect the
 * session — it would start the engine and hang, waiting for a request nobody has a reason to send — and
 * until `defineDriveConfig` existed the only thing preventing it was that the scaffolded config collects
 * `**\/*.ts`, which — measured — picks up a dot-directory but not a `.mts` file. That was an accident of
 * two defaults, and a pack widening its own `testMatch` would have undone it silently. The helper now
 * ignores the session whatever `testMatch` says, which is the fix the extension was standing in for: a
 * `testIgnore` could not be added to the template before, because `scaffold` only writes absent files, so
 * it would have reached new packs and left every existing one collecting the engine.
 *
 * In a pack both files are gitignored by the `*` the scaffolded layer carries, so they are neither tracked
 * nor linted there — which is right for generated files, and the reason the engine's own code lives in
 * `@abuddy/testing`. **This repo's own copies are the exception**: `drive/.gitignore` negates both, so here
 * they are tracked, typechecked and chain inputs (`EVERY_SOURCE`, `scripts/lib/chain-steps.ts`).
 */
const ENGINE_SESSION_FILE = 'engine-session.mts';
const ENGINE_CONFIG_FILE = 'engine.config.mts';

const ENGINE_CONFIG = (): string => renderTemplate('drive/engine.config.mts');

const ENGINE_SESSION = `import { drive, driveEngineBody, optionalText, verb } from '@abuddy/testing';

// Scaffolded once by \`abuddy drive --serve\`, then yours: this file is never rewritten.
//
// The core verbs are @abuddy/testing's and are true of any AgentBuddy app. Add your own below, in your
// pack's own nouns — they are merged over the core table, so you can replace one too. A verb here saves
// an agent spelling out the same several calls every time it wants one thing.
//
// A verb declares the fields it reads, and \`run\` receives those and nothing else: \`required\`,
// \`optionalText\`, \`optionalMs\`, \`present\`, \`object\`, \`pixels\` and \`safeName\` are the readers, and a
// field nobody declared is a compile error rather than an undefined at runtime.
drive('drive engine', driveEngineBody({
  // The size to open at. Without it the window keeps its own, which is what you want while watching it.
  // viewport: { width: 1400, height: 900 },
  verbs: (session) => ({
    // 'POST /note': one call instead of a \`/tx\` whose code you have to get right each time
    // '/note': verb({
    //   method: 'POST',
    //   fields: { title: optionalText },
    //   run: ({ title }) => session.tx(\`return createEntityWithDefaults(EARS.Entity.Note, { title: \${JSON.stringify(title)} }).id\`),
    // }),
  }),
}));
`;

/**
 * Takes `--serve` out of the arguments before anything else sees them.
 *
 * Every unconsumed flag ends up in `flags.args`, which is forwarded to the Playwright CLI verbatim — so
 * a flag this command means for itself has to be removed here or Playwright is asked about it.
 */
/**
 * The one-shot flags, taken before anything else parses.
 *
 * **Before `takeServeFlag`**, so `--eval --serve` is reported by name here rather than surviving every
 * parser and failing inside the Playwright CLI, which is where `parseAppFlags` sends what nobody claimed.
 *
 * The name half is matched **exactly**, after splitting an inline value off — `parseProfileFlags`' shape,
 * and what makes it prefix-safe: `--evaluate` and `--state-dump` fall through to `rest` rather than being
 * eaten, as `--serve-forever` does.
 */
export function takeOneShotFlags(argv: string[]): { ask?: AskName; argument?: string; attach: boolean; rest: string[] } {
  const rest: string[] = [];
  let ask: AskName | undefined;
  let argument: string | undefined;
  let attach = false;

  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = argv[i]!.split(/=(.*)/s, 2) as [string, string | undefined];
    if (name === '--attach') { attach = true; continue; }
    const asked = (['eval', 'query', 'state'] as const).find((verb) => name === `--${verb}`);
    if (asked === undefined) { rest.push(argv[i]!); continue; }
    if (ask !== undefined) {
      throw new Error(ask === asked
        ? `--${asked} was given twice; a one-shot asks one question.`
        : `--${asked} can't be combined with --${ask}; a one-shot asks one question.`);
    }
    ask = asked;
    const spec: EngineAsk = ONE_SHOT_ASKS[asked];
    if (spec.field === undefined) {
      // Silently ignoring it is the trap `parseProfileFlags`' `--fresh` still has; not worth copying
      if (inline !== undefined) throw new Error(`--${asked} does not take a value.`);
      continue;
    }
    argument = inline ?? argv[++i];
    if (argument === undefined) {
      throw new Error(`--${asked} needs a value. For --eval it is a function *body*, not an expression, so`
        + ' `return` is required: --eval "return document.title"');
    }
  }
  return { ...(ask === undefined ? {} : { ask }), ...(argument === undefined ? {} : { argument }), attach, rest };
}

export function takeServeFlag(args: string[]): { serve: boolean; rest: string[] } {
  const rest = args.filter(arg => arg !== '--serve');
  return { serve: rest.length !== args.length, rest };
}

/**
 * What a scaffolder left alone, so the caller can say so.
 *
 * Write-if-absent is right for both of these files — one holds a pack's own verbs, the other is a call to
 * a helper that owns every setting — but it means a file written before the helper existed is never
 * updated and nothing notices. Reporting is the half that makes the delegation reachable: a config still
 * assembling its own settings is named once, with the two lines that replace it.
 */
export interface DriveScaffold {
  /** Files written, as paths relative to the pack */
  created: string[];
  /** Configs kept that do not call their helper, so their settings no longer follow @abuddy/testing */
  keptStale: string[];
}

/** The helpers a scaffolded drive config may delegate to — one per kind of run */
const CONFIG_HELPERS: Record<string, readonly string[]> = {
  'playwright.config.ts': ['defineDriveConfig'],
  [ENGINE_CONFIG_FILE]: ['defineEngineConfig'],
};

/** Whether a config that is already there still delegates, which is what decides if it has gone stale */
function keptStale(dir: string, name: string): boolean {
  const helpers = CONFIG_HELPERS[name];
  if (helpers === undefined) return false;
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return false;
  return !configCallsHelper(fs.readFileSync(file, 'utf-8'), helpers);
}

/**
 * Writes the engine's pair the first time, and never again.
 *
 * The session file is where a verb of this app's own goes (`driveEngineBody({ verbs })`), so it is a file
 * its owner keeps rather than output this command owns. It used to be rewritten on every `--serve`, which
 * meant the one file worth extending was the one that could not be.
 */
export function writeEngineFiles(root: string): DriveScaffold {
  const dir = path.join(root, DRIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const scaffold: DriveScaffold = { created: [], keptStale: [] };
  for (const [name, body] of [[ENGINE_CONFIG_FILE, ENGINE_CONFIG()], [ENGINE_SESSION_FILE, ENGINE_SESSION]] as const) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      if (keptStale(dir, name)) scaffold.keptStale.push(path.join(DRIVE_DIR, name));
      continue;
    }
    fs.writeFileSync(file, body);
    scaffold.created.push(path.join(DRIVE_DIR, name));
  }
  return scaffold;
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

/**
 * Writes the layer the first time, so driving needs no setup step of its own.
 *
 * It keeps a config that is already there, which is why it reports one that has stopped delegating: a pack
 * scaffolded before `defineDriveConfig` existed would otherwise never hear that its settings had stopped
 * following the package.
 */
export function scaffold(root: string): DriveScaffold {
  const dir = path.join(root, DRIVE_DIR);
  const report: DriveScaffold = { created: [], keptStale: [] };
  if (fs.existsSync(path.join(dir, 'playwright.config.ts'))) {
    if (keptStale(dir, 'playwright.config.ts')) report.keptStale.push(path.join(DRIVE_DIR, 'playwright.config.ts'));
    return report;
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of [['playwright.config.ts', CONFIG()], ['README.md', README], ['.gitignore', GITIGNORE]] as const) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, body);
    report.created.push(path.join(DRIVE_DIR, name));
  }
  return report;
}

/** One line per config that has stopped delegating, naming the two lines that put it back */
function reportStaleConfigs(stale: string[]): void {
  for (const file of stale) {
    const helper = CONFIG_HELPERS[path.basename(file)]![0]!;
    console.error(`${file} does not call ${helper}(), so its settings no longer follow @abuddy/testing. Replace its body with:`);
    console.error(`  import { ${helper} } from '@abuddy/testing/playwright';`);
    console.error(`  export default ${helper}();\n`);
  }
}

/** What a driving run is about: a pack, or the app itself */
interface DriveTarget {
  /** Where `drive/` lives, and the Playwright run's working directory */
  readonly root: string;
  /** The pack under test. Absent when the app itself is the subject, which unsets `PACK_DIR` */
  readonly packDir?: string;
  readonly hostVersion: string;
}

/**
 * The pack this drives, or the checkout it drives *itself* from.
 *
 * **A root with no `abuddy.json` is the second case, not an error.** This command used to open with
 * `findPackRoot`, which throws there — so the AgentBuddy repo could not use it at all and kept npm scripts
 * calling Playwright directly, with their own environment and their own drift. Driving the app with no pack
 * under test is exactly what those scripts did, so it is a shape this understands now and the two entry
 * points are one implementation.
 */
function driveTarget(cwd: string): DriveTarget {
  const pack = findPackRootOrNone(cwd);
  if (pack !== undefined) return { root: pack, packDir: pack, hostVersion: readManifest(pack).hostVersion ?? '*' };
  const checkout = checkoutFor(cwd);
  if (checkout === undefined) {
    throw new Error('No abuddy.json here, and no AgentBuddy checkout above it. Run this from inside a pack,'
      + ' or from a checkout to drive its app on its own.');
  }
  return { root: checkout, hostVersion: '*' };
}

export async function drive(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const target = driveTarget(process.cwd());
  const root = target.root;
  const { ask, argument, attach, rest: unasked } = takeOneShotFlags(args);
  const { serve, rest: unserved } = takeServeFlag(unasked);
  const { mode, withSecrets, rest } = parseProfileFlags(unserved);
  const flags = parseAppFlags(rest);
  const asking = ask === undefined ? undefined : ONE_SHOT_ASKS[ask];

  if (asking !== undefined && serve) {
    throw new Error(`--${ask} can't be combined with --serve: --serve holds the app open, --${ask} asks one question and closes it.`);
  }
  if (attach && asking === undefined) throw new Error('--attach needs a question: add --eval, --query or --state.');

  const resultsDir = path.join(root, DRIVE_DIR, 'results');
  /**
   * `--attach` asks a session someone else is running, so it builds nothing, resolves no app and launches
   * nothing — and it must not close what it did not start. Short-circuited here, above every one of those.
   */
  if (attach && asking !== undefined) {
    const outcome = await oneShot({ ask: asking, argument, resultsDir, startHint: 'abuddy drive --serve' });
    console.log(outcome.line);
    process.exitCode = outcome.code;
    return;
  }

  // A one-shot *is* a serving session, asked once: same config, same generated session file
  const serving = serve || asking !== undefined;

  // Before the app is resolved, which can download a Beta: a first run has nothing to drive, and used to
  // find that out only after paying for a build and a launch and then failing with Playwright's
  // "No tests found"
  const layer = scaffold(root);
  if (layer.created.length > 0) console.error(`Created ${DRIVE_DIR}/ — a README and a config are in there.\n`);
  const engine = serving ? writeEngineFiles(root) : { created: [], keptStale: [] };
  reportStaleConfigs([...layer.keptStale, ...engine.keptStale]);
  // A serving session is the thing being run, so a pack with no scripts of its own is not empty-handed
  if (!serving && driveScripts(root).length === 0) {
    console.error(`No driving scripts yet. Write one in ${DRIVE_DIR}/ and run this again:\n`);
    console.error(`  // ${DRIVE_DIR}/look.ts`);
    console.error("  import { drive } from '@abuddy/testing';\n");
    console.error("  drive('look at it', async ({ app, appPage }) => {");
    console.error("    await app.screenshot('look');");
    console.error('  });');
    return;
  }

  // One policy whether or not a pack is being driven: `deriveApp` looks for the checkout behind
  // `from`, which is the pack when there is one and this directory when there is not — and in the second
  // case that *is* the checkout. It states what it resolved and why; the reasoning is in `app-target.ts`.
  const app = await resolveLaunchApp({ flags, hostVersion: target.hostVersion, from: target.packDir ?? target.root });
  const profile = profileFor(mode, cliDirs());
  if (profile?.created && withSecrets) {
    const { count, from } = copySecretsInto(profile, appEnv(app));
    console.error(`Copied ${count} secret${count === 1 ? '' : 's'} from ${from}\n`);
  }

  /**
   * Reachable from every way this ends, and set up the moment the profile exists — a signal or a throw
   * in between used to leak it, and `ensureCheckoutPackages` below is a package rebuild that takes
   * seconds and throws on failure, so "in between" is where an interrupt actually lands.
   *
   * It declines rather than throws when an app still holds the dir: this runs in a `finally`, where a
   * throw would replace whatever the session was already reporting.
   */
  let tornDown = false;
  function teardown(): void {
    if (tornDown || !profile?.ephemeral) return;
    tornDown = true;
    if (profileInUse(profile.dir)) {
      console.warn(`\nLeft the ephemeral profile ${profile.name}: an app is still running on it.`);
      return;
    }
    removeProfile(cliDirs(), profile.dir);
    console.error(`\nRemoved the ephemeral profile ${profile.name}.`);
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
    // for a main window and report that it never saw one, which names neither the profile nor the cause
    if (profile && profileInUse(profile.dir)) {
      throw new Error(`An app is already running on profile ${profile.name}. Close it, or drive a different profile.`);
    }

    // No build here: the fixture builds the pack itself when PACK_DIR is set, which `fixtureEnv` does
    // below. `abuddy test` leaves it to the fixture for the same reason
    // A one-shot's stdout carries one JSON envelope, so npm's banner goes to stderr with everything else
    ensureCheckoutPackages(root, asking === undefined ? 'inherit' : ['ignore', 2, 2]);

    if (profile) {
      console.error(`Profile ${profile.name}${profile.ephemeral ? ' (removed when this exits)' : ''}`);
      console.error(`  ${profile.dir}\n`);
    }

    // With no pack there is nothing resolving `dist`, and the subject is this checkout's own source
    const env = fixtureEnv(app, target.packDir, process.env, { keepSourceCondition: target.packDir === undefined });
    // Shown, because the whole point is to watch it. Under Playwright the app hides its windows unless
    // this says otherwise (the guards in packages/main). **A one-shot is the exception**: no window flashes
    // up per question, and it then takes the other branch of `pinsViewport`, so the page gets the emulated
    // viewport a suite gets and a one-shot's answer matches what `npm test` sees.
    if (asking === undefined) env.PLAYWRIGHT_VISIBLE = '1';
    // The fixture makes a throwaway dir unless it is given one; a profile is the caller's to keep
    if (profile) env.E2E_DATA_DIR = profile.dir;
    // Beside the scripts that take them, not under `tests/` — driving output is not test output
    env.E2E_SCREENSHOT_DIR = path.join(root, DRIVE_DIR, 'screenshots');
    // Beside the screenshots, for the same reason. The CLI did not set this before, so `app.report` in a
    // pack's driving script fell through to its `PACK_DIR/drive/results` guess
    env.E2E_REPORT_DIR = path.join(root, DRIVE_DIR, 'results');

    // Spawned rather than spawnSync'd so this process keeps an event loop. With spawnSync a Ctrl-C took
    // the default action and killed this process where it stood, so the teardown below never ran and an
    // ephemeral profile was left on disk — measured, not reasoned about.
    const playwright = [
      resolvePlaywrightCli(root), 'test',
      '--config', path.join(DRIVE_DIR, serving ? ENGINE_CONFIG_FILE : 'playwright.config.ts'),
      ...flags.args,
    ];
    // **A one-shot pipes stdout and mirrors it to stderr.** The readiness line is read off that pipe, and
    // stdout has to carry the envelope alone — Playwright's reporter writes there, so inheriting it would
    // put the reporter's lines in front of the answer.
    const stdio: StdioOptions = asking === undefined ? 'inherit' : ['ignore', 'pipe', 'inherit'];

    if (asking !== undefined) {
      const outcome = await oneShot({
        ask: asking, argument, resultsDir, startHint: 'abuddy drive --serve',
        launch: () => {
          const spawned = spawn(process.execPath, playwright, { cwd: root, env, stdio });
          // Also assigned to the outer `child`, which is what the signal handlers above forward to
          child = spawned;
          return {
            child: spawned,
            exited: new Promise((resolve) => spawned.on('exit', (code) => resolve({ code }))),
          };
        },
      });
      console.log(outcome.line);
      process.exitCode = outcome.code;
      return;
    }

    child = spawn(process.execPath, playwright, { cwd: root, env, stdio });
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
