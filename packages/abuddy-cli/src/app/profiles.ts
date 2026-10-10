/**
 * Profiles: a data dir you can throw away.
 *
 * `abuddy dev` launches into the one shared `development` data dir, so every run inherits what the last
 * one left — applied content, half-migrated rows, settings from a pack you have since deleted. A profile
 * is that dir, somewhere else, created on demand and disposable.
 *
 * **It is a data dir and nothing more.** `appName` stays `APP_NAMES[env]`, so the environment, the
 * Electron app identity and the URL scheme are untouched, and `--build beta` works: a packaged build stamps
 * its own channel and ignores `ABUDDY_ENV`, where `ABUDDY_USER_DATA_DIR` reaches it. Nothing here is a new
 * concept the app has to learn — an empty directory is already a valid data dir, which is what the E2E
 * fixture has relied on all along.
 *
 * **The word is `profile` and not `instance` because an instance of an app is a running process**, which
 * is what Electron's own single-instance lock is about. A named, disposable user-data-dir that leaves the
 * application's identity alone is a browser profile, and that is the analogy anyone reaches for when
 * explaining one. The three terms this keeps apart: a **data dir** is the generic thing, one app per dir;
 * an **environment** is one of four fixed data dirs by name (`APP_NAMES`), which nobody creates; a
 * **profile** is an extra one, created by name, carrying no environment.
 *
 * A profile is not bound to the kind of app that opens it: `abuddy dev --profile x` against a checkout and
 * against `--build beta` mean the same directory, because one layout puts both their stores in the same
 * places inside it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { APP_ENVS, resolveAppContext } from '@abuddy/sdk/env';
import { lockIsHeld, readApiEndpoint } from '@abuddy/host/process-liveness';
import { _pathSegmentProblem, randomId } from '@abuddy/sdk/utils/pure';
import type { CliDirs } from './app-target';

/** What a profile records about itself, in `.abuddy-profile.json` at its root. */
interface ProfileRecord {
  created: string;
  /** The `abuddy dev` that owns an ephemeral profile, so a later run can tell a leak from a live one */
  pid?: number;
}

const MARKER = '.abuddy-profile.json';
/** Ephemeral profiles live apart from named ones, so reclaiming by pid can never eat a name that looks like one. */
const EPHEMERAL = '.ephemeral';

const profilesRoot = (dirs: CliDirs) => path.join(dirs.data, 'profiles');

/**
 * A name is a single path segment and is checked as one. It reaches `path.join` and, for an ephemeral
 * profile, `fs.rm`, so `../../../abuddy-dev` would resolve to the real development data dir and delete it.
 *
 * The rule itself is `_pathSegmentProblem`: a pack's data directory name needs the same one, and the copy
 * that governed it was missing the filesystem's reserved names.
 *
 * **And a profile is never named after a build.** `--profile beta` and `--build beta` would otherwise be
 * two different things a letter apart — one a data dir, the other the app that opens it — which is the
 * collision this vocabulary exists to end, reintroduced by the one input a user picks freely. The names
 * come from `APP_ENVS` rather than a list of their own, so a fifth build cannot arrive nameable.
 */
export const profileNameProblem = (name: string): string | undefined => {
  const segment = _pathSegmentProblem(name, 'profile name');
  if (segment) return segment;
  if ((APP_ENVS as readonly string[]).includes(name)) {
    return `"${name}" is a build, so it can't also be a profile name: \`--build ${name}\` names the app and`
      + ` \`--profile <name>\` names a data dir it opens. Pick a name for the data dir — \`${name}-work\`, say.`;
  }
  return undefined;
};

