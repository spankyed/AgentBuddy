/**
 * Instances: a data dir you can throw away.
 *
 * `abuddy run` launches into the one shared `development` data dir, so every run inherits what the last
 * one left — applied content, half-migrated rows, settings from a pack you have since deleted. An instance
 * is that dir, somewhere else, created on demand and disposable.
 *
 * **It is a data dir and nothing more.** `appName` stays `APP_NAMES[env]`, so the environment, the
 * Electron app identity and the URL scheme are untouched, and `--app beta` works: a packaged build stamps
 * its own channel and ignores `ABUDDY_ENV`, where `ABUDDY_USER_DATA_DIR` reaches it. Nothing here is a new
 * concept the app has to learn — an empty directory is already a valid data dir, which is what the E2E
 * fixture has relied on all along.
 *
 * An instance used to be bound to the kind of app that created it, because a checkout and a packaged build
 * kept their stores in different places inside it. One layout later, a dir is a dir: `abuddy run --instance x`
 * against a checkout and against `--app beta` now mean the same directory, and `bindingProblem` is gone.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAppContext } from '@abuddy/sdk/env';
import { lockIsHeld, readApiEndpoint } from '@abuddy/host/process-liveness';
import { _pathSegmentProblem, randomId } from '@abuddy/sdk/utils/pure';
import type { CliDirs } from './app-target';

/** What an instance records about itself, in `.abuddy-instance.json` at its root. */
interface InstanceRecord {
  created: string;
  /** The `abuddy run` that owns an ephemeral instance, so a later run can tell a leak from a live one */
  pid?: number;
}

const MARKER = '.abuddy-instance.json';
/** Ephemeral instances live apart from named ones, so reclaiming by pid can never eat a name that looks like one. */
const EPHEMERAL = '.ephemeral';

const instancesRoot = (dirs: CliDirs) => path.join(dirs.data, 'instances');

/**
 * A name is a single path segment and is checked as one. It reaches `path.join` and, for an ephemeral
 * instance, `fs.rm`, so `../../../abuddy-dev` would resolve to the real development data dir and delete it.
 *
 * The rule itself is `_pathSegmentProblem`: a pack's data directory name needs the same one, and the copy
 * that governed it was missing the filesystem's reserved names.
 */
export const instanceNameProblem = (name: string): string | undefined => _pathSegmentProblem(name, 'instance name');

/**
 * The directory for a name, checked to be inside the instances root. The regex above already refuses a
 * separator, so this is the belt to its braces: nothing removes a directory that this did not return.
 */
export function instanceDir(dirs: CliDirs, name: string): string {
  const problem = instanceNameProblem(name);
  if (problem) throw new Error(problem);
  const root = instancesRoot(dirs);
  const dir = path.resolve(root, name);
  if (dir !== path.join(root, name)) throw new Error(`"${name}" doesn't resolve inside ${root}.`);
  return dir;
}

const readRecord = (dir: string): InstanceRecord | undefined => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf-8')) as InstanceRecord;
  } catch {
    return undefined;
  }
};

const writeRecord = (dir: string, record: InstanceRecord): void => {
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify(record, null, 2) + '\n');
};

/**
 * Whether an app has this instance open, from the port file a running API publishes.
 *
 * The path comes from `resolveAppContext` rather than a join of its own: it is the API that writes that file,
 * and a second opinion about where is a refusal that never fires. It read `<dir>/api-port` while the API wrote
 * `<dir>/abuddy/api-port` for exactly one commit, which made every check below answer "no app" — and the spec
 * covering it held the same wrong path, so the suite stayed green. The environment is immaterial here: every
 * path in the returned context is joined onto the data dir it is given.
 *
 * Three callers ask:
 * what `clean` may remove, what `removeInstance` refuses, and what `drive` refuses to launch a second app
 * over. Taking a data dir from a running app does not stop it — it writes the directory back — and
 * Electron allows one app per data dir, so both refusals are the same question.
 */
