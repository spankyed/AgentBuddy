import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  publishSession, readSession, sessionFile, startedByFromEnv, STARTED_BY_ENV, type DevSession,
} from '../src/dev-session.ts';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-session-'));
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const session = (over: Partial<DevSession> = {}): DevSession => ({
  debugPort: 51873,
  apiPort: 3001,
  logPath: path.join(dataDir, 'dev.log'),
  dataDir,
  supervisorPid: process.pid,
  startedBy: 'dev',
  ...over,
});

describe('publishing a session', () => {
  it('is read back whole', () => {
    publishSession(session());
    expect(readSession(dataDir)).toEqual(session());
  });

  /**
   * The port is unauthenticated control of the renderer, and the renderer holds the app's API token. So the
   * file is discoverable by the user and by nothing else — the posture the app's own `api-token` file has.
   */
  it('is readable only by its owner', () => {
    publishSession(session());
    expect(fs.statSync(sessionFile(dataDir)).mode & 0o777).toBe(0o600);
  });

  it('is removed by what publishing returns', () => {
    const unpublish = publishSession(session());
    unpublish();
    expect(fs.existsSync(sessionFile(dataDir))).toBe(false);
    // Twice, since a supervisor may tear down after something already removed it
    expect(() => unpublish()).not.toThrow();
  });
});

describe('reading a session', () => {
  it('is nothing at all when none was published', () => {
    expect(readSession(dataDir)).toBeUndefined();
  });

  /**
   * A session file outlives the process that wrote it whenever one is killed, so a record naming a dead
   * supervisor is a **miss** rather than an error: there is no app to attach to, and the next launcher is
   * free to take the dir. `recordIsStale` errs toward stale on purpose — it never misses a live holder,
   * because inventing a dead one is what would take a running app's data.
   */
  it('is nothing when the supervisor that wrote it has gone', () => {
    // A pid no process has. 2^22 is above every platform's default pid_max, so this cannot collide with a
    // process started between writing and reading
    publishSession(session({ supervisorPid: 4_194_303 }));
    expect(readSession(dataDir)).toBeUndefined();
  });

  it.each([
    ['not JSON at all', 'what?'],
    ['JSON that is not an object', '"a string"'],
    ['null', 'null'],
    ['missing the debug port', JSON.stringify({ dataDir: '/x', supervisorPid: 1, startedBy: 'dev' })],
    ['missing the supervisor', JSON.stringify({ debugPort: 1, dataDir: '/x', startedBy: 'dev' })],
    ['a starter nothing declares', JSON.stringify({ debugPort: 1, dataDir: '/x', supervisorPid: 1, startedBy: 'someone' })],
  ])('is nothing for %s, rather than throwing', (_what, contents) => {
    fs.writeFileSync(sessionFile(dataDir), contents);
    // Nothing downstream can use half a record, and a throw would make every caller handle a case that
    // only ever means "there is no session"
    expect(readSession(dataDir)).toBeUndefined();
  });
});

/**
 * `dev` writes the file and cannot know who asked for it. Getting this wrong is the silent kind: `dev`
 * records `dev`, so nothing is ever reclaimable, and the developer's own `npm start` refuses with a message
 * blaming them — which is why the value is passed in rather than inferred.
 */
describe('who a launcher says started it', () => {
  it('is what it was told', () => {
    expect(startedByFromEnv({ [STARTED_BY_ENV]: 'drive' })).toBe('drive');
    expect(startedByFromEnv({ [STARTED_BY_ENV]: 'dev' })).toBe('dev');
  });

  it('is dev for a command nobody told', () => {
    expect(startedByFromEnv({})).toBe('dev');
  });

  // A person running `dev` is the case this must not get wrong, so an unrecognised value is not trusted
  // through: it reads as the person, which is the answer that refuses rather than the one that reclaims
  it('is dev for a value nothing declares', () => {
    expect(startedByFromEnv({ [STARTED_BY_ENV]: 'whatever' })).toBe('dev');
  });
});