/**
 * The directory for a name, which is an immediate child of the profiles root or an error.
 *
 * **The containment check is an assertion, not a gate**: `profileNameProblem` above has already refused
 * every separator, so nothing can reach the second throw while that rule holds. It is here because the
 * consequence of that rule weakening is `fs.rm` on a directory nobody named — the header on
 * `profileNameProblem` has the worked example — and nothing removes a directory this did not return.
 *
 * **The edit that makes it fire is a weakening of the name rule**, which is what to mutate to watch it:
 * drop the `_pathSegmentProblem` call, and `../../abuddy` arrives here. That is also how the check was
 * found to be unable to fire *at all*: it compared `path.resolve(root, name)` with
 * `path.join(root, name)`, and both normalise `..` the same way, so the two sides agreed on every input —
 * `../../abuddy` resolved to the real production data dir and was returned. Two expressions that cannot
 * disagree are what redundancy looks like rather than what protection looks like. `path.dirname` is the
 * claim the comment was always making: one level under the root, and nowhere else.
 */
export function profileDir(dirs: CliDirs, name: string): string {
  const problem = profileNameProblem(name);
  if (problem) throw new Error(problem);
  const root = profilesRoot(dirs);
  const dir = path.resolve(root, name);
  if (path.dirname(dir) !== root) throw new Error(`"${name}" doesn't resolve inside ${root}.`);
  return dir;
}

const readRecord = (dir: string): ProfileRecord | undefined => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf-8')) as ProfileRecord;
  } catch {
    return undefined;
  }
};

const writeRecord = (dir: string, record: ProfileRecord): void => {
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify(record, null, 2) + '\n');
};

/**
 * Whether an app has this profile open, from the port file a running API publishes.
 *
 * The path comes from `resolveAppContext` rather than a join of its own: it is the API that writes that file,
 * and a second opinion about where is a refusal that never fires. It read `<dir>/api-port` while the API wrote
 * `<dir>/abuddy/api-port` for exactly one commit, which made every check below answer "no app" — and the spec
 * covering it held the same wrong path, so the suite stayed green. The environment is immaterial here: every
 * path in the returned context is joined onto the data dir it is given.
 *
 * Three callers ask:
 * what `clean` may remove, what `removeProfile` refuses, and what `drive` refuses to launch a second app
 * over. Taking a data dir from a running app does not stop it — it writes the directory back — and
 * Electron allows one app per data dir, so both refusals are the same question.
 */
export function profileInUse(dir: string): boolean {
  return readApiEndpoint(resolveAppContext({ build: 'development', profile: dir }).apiPortFile) !== null;
}

/**
 * The Chromium using a data dir, from the lock it writes there — a **second** signal beside the API's port
 * file, and deliberately a weaker one.
 *
 * **Why a second at all.** `profileInUse` reads what the *API* publishes, and an Electron can be running
 * with no port file: its API has not come up yet, or died, or a record was removed. Observed on the
 * author's machine, 2026-10-10: a development app alive with its port file, app lock and session all gone,
 * so every tool here reported no app — `trim` would have swept the caches under a running browser and
 * `stop` had nothing to signal.
 *
 * **Why it is not the only signal, and why `findRunningApp` is right to refuse it.** This is another
 * product's private format, written on POSIX only, and it fails *open*: unreadable, or Windows, and the
 * answer is silently "nothing here". That is unacceptable for the question `@abuddy/host/database` asks,
 * where a wrong "no app" means a tool writes under a running one. Here it is only ever *added* to the
 * primary signal, so it can find an app the port file misses and can never hide one it finds.
 */
export function chromiumHolding(dir: string): number | undefined {
  let target: string;
  try {
    target = fs.readlinkSync(path.join(dir, 'SingletonLock'));
  } catch {
    return undefined;
  }
  // `<hostname>-<pid>`, and a hostname may hold dashes, so the pid is what follows the last one
  const pid = Number(target.slice(target.lastIndexOf('-') + 1));
  return Number.isInteger(pid) && pid > 0 && lockIsHeld(pid) ? pid : undefined;
}

/** Whether anything is using a data dir: the API's port file, or the browser's own lock. */
export const dataDirInUse = (dir: string): boolean => profileInUse(dir) || chromiumHolding(dir) !== undefined;

