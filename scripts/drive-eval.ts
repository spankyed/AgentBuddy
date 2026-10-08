/**
 * This repo's one-shot: `npm run drive:eval -- 'return document.title'`.
 *
 * **Why this exists rather than `npm run drive -- --eval …`.** The root `drive` script hands everything
 * after `--` to the Playwright CLI, so a flag meant for the command never reaches one. And `abuddy drive`
 * cannot be used from here at all: it opens with `findPackRoot`, which throws because the repo root is not
 * a pack. Unifying the two entry points means making the pack optional *and* reconciling the
 * `@abuddy/source` condition this repo adds against the `fixtureEnv` that strips it — deliberately a
 * separate change, so this shares the *implementation* with `abuddy drive` and not the entry point.
 *
 * **Why it does not wear its siblings' prefixes.** `drive` and `drive:serve` are
 * `packages:ensure && drive-preflight && … with-source.mjs playwright test …`, and every part of that
 * writes to stdout — `ensurePackagesBuilt` spawns its build with `stdio: 'inherit'`, and `with-source.mjs`
 * does the same for the command it wraps. A one-shot's stdout carries one JSON envelope and nothing else,
 * so the same three steps happen here with their output sent to stderr instead.
 */
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { ONE_SHOT_ASKS, type AskName, type EngineAsk } from '../packages/abuddy-cli/src/app/drive-engine.ts';
import { oneShot } from '../packages/abuddy-cli/src/app/drive-one-shot.ts';
import { stalenessWarnings } from './drive-preflight.ts';
import { withLocalBin, withSourceCondition } from './with-source.mjs';

const DRIVE_DIR = 'drive';
const USAGE = `
Usage: npm run drive:eval -- [--attach] '<function body>'
       npm run drive:query -- [--attach] '<code>'
       npm run drive:state -- [--attach]

Launches the app, asks it one thing, prints the engine's envelope and exits. One JSON line on stdout;
everything else goes to stderr, and the exit code follows the envelope's \`ok\`.

**\`--eval\` takes a function body, not an expression**, exactly as the session's \`/eval\` verb does — so
\`return\` is required: \`npm run drive:eval -- 'return document.title'\`.

--attach asks a session \`npm run drive:serve\` is already running instead of launching an app, which
answers in milliseconds and leaves that session up.
`.trim();

/** Which question this invocation is, taken from the npm script's own name rather than from a flag */
function askFrom(argv: string[]): { ask: EngineAsk; name: AskName; argument?: string; attach: boolean } {
  const name = (process.env.DRIVE_ASK ?? 'eval') as AskName;
  if (!Object.hasOwn(ONE_SHOT_ASKS, name)) throw new Error(`${name} is not a question this can ask: ${Object.keys(ONE_SHOT_ASKS).join(', ')}`);
  const ask: EngineAsk = ONE_SHOT_ASKS[name];
  const attach = argv.includes('--attach');
  const positional = argv.filter((arg) => arg !== '--attach');
  if (ask.field !== undefined && positional.length === 0) {
    throw new Error(`${USAGE}\n\nMissing the ${name === 'eval' ? 'body' : 'code'} to send.`);
  }
  return { ask, name, ...(positional[0] === undefined ? {} : { argument: positional[0] }), attach };
}

/** The ensure and the staleness nudge, with their output on stderr so stdout stays the envelope's */
async function prepare(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['run', 'packages:ensure'], { cwd: REPO_ROOT, stdio: ['ignore', 2, 2] });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`packages:ensure exited ${code}`)));
    child.on('error', reject);
  });
  for (const warning of stalenessWarnings()) console.error(`⚠ ${warning}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.error(USAGE); return; }
  const { ask, argument, attach } = askFrom(argv);
  const resultsDir = path.join(REPO_ROOT, DRIVE_DIR, 'results');
  const startHint = 'npm run drive:serve';

  if (attach) {
    const outcome = await oneShot({ ask, argument, resultsDir, startHint });
    console.log(outcome.line);
    process.exitCode = outcome.code;
    return;
  }

  await prepare();
  const env = {
    ...process.env,
    NODE_OPTIONS: withSourceCondition(process.env.NODE_OPTIONS),
    PATH: withLocalBin(process.env.PATH),
    E2E_SCREENSHOT_DIR: path.join(DRIVE_DIR, 'screenshots'),
    E2E_REPORT_DIR: path.join(DRIVE_DIR, 'results'),
  };
  // No PLAYWRIGHT_VISIBLE: a one-shot is headless, as it is under `abuddy drive` — no window per question,
  // and the page then gets the emulated viewport a suite gets rather than a real window
  const outcome = await oneShot({
    ask, argument, resultsDir, startHint,
    launch: () => {
      const child = spawn('playwright', ['test', '--config', path.join(DRIVE_DIR, 'engine.config.mts')], {
        cwd: REPO_ROOT, env,
        // stdout piped for the readiness line and mirrored to stderr; stderr straight through
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      return { child, exited: new Promise((resolve) => child.on('exit', (code) => resolve({ code }))) };
    },
  });
  console.log(outcome.line);
  process.exitCode = outcome.code;
}

await main();