export function instanceInUse(dir: string): boolean {
  return readApiEndpoint(resolveAppContext({ env: 'development', userDataDir: dir }).apiPortFile) !== null;
}

export interface OpenedInstance {
  name: string;
  dir: string;
  /** Removed when the run ends */
  ephemeral: boolean;
  /** This call created it. `--with-secrets` acts only on a new one: an existing instance has its own already */
  created: boolean;
}

/** An instance by name, created if it isn't there yet. */
export function openInstance(dirs: CliDirs, name: string): OpenedInstance {
  const dir = instanceDir(dirs, name);
  const existed = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true });
  if (!readRecord(dir)) writeRecord(dir, { created: new Date().toISOString() });
  return { name, dir, ephemeral: false, created: !existed };
}

/**
 * A new instance nobody has used. `recursive: false` on purpose: a name collision is an error worth
 * seeing rather than a silent reuse of someone else's data.
 */
export function mintInstance(dirs: CliDirs, ephemeral: boolean): OpenedInstance {
  const name = randomId({ length: 10 });
  const dir = ephemeral
    ? path.join(instancesRoot(dirs), EPHEMERAL, `${process.pid}-${name}`)
    : instanceDir(dirs, name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir);
  writeRecord(dir, { created: new Date().toISOString(), ...(ephemeral ? { pid: process.pid } : {}) });
  return { name: ephemeral ? path.basename(dir) : name, dir, ephemeral, created: true };
}

export interface ListedInstance {
  name: string;
  dir: string;
  created?: string;
  ephemeral: boolean;
  /** An app is running on it right now, whoever started it */
  inUse: boolean;
  /** Ephemeral, with neither its `abuddy run` nor an app still going: a crash left it, and it can go */
  leaked: boolean;
  bytes: number;
}