export interface OpenedProfile {
  name: string;
  dir: string;
  /** Removed when the run ends. `--fresh --rm` is how it is asked for; this is what it is */
  ephemeral: boolean;
  /** This call created it. `--with-secrets` acts only on a new one: an existing profile has its own already */
  created: boolean;
}

/**
 * Ends the process holding a data dir and waits for the dir to come free.
 *
 * **SIGTERM, never SIGKILL**: the holder's own handler closes the app it has and lets LMDB shut down, where
 * a kill leaves the store to recover on next boot. And **what is waited for is the data dir**, not the
 * signal being delivered or even the process going — a second Electron started before the dir clears is
 * the failure this exists to prevent, and `profileInUse` reads the API's port file, which is what says the
 * dir is still held.
 *
 * The pid belongs to whatever record named it — a session file's `supervisorPid`, or the app lock's — and
 * both mean the same thing by it: the one process to signal. Nothing here reads a pid for itself.
 */
export async function endAppHolding(dir: string, pid: number, timeoutMs = 20_000): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already gone between reading the record and signalling it, which is a miss rather than a problem
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!lockIsHeld(pid) && !profileInUse(dir)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The app on ${dir} (pid ${pid}) did not exit within ${Math.round(timeoutMs / 1000)}s. Close it and try again.`);
}

/**
 * Chromium's own caches inside a data dir: everything it will make again, and nothing anybody would miss.
 *
 * **This is where a development data dir's size is.** Measured 2026-10-10: 1.6GB in all, of which `Cache`
 * was 1.0GB and `Code Cache` 312MB, against **5MB** in `abuddy/` — the notes, flows and keys. So
 * reclaiming one is a cache sweep, and removing the directory is the wrong instrument: it would throw away
 * the 5MB that cannot be got back to free the 1.3GB that comes back by itself.
 *
 * **A production dir is the other shape**, which is the reason the exclusions below are not a precaution:
 * the same measurement gave back 13MB of its 1.4GB, because 666MB of it is `Partitions` and the rest is
 * the user's media and database. Sweeping by size rather than by name would have taken the browser's
 * logins first.
 *
 * **What is deliberately not here is the rest of the list**, and each exclusion is something a user would
 * notice: `Local Storage` holds the panel sizes and whatever `runFrontendMigrations` moved, `Partitions`
 * holds the in-app browser's logged-in sessions (`persist:browser`, 292MB of that same dir), and
 * `Preferences`, `Cookies`, `Session Storage` and `Trust Tokens` are state rather than cache. The app
 * writes none of the names below — `getDataDirPath` refuses them outright so a pack cannot shadow one —
 * which is what makes them Chromium's alone to rebuild.
 */
export const REGENERABLE_DIRS = [
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Shared Dictionary', 'blob_storage',
] as const;

/** What a trim freed on one data dir, and what it left alone because an app is using it. */
export interface Trimmed {
  readonly dir: string;
  readonly freed: number;
  /** Why nothing was removed, when nothing was */
  readonly refused?: string;
}

/**
 * Removes the caches above from one data dir and answers with what that freed.
 *
 * **Refused while an app is running on it**, because Chromium has those files open: the sweep would be
 * deleting under a live browser, and what it reclaimed would partly come straight back. The app is the
 * thing to close, so that is what the message says rather than offering a flag to do it anyway.
 *
 * A dir that is not there is not an error — a build nobody has run has nothing to trim, and saying so with
 * a zero is the same answer in a form the caller can total.
 */
export function trimDataDir(dir: string, bytes: (dir: string) => number = dirBytes): Trimmed {
  if (!fs.existsSync(dir)) return { dir, freed: 0, refused: 'no data dir yet' };
  if (dataDirInUse(dir)) return { dir, freed: 0, refused: 'an app is running on it' };
  let freed = 0;
  for (const name of REGENERABLE_DIRS) {
    const cache = path.join(dir, name);
    if (!fs.existsSync(cache)) continue;
    freed += bytes(cache);
    fs.rmSync(cache, { recursive: true, force: true });
  }
  return { dir, freed };
}

/** A profile by name, created if it isn't there yet. */
export function openProfile(dirs: CliDirs, name: string): OpenedProfile {
  const dir = profileDir(dirs, name);
  // **`created` is about the record, not the directory**, because the two are not the same question and
  // `--rm` turns on the answer: a caller may have made the dir for its own reasons before `dev` opens it —
  // `drive`'s spawn puts its log in there before the app starts — and an existing-*dir* test then reports
  // somebody else's profile, refusing `--rm` for a dir this run is in the middle of creating. A dir with no
  // record is not a profile yet, which is the same rule `listProfiles` and `notAProfile` read.
  const existed = readRecord(dir) !== undefined;
  fs.mkdirSync(dir, { recursive: true });
  if (!existed) writeRecord(dir, { created: new Date().toISOString() });
  return { name, dir, ephemeral: false, created: !existed };
}

/**
 * A new profile nobody has used. `recursive: false` on purpose: a name collision is an error worth
 * seeing rather than a silent reuse of someone else's data.
 */
export function mintProfile(dirs: CliDirs, ephemeral: boolean): OpenedProfile {
  const name = randomId({ length: 10 });
  const dir = ephemeral
    ? path.join(profilesRoot(dirs), EPHEMERAL, `${process.pid}-${name}`)
    : profileDir(dirs, name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir);
  writeRecord(dir, { created: new Date().toISOString(), ...(ephemeral ? { pid: process.pid } : {}) });
  return { name: ephemeral ? path.basename(dir) : name, dir, ephemeral, created: true };
}

export interface ListedProfile {
  name: string;
  dir: string;
  created?: string;
  /** Minted by `--fresh --rm`, so it lives under `.ephemeral` and its owner removes it */
  ephemeral: boolean;
  /** An app is running on it right now, whoever started it */
  inUse: boolean;
  /** Ephemeral, with neither its `abuddy dev` nor an app still going: a crash left it, and it can go */
  leaked: boolean;
  bytes: number;
}

/** Everything on disk, named and ephemeral. Sizes are reported because a Chromium profile is not small. */
export function listProfiles(dirs: CliDirs): ListedProfile[] {
  const root = profilesRoot(dirs);
  const read = (dir: string, ephemeral: boolean): ListedProfile => {
    const record = readRecord(dir);
    const inUse = profileInUse(dir);
    return {
      name: path.basename(dir),
      dir,
      created: record?.created,
      ephemeral,
      inUse,
      // Two holders, and both have to be gone. The pid is the `abuddy dev` that made it; the app is the
      // one that has the data open, and it outlives a killed run — measured, by killing a run and
      // watching its app rebuild the directory that had just been removed underneath it. `lockIsHeld` is
      // `processExists`, whose contract is the one this needs: never miss a live holder, because
      // inventing a dead one deletes a running app's data.
      leaked: ephemeral && !inUse && (record?.pid === undefined || !lockIsHeld(record.pid)),
      bytes: dirBytes(dir),
    };
  };
  const named = entries(root).filter(name => name !== EPHEMERAL).map(name => read(path.join(root, name), false));
  const ephemeral = entries(path.join(root, EPHEMERAL)).map(name => read(path.join(root, EPHEMERAL, name), true));
  return [...named, ...ephemeral];
}

const entries = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
};

/** Bytes as a person reads them. Beside `dirBytes` because two commands format what it returns. */
export const size = (bytes: number): string =>
  (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)}GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)}MB` : `${Math.round(bytes / 1e3)}kB`);

