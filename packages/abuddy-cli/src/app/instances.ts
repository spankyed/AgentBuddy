/**
 * Instances: a data dir you can throw away.
 *
 * `abuddy run` launches into the one shared `development` data dir, so every run inherits what the last
 * one left — seeded packs, half-migrated rows, settings from a pack you have since deleted. An instance
 * is that dir, somewhere else, created on demand and disposable.
 *
 * **It is a data dir and nothing more.** `appName` stays `APP_NAMES[env]`, so the environment, the
 * Electron app identity and the URL scheme are untouched, and `--app beta` works: a packaged build stamps
 * its own channel and ignores `ABUDDY_ENV`, where `ABUDDY_USER_DATA_DIR` reaches it. Nothing here is a new
 * concept the app has to learn — an empty directory is already a valid data dir, which is what the E2E
 * fixture has relied on all along.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lockIsHeld, readApiEndpoint } from '@abuddy/host/process-liveness';
import { randomId } from '@abuddy/sdk/utils/pure';
import type { CliDirs } from './app-target';

/** Which kind of app wrote an instance. See `bindingProblem` for why it is recorded. */
export type InstanceKind = 'source' | 'packaged';

/** What an instance records about itself, in `.abuddy-instance.json` at its root. */
interface InstanceRecord {
  kind: InstanceKind;
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
 * instance, `fs.rm`, so `../../../abuddy-dev` would resolve to the real development data dir and delete
 * it. The reserved names and the trailing dot/space rule are Windows'; the rest keeps a name to something
 * that survives a case-insensitive filesystem and a shell.
 */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function instanceNameProblem(name: string): string | undefined {
  if (!NAME.test(name)) {
    return `"${name}" isn't a usable instance name: letters, digits, dot, dash and underscore, starting with a letter or digit, up to 64 characters.`;
  }
  if (RESERVED.test(name) || /[. ]$/.test(name)) return `"${name}" is reserved by the filesystem.`;
  return undefined;
}

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
 * Why this instance can't be used by this kind of app, or nothing.
 *
 * An instance is bound to the kind that created it, and the reason is not policy: `NODE_ENV` for the API
 * comes from `app.isPackaged` rather than from the environment, so a source run keeps its stores under
 * `<dir>/.data/` and a packaged one under `<dir>/`. Point one instance at both and it holds two databases
 * — each app silently seeing its own empty world, and `findAppDataPaths` refusing the dir outright from
 * then on. Better to refuse the second launch than to hand back a dir no tool can open.
 */
export function bindingProblem(dir: string, kind: InstanceKind): string | undefined {
  const record = readRecord(dir);
  if (!record || record.kind === kind) return undefined;
  const asked = kind === 'source' ? 'a checkout' : 'a packaged build';
  const has = record.kind === 'source' ? 'a checkout' : 'a packaged build';
  return `${dir} was created by ${has} and can't also be used by ${asked}: the two keep their databases in `
    + 'different places, and a dir holding both is one no tool can open. Use a different instance.';
}

export interface OpenedInstance {
  name: string;
  dir: string;
  /** Removed when the run ends */
  ephemeral: boolean;
}

/** An instance by name, created if it isn't there yet. */
export function openInstance(dirs: CliDirs, name: string, kind: InstanceKind): OpenedInstance {
  const dir = instanceDir(dirs, name);
  const problem = bindingProblem(dir, kind);
  if (problem) throw new Error(problem);
  fs.mkdirSync(dir, { recursive: true });
  if (!readRecord(dir)) writeRecord(dir, { kind, created: new Date().toISOString() });
  return { name, dir, ephemeral: false };
}

/**
 * A new instance nobody has used. `recursive: false` on purpose: a name collision is an error worth
 * seeing rather than a silent reuse of someone else's data.
 */
export function mintInstance(dirs: CliDirs, kind: InstanceKind, ephemeral: boolean): OpenedInstance {
  const name = randomId({ length: 10 });
  const dir = ephemeral
    ? path.join(instancesRoot(dirs), EPHEMERAL, `${process.pid}-${name}`)
    : instanceDir(dirs, name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir);
  writeRecord(dir, { kind, created: new Date().toISOString(), ...(ephemeral ? { pid: process.pid } : {}) });
  return { name: ephemeral ? path.basename(dir) : name, dir, ephemeral };
}

export interface ListedInstance {
  name: string;
  dir: string;
  kind?: InstanceKind;
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
    const inUse = readApiEndpoint(path.join(dir, 'api-port')) !== null;
    return {
      name: path.basename(dir),
      dir,
      kind: record?.kind,
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

function dirBytes(dir: string): number {
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
export function removeInstance(dirs: CliDirs, dir: string): void {
  const root = instancesRoot(dirs);
  const resolved = path.resolve(dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to remove ${resolved}: it is not inside ${root}.`);
  }
  if (readApiEndpoint(path.join(resolved, 'api-port')) !== null) {
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
].join('\n');

/**
 * Takes the instance flags out of the arguments, leaving the rest for `parseAppFlags`. They live here
 * rather than in `AppFlags` because `abuddy test` shares that parser and must never take them: its data
 * dir is a fresh temp one every run, which is what makes a test mean the same thing on any machine.
 */
export function parseInstanceFlags(argv: string[]): { mode: InstanceMode; rest: string[] } {
  const rest: string[] = [];
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
    } else {
      rest.push(arg);
    }
  }
  return { mode, rest };
}

/** The instance a mode asks for, or nothing for the shared data dir. */
export function instanceFor(mode: InstanceMode, kind: InstanceKind, dirs: CliDirs): OpenedInstance | undefined {
  if (mode.kind === 'shared') return undefined;
  if (mode.kind === 'named') return openInstance(dirs, mode.name, kind);
  return mintInstance(dirs, kind, mode.kind === 'ephemeral');
}