/** Everything on disk, named and ephemeral. Sizes are reported because a Chromium profile is not small. */
export function listInstances(dirs: CliDirs): ListedInstance[] {
  const root = instancesRoot(dirs);
  const read = (dir: string, ephemeral: boolean): ListedInstance => {
    const record = readRecord(dir);
    const inUse = instanceInUse(dir);
    return {
      name: path.basename(dir),
      dir,
      created: record?.created,
      ephemeral,
      inUse,
      // Two holders, and both have to be gone. The pid is the `abuddy run` that made it; the app is the
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
 * Removes an instance, refusing anything this module didn't hand out and anything an app still has open.
 * The second refusal is not politeness: an app whose data dir is removed underneath it keeps running and
 * writes it back, so the directory returns and the removal only corrupted what was in it.
 */
/**
 * Why `resolved` is not an instance that may be removed, or nothing.
 *
 * It says what an instance **is** — a directory directly in the root, or one under `.ephemeral` — rather
 * than where it is not, because both holes this guard has had were a containment check that happened to
 * admit a container. `resolved !== root` exempted the root, which would have removed every instance in
 * one call; tightening that to a prefix test still admitted `.ephemeral`, which holds every ephemeral
 * one. Neither had a caller, and each was one future caller away from being real. A rule phrased as
 * "inside X" has a container for every level it does not enumerate; phrased as "is an instance" it has
 * none.
 */
function notAnInstance(root: string, resolved: string): string | undefined {
  const rel = path.relative(root, resolved);
  if (rel === '') return 'that is the instances directory itself, not an instance in it.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return `it is not inside ${root}.`;
  if (rel === EPHEMERAL) return 'that is where every ephemeral instance lives, not one of them.';

  const parts = rel.split(path.sep);
  const isInstance = parts.length === 1 || (parts.length === 2 && parts[0] === EPHEMERAL);
  return isInstance
    ? undefined
    : `an instance is a directory in ${root}, or one under ${EPHEMERAL}/.`;
}

/**
 * Renames a named instance, refusing what `removeInstance` refuses and two things only a rename can hit.
 *
 * The source goes through `notAnInstance`, so neither the root nor `.ephemeral` can be moved; the target
 * through `instanceDir`, which applies the name rule and the containment check. An existing target is
 * refused rather than merged into — `fs.renameSync` onto a directory either throws or replaces depending on
 * the platform and whether it is empty, and neither is an answer to "rename this".
 *
 * An app with the instance open is refused for `removeInstance`'s reason, one step worse: a running app
 * holds paths inside the directory, so moving it leaves the app writing to a path that no longer exists.
 */
export function renameInstance(dirs: CliDirs, from: string, to: string): { dir: string } {
  const root = instancesRoot(dirs);
  const source = path.resolve(instanceDir(dirs, from));
  const problem = notAnInstance(root, source);
  if (problem) throw new Error(`Refusing to rename ${source}: ${problem}`);
  if (!fs.existsSync(source)) throw new Error(`No instance named "${from}".`);
  const target = instanceDir(dirs, to);
  if (fs.existsSync(target)) throw new Error(`An instance named "${to}" already exists (${target}).`);
  if (instanceInUse(source)) {
    throw new Error(`An app is running on ${source}. Close it before renaming the instance.`);
  }
  fs.renameSync(source, target);
  return { dir: target };
}

export function removeInstance(dirs: CliDirs, dir: string): void {
  const root = instancesRoot(dirs);
  const resolved = path.resolve(dir);
  const problem = notAnInstance(root, resolved);
  if (problem) throw new Error(`Refusing to remove ${resolved}: ${problem}`);
  if (instanceInUse(resolved)) {
    throw new Error(`An app is running on ${resolved}. Close it before removing the instance.`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

/** What the caller asked for on the command line. */
export type InstanceMode =
  | { kind: 'shared' }
  | { kind: 'named'; name: string }
  | { kind: 'fresh' }
  | { kind: 'ephemeral' };

export const INSTANCE_USAGE = [
  '  --instance <name>   a data dir of its own, created the first time you name it',
  '  --fresh             a new instance, whose name is printed so you can come back to it',
  '  --ephemeral         a new instance, removed when this command exits',
  '  --with-secrets      copy the secrets this environment already holds into the new instance, so a',
  '                      throwaway run can use them without you entering anything again',
].join('\n');

/**
 * Takes the instance flags out of the arguments, leaving the rest for `parseAppFlags`. They live here
 * rather than in `AppFlags` because `abuddy test` shares that parser and must never take them: its data
 * dir is a fresh temp one every run, which is what makes a test mean the same thing on any machine.
 */
export function parseInstanceFlags(argv: string[]): { mode: InstanceMode; withSecrets: boolean; rest: string[] } {
  const rest: string[] = [];
  let withSecrets = false;
  let mode: InstanceMode = { kind: 'shared' };
  const set = (next: InstanceMode, flag: string) => {
    if (mode.kind !== 'shared') throw new Error(`${flag} can't be combined with --${mode.kind === 'named' ? 'instance' : mode.kind}.`);
    mode = next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg];
    if (name === '--instance') {
      const value = inline ?? argv[++i];
      if (!value) throw new Error('--instance needs a name');
      set({ kind: 'named', name: value }, '--instance');
    } else if (name === '--fresh') {
      set({ kind: 'fresh' }, '--fresh');
    } else if (name === '--ephemeral') {
      set({ kind: 'ephemeral' }, '--ephemeral');
    } else if (name === '--with-secrets') {
      withSecrets = true;
    } else {
      rest.push(arg);
    }
  }
  // Nothing to copy into: the shared data dir already has the keys, so this would be a no-op that reads
  // as if it did something
  if (withSecrets && mode.kind === 'shared') {
    throw new Error('--with-secrets needs an instance to copy into: add --instance <name>, --fresh or --ephemeral.');
  }
  return { mode, withSecrets, rest };
}

/** The instance a mode asks for, or nothing for the shared data dir. */
export function instanceFor(mode: InstanceMode, dirs: CliDirs): OpenedInstance | undefined {
  if (mode.kind === 'shared') return undefined;
  if (mode.kind === 'named') return openInstance(dirs, mode.name);
  return mintInstance(dirs, mode.kind === 'ephemeral');
}