/** What a directory holds, for a command deciding whether reclaiming it is worth it */
export function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    try {
      total += fs.statSync(path.join(entry.parentPath, entry.name)).size;
    } catch {}
  }
  return total;
}

/**
 * Removes a profile, refusing anything this module didn't hand out and anything an app still has open.
 * The second refusal is not politeness: an app whose data dir is removed underneath it keeps running and
 * writes it back, so the directory returns and the removal only corrupted what was in it.
 */
/**
 * Why `resolved` is not a profile that may be removed, or nothing.
 *
 * It says what a profile **is** — a directory directly in the root, or one under `.ephemeral` — rather
 * than where it is not, because both holes this guard has had were a containment check that happened to
 * admit a container. `resolved !== root` exempted the root, which would have removed every profile in
 * one call; tightening that to a prefix test still admitted `.ephemeral`, which holds every ephemeral
 * one. Neither had a caller, and each was one future caller away from being real. A rule phrased as
 * "inside X" has a container for every level it does not enumerate; phrased as "is a profile" it has
 * none.
 */
function notAProfile(root: string, resolved: string): string | undefined {
  const rel = path.relative(root, resolved);
  if (rel === '') return 'that is the profiles directory itself, not a profile in it.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return `it is not inside ${root}.`;
  if (rel === EPHEMERAL) return 'that is where every ephemeral profile lives, not one of them.';

  const parts = rel.split(path.sep);
  const isProfile = parts.length === 1 || (parts.length === 2 && parts[0] === EPHEMERAL);
  return isProfile
    ? undefined
    : `a profile is a directory in ${root}, or one under ${EPHEMERAL}/.`;
}

