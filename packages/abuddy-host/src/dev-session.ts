/**
 * What a launcher publishes so something else can drive the app it holds.
 *
 * **An attachable app is one that published a debug port and said so**, and this is what it says it with:
 * `<dataDir>/session.json`. The name is the thing — a data dir already holds one *marker*
 * (`pack-dev-servers/<id>.json`) that means a Vite server for one pack, and calling this a second marker
 * would put two unrelated records under one word.
 *
 * **It is declared, never inferred.** A launcher writes one because it means its app to be driven, so
 * `abuddy test` writes none and a packaged build carries no port: there is no probing a port to find out,
 * and nothing treats the absence of a file as "try anyway".
 *
 * **The pid is the supervisor's, not the app's.** The supervisor is what wrote this file and what has to be
 * signalled: its own teardown closes the app it holds, so one `SIGTERM` ends both. Nothing goes the other
 * way — a supervisor does not exit when its Electron does — so signalling the app would free the data dir
 * and leave a watcher and a dev server running with nothing to serve. The app needs no pid here; it is
 * reached through `debugPort`.
 *
 * **It lives here rather than in the CLI because two launchers publish one**: `abuddy dev` and the
 * renderer-HMR loop `npm start` runs, which spawns Electron from `packages/main/vite.config.js`. The
 * `pack-dev-servers` marker is here for the same reason — a record about a running app's data dir, written
 * by whoever started it and read by whoever wants to reach it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writePrivateFile } from './private-file.ts';
import { recordIsStale } from './process-liveness.ts';

/** Who started the app, which is the whole of what decides whether another tool may take it. */
export const SESSION_STARTERS = ['dev', 'drive'] as const;
export type SessionStarter = (typeof SESSION_STARTERS)[number];

/**
 * The environment variable a launcher is told its own answer in.
 *
 * `dev` writes the file and cannot know who asked for it: run by a person it is `dev`, spawned by a
 * one-shot it is `drive`. Getting this wrong is silent — `dev` records `dev`, nothing is ever reclaimable,
 * and the developer's `npm start` refuses with a message blaming them — so the value is passed in rather
 * than guessed, and defaults to the honest answer for a command nobody told anything.
 */
export const STARTED_BY_ENV = 'ABUDDY_SESSION_STARTED_BY';

export interface DevSession {
  /** Chromium's `--remote-debugging-port`, as it reported it. Absent means the app is not attachable */
  readonly debugPort: number;
  /** The app's API, so a session can reach the bus without going through the page */
  readonly apiPort?: number;
  /** Where the app's output went, which is what a failure to become attachable is explained from */
  readonly logPath?: string;
  readonly dataDir: string;
  /** The supervisor holding the app — what to signal, and whose liveness says the record is live */
  readonly supervisorPid: number;
  readonly startedBy: SessionStarter;
}

export const sessionFile = (dataDir: string): string => path.join(dataDir, 'session.json');

/**
 * Waits for a session to be published on a data dir, or says why none was.
 *
 * **The deadline is a pack build, not a window.** A cold spawn runs the packages' freshness check and
 * `abuddy build` before Electron starts, which is tens of seconds — a deadline sized for a launch reports a
 * timeout on a build that was working. `isAlive` is how the caller says the launcher has gone: a child that
 * exited is an error with a body rather than a wait to the deadline, and the two read quite differently to
 * whoever is waiting.
 */
export async function waitForSession(
  dataDir: string, { timeoutMs = 120_000, isAlive = () => true }: { timeoutMs?: number; isAlive?: () => boolean } = {},
): Promise<DevSession> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = readSession(dataDir);
    if (session !== undefined) return session;
    if (!isAlive()) throw new Error(`The app exited before it published ${sessionFile(dataDir)}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No session appeared at ${sessionFile(dataDir)} within ${Math.round(timeoutMs / 1000)}s.`);
}

/**
 * The port Chromium chose, from the file it writes in the data dir.
 *
 * `--remote-debugging-port=0` means "pick a free one", which is the only safe way to ask: a fixed port is
 * a collision with whatever else is on it and with a second app. Chromium then writes `DevToolsActivePort`
 * — the port on the first line, a browser-target path on the second — so the number is read rather than
 * agreed. It appears a moment after launch, so this waits for it; a file left by a previous run of the
 * same data dir is why a launcher waits for a *new* one rather than trusting what is there.
 */
export async function readDevToolsPort(dataDir: string, timeoutMs = 15_000): Promise<number> {
  const file = path.join(dataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Absent is the ordinary case for the first few polls, and a half-written first line reads as NaN —
    // both are "not yet" rather than failures, so neither ends the wait
    try {
      const port = Number(fs.readFileSync(file, 'utf-8').split('\n')[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`No debug port appeared at ${file} within ${timeoutMs}ms.`);
}

/** What a launcher was told to record as its starter, or `dev` for one nobody told. */
export function startedByFromEnv(env: NodeJS.ProcessEnv = process.env): SessionStarter {
  const given = env[STARTED_BY_ENV];
  return SESSION_STARTERS.includes(given as SessionStarter) ? given as SessionStarter : 'dev';
}

/**
 * Publishes the session, and returns what removes it.
 *
 * Mode 0600 through `writePrivateFile`: the port is unauthenticated control of the renderer, which holds
 * the app's API token, so it is discoverable by the user and by nothing else — the same posture the app's
 * own `api-token` file has, and the same answer Chrome gives with `DevToolsActivePort`.
 */
export function publishSession(session: DevSession): () => void {
  const file = sessionFile(session.dataDir);
  writePrivateFile(file, JSON.stringify(session, null, 2) + '\n');
  return () => fs.rmSync(file, { force: true });
}

/**
 * The live session on a data dir, or nothing.
 *
 * A file whose supervisor has gone is a miss rather than an error: a session file outlives the process that
 * wrote it whenever one is killed, and `recordIsStale` errs toward stale for exactly this — it never misses
 * a live holder, because inventing a dead one is what would take a running app's dir.
 *
 * Unreadable, malformed and incomplete are all misses too. Nothing downstream can do anything useful with
 * half a record, and a throw here would make every caller handle a case that means "there is no session".
 */
export function readSession(dataDir: string): DevSession | undefined {
  const file = sessionFile(dataDir);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return undefined;
  }
  const session = parsed as Partial<DevSession> | null;
  if (session === null || typeof session !== 'object') return undefined;
  if (typeof session.debugPort !== 'number' || typeof session.supervisorPid !== 'number') return undefined;
  if (typeof session.dataDir !== 'string' || !SESSION_STARTERS.includes(session.startedBy as SessionStarter)) return undefined;
  if (recordIsStale(file, session.supervisorPid)) return undefined;
  return session as DevSession;
}
