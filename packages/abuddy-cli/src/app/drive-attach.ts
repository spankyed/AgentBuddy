/**
 * Answering a question from the app something else is holding.
 *
 * **The fast path, and eventually the only one.** A one-shot used to stand a whole session up per question —
 * a Playwright run, an app launch, an HTTP server, a token and a marker — because nothing could attach to an
 * app it had not launched. With a session file to read and `connectOverCDP` to attach with, a question costs
 * a connection.
 *
 * **`@abuddy/testing` is resolved at runtime, never imported.** It is a devDependency of this package, so a
 * static import would make `bundle-package.ts` refuse the bundle outright, and a real dependency would put
 * the whole Playwright harness in every install of someone who only runs `abuddy build`. The CLI already
 * reaches it this way for the Playwright binary (`resolvePlaywrightCli`), from the pack's own
 * `node_modules` — so a pack drives with the harness it tests with, rather than one this CLI carried.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { AttachedSession, AttachedSessionOptions } from '@abuddy/testing';
import { readSession, touchSession, waitForSession, STARTED_BY_ENV, type DevSession } from '@abuddy/host/dev-session';

/** Just the part of `@abuddy/testing` this needs, so a wrong resolve fails on the name rather than later. */
interface TestingModule {
  attachedSession: (options: AttachedSessionOptions) => Promise<AttachedSession>;
}

/**
 * The pack's own `@abuddy/testing`, as a module.
 *
 * The install hint rather than a module-not-found from inside a bundle: a pack that has never run
 * `init-tests` has no harness, and the fix is one command.
 */
async function testingModule(from: string): Promise<TestingModule> {
  const require = createRequire(path.join(from, 'package.json'));
  let entry: string;
  try {
    entry = require.resolve('@abuddy/testing');
  } catch {
    throw new Error('@abuddy/testing is not installed here. Run: npm i -D @abuddy/testing @playwright/test');
  }
  const loaded = await import(pathToFileURL(entry).href) as Partial<TestingModule>;
  if (typeof loaded.attachedSession !== 'function') {
    throw new Error(
      `The @abuddy/testing at ${entry} has no \`attachedSession\`, so it is older than this CLI. Update it: npm i -D @abuddy/testing@latest`,
    );
  }
  return loaded as TestingModule;
}

export interface AttachableApp {
  readonly session: DevSession;
  /** Where this app's output went, for the verbs that read it */
  readonly logPath?: string;
}

/**
 * The attachable app on a data dir, or nothing.
 *
 * Nothing is the ordinary answer rather than a failure: no app is running, or the one running was not
 * started by something that meant it to be driven. `readSession` already treats a record whose supervisor
 * has gone as absent, so a session file a killed run left behind reads as no app at all.
 */
export function attachableApp(dataDir: string): AttachableApp | undefined {
  const session = readSession(dataDir);
  if (session === undefined) return undefined;
  return { session, logPath: session.logPath };
}

/**
 * Starts an app and waits for it to be attachable, by running `abuddy dev` detached.
 *
 * **`dev` itself, and detached, are both load-bearing.** The fixture sets `PLAYWRIGHT_TEST`, which makes the
 * app resolve the `test` environment and so refuse the debug port — and the fixture is also the only thing
 * that installs the pack under test, which `dev` does too. So a launcher shaped *like* `dev` would pass every
 * check about the port and still hand a pack author an app without their pack. Detached because `dev` never
 * returns: it is a supervisor holding the app for as long as its terminal lives, and a one-shot has to answer
 * and exit while the app stays up.
 *
 * **Its output goes to a file, not to `/dev/null`.** A build that fails would otherwise reach the caller as
 * "no session appeared" with no cause, and the timeout message names this path.
 */
export async function spawnDevApp(
  from: string, dataDir: string, profileArgs: readonly string[],
): Promise<AttachableApp> {
  const logPath = path.join(dataDir, 'dev-spawn.log');
  fs.mkdirSync(dataDir, { recursive: true });
  const log = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [cliBin(), 'dev', ...profileArgs], {
    cwd: from,
    detached: true,
    stdio: ['ignore', log, log],
    // The one thing `dev` cannot work out for itself: it writes the session file and cannot know who asked
    env: { ...process.env, [STARTED_BY_ENV]: 'drive' },
  });
  child.unref();
  let exited = false;
  child.once('exit', () => { exited = true; });
  try {
    const session = await waitForSession(dataDir, { isAlive: () => !exited });
    return { session, logPath: session.logPath ?? logPath };
  } catch (error) {
    const tail = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8').trimEnd().split('\n').slice(-6).join('\n') : '';
    throw new Error(`${error instanceof Error ? error.message : String(error)}${tail ? `\n${tail}` : ''}`);
  }
}

/** This CLI's own entry, so the spawned `dev` is this version rather than whatever is on PATH. */
function cliBin(): string {
  return fileURLToPath(new URL('../../bin/abuddy.mjs', import.meta.url));
}

export interface AttachAnswer {
  readonly value: unknown;
  readonly startedBy: DevSession['startedBy'];
  readonly supervisorPid: number;
}

/**
 * Attaches, asks one thing, and lets go.
 *
 * `detach` runs whatever the ask did, which is what makes this safe to use against a developer's app: the
 * connection is this command's, the app is not, and the only thing ending here is the connection.
 *
 * **It says it was here, twice.** A supervisor minding a drive-profile app closes it when nothing has
 * attached for a while (`reapsWhenIdle`, `commands/dev.ts`), and `touchSession` is the whole of what tells
 * it otherwise. Once on attaching, so a question that then fails still counts as someone being here; once
 * on the way out, so a verb that waits a minute for a state does not expire underneath itself.
 */
export async function askAttached<T>(
  app: AttachableApp,
  from: string,
  screenshotDir: string,
  ask: (session: AttachedSession['session']) => Promise<T>,
): Promise<AttachAnswer> {
  const { attachedSession } = await testingModule(from);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const attached = await attachedSession({
    debugPort: app.session.debugPort,
    screenshotDir,
    ...(app.logPath !== undefined ? { logPath: app.logPath } : {}),
  });
  touchSession(app.session.dataDir);
  try {
    return {
      value: await ask(attached.session),
      startedBy: app.session.startedBy,
      supervisorPid: app.session.supervisorPid,
    };
  } finally {
    touchSession(app.session.dataDir);
    await attached.detach();
  }
}