/**
 * Renames a named profile, refusing what `removeProfile` refuses and two things only a rename can hit.
 *
 * The source goes through `notAProfile`, so neither the root nor `.ephemeral` can be moved; the target
 * through `profileDir`, which applies the name rule and the containment check. An existing target is
 * refused rather than merged into — `fs.renameSync` onto a directory either throws or replaces depending on
 * the platform and whether it is empty, and neither is an answer to "rename this".
 *
 * An app with the profile open is refused for `removeProfile`'s reason, one step worse: a running app
 * holds paths inside the directory, so moving it leaves the app writing to a path that no longer exists.
 */
export function renameProfile(dirs: CliDirs, from: string, to: string): { dir: string } {
  const root = profilesRoot(dirs);
  const source = path.resolve(profileDir(dirs, from));
  const problem = notAProfile(root, source);
  if (problem) throw new Error(`Refusing to rename ${source}: ${problem}`);
  if (!fs.existsSync(source)) throw new Error(`No profile named "${from}".`);
  const target = profileDir(dirs, to);
  if (fs.existsSync(target)) throw new Error(`A profile named "${to}" already exists (${target}).`);
  if (profileInUse(source)) {
    throw new Error(`An app is running on ${source}. Close it before renaming the profile.`);
  }
  fs.renameSync(source, target);
  return { dir: target };
}

export function removeProfile(dirs: CliDirs, dir: string): void {
  const root = profilesRoot(dirs);
  const resolved = path.resolve(dir);
  const problem = notAProfile(root, resolved);
  if (problem) throw new Error(`Refusing to remove ${resolved}: ${problem}`);
  if (profileInUse(resolved)) {
    throw new Error(`An app is running on ${resolved}. Close it before removing the profile.`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

/**
 * What the caller asked for on the command line.
 *
 * **`fresh` carries `rm` rather than being two kinds**, and so does `named`: whether a dir survives the
 * command is a property of the dir asked for, not a different kind of request, so it is a boolean on both
 * rather than two more members. `--rm` is the spelling `docker run --rm` made ordinary for exactly this.
 */
export type ProfileMode =
  | { kind: 'shared' }
  | { kind: 'named'; name: string; rm: boolean }
  | { kind: 'fresh'; rm: boolean };

export const PROFILE_USAGE = [
  '  --profile <name>    a data dir of its own, created the first time you name it',
  '  --fresh             a new profile, whose name is printed so you can come back to it',
  '  --fresh --rm        the same, removed when this command exits',
  '  --profile <name> --rm  the same for a name you choose, and only if this run creates it',
  '  --with-secrets      copy the secrets this environment already holds into the new profile, so a',
  '                      throwaway run can use them without you entering anything again',
].join('\n');

/**
 * Takes the profile flags out of the arguments, leaving the rest for `parseAppFlags`. They live here
 * rather than in `AppFlags` because `abuddy test` shares that parser and must never take them: its data
 * dir is a fresh temp one every run, which is what makes a test mean the same thing on any machine.
 */
export function parseProfileFlags(argv: string[]): { mode: ProfileMode; withSecrets: boolean; rest: string[] } {
  const rest: string[] = [];
  let withSecrets = false;
  let named: string | undefined;
  let fresh = false;
  let rm = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg];
    if (name === '--profile') {
      const value = inline ?? argv[++i];
      if (!value) throw new Error('--profile needs a name');
      named = value;
    } else if (name === '--fresh') {
      fresh = true;
    } else if (name === '--rm') {
      rm = true;
    } else if (name === '--with-secrets') {
      withSecrets = true;
    } else {
      rest.push(arg);
    }
  }
  // The flags are collected and the mode computed from them, rather than assigned as each is read: the
  // combinations are a property of the whole argv, and a `--rm` before its `--fresh` is the same request
  if (named !== undefined && fresh) throw new Error("--fresh can't be combined with --profile.");
  // `--rm` removes the dir **this run creates**, so it needs one to create: with no profile at all there is
  // nothing but the shared data dir, which is not something any flag should spell. With a name it is the
  // same request as `--fresh --rm` for a name you chose — which is what `drive`'s one-shot path needs, since
  // an app that outlives the command has to have a findable dir while it lives. `profileFor` holds the other
  // half: a profile that was already there is somebody's data, and `--rm` is refused rather than honoured.
  if (rm && !fresh && named === undefined) {
    throw new Error('--rm removes the profile this command creates: add --fresh, or --profile <name> for a name you choose. `abuddy profiles rm <name>` removes one that is already there.');
  }
  const mode: ProfileMode = fresh
    ? { kind: 'fresh', rm }
    : named !== undefined ? { kind: 'named', name: named, rm } : { kind: 'shared' };
  // Nothing to copy into: the shared data dir already has the keys, so this would be a no-op that reads
  // as if it did something
  if (withSecrets && mode.kind === 'shared') {
    throw new Error('--with-secrets needs a profile to copy into: add --profile <name> or --fresh.');
  }
  return { mode, withSecrets, rest };
}

/**
 * The profile a mode asks for, or nothing for the shared data dir.
 *
 * **`--rm` on a name is honoured only for a dir this call creates.** A profile that was already there holds
 * data somebody kept deliberately, and a run that removed it on the way out would be deleting it on the
 * strength of a flag meaning "clean up after me". So the refusal names what to run instead rather than
 * silently keeping the dir, which would read as having been obeyed.
 */
export function profileFor(mode: ProfileMode, dirs: CliDirs): OpenedProfile | undefined {
  if (mode.kind === 'shared') return undefined;
  if (mode.kind === 'fresh') return mintProfile(dirs, mode.rm);
  const opened = openProfile(dirs, mode.name);
  if (!mode.rm) return opened;
  if (!opened.created) {
    throw new Error(
      `The profile ${mode.name} is already there, so --rm won't remove it: it removes a profile this run creates.`
      + `\n  Use --fresh --rm for a throwaway one, or \`abuddy profiles rm ${mode.name}\` to remove this one.`,
    );
  }
  return { ...opened, ephemeral: true };
}

/**
 * A name for a profile nobody has used, for a caller that must know the name *before* the dir exists.
 *
 * `drive`'s one-shot path is the one: it spawns `dev` to open the profile and then waits for a session in
 * it, so it has to name the dir it will wait on. Minting the dir here instead would make `--with-secrets`
 * a no-op — that acts only on a profile the run created — and, for `--rm`, would put this process's pid in
 * an ephemeral dir's name while the app outlives it.
 */
export function freshProfileName(): string {
  return randomId({ length: 10 });
}
