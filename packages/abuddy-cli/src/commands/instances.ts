/**
 * What AgentBuddy data exists on this machine, and the verbs for the part of it you own.
 *
 * Two kinds of directory, listed apart because the difference is the whole point. An **environment** is
 * where an app of that channel keeps its data whatever anyone does — `production`, `beta`, `development`,
 * `test`, one per `APP_ENVS` — and nothing here removes one. An **instance** is a data dir you can throw
 * away (`app/instances.ts`), created on demand by `abuddy run --instance x` or by `new` below.
 *
 * Until this existed, `abuddy clean --instances` listed the instances and nothing listed the environments,
 * although that is where the bytes are: measured 2026-10-02, 1.4GB under `production` and 1.5GB under
 * `development` against 180MB of instances. That command is gone — its reclaiming is `rm` here, so there is
 * one door to deleting a data dir rather than two.
 */
import * as fs from 'node:fs';
import { _appDirOf, APP_ENVS, appDataDirFor, type AppEnv } from '@abuddy/sdk/env';
import { readHostInfo } from '@abuddy/host/packs';
import { errorMessage } from '@abuddy/sdk/utils/pure';
import { cliDirs, type CliDirs } from '../app/app-target';
import {
  dirBytes, instanceInUse, instanceNameProblem, listInstances, mintInstance, openInstance,
  removeInstance, renameInstance, size, type ListedInstance,
} from '../app/instances';

const HELP = `
Usage: abuddy instances [--sizes] [--ephemeral]
       abuddy instances new [name]
       abuddy instances rename <from> <to>
       abuddy instances rm <name>... | --leaked

List every AgentBuddy data dir on this machine: the environments an app of each channel uses, and the
instances you created. Works outside a pack — a data dir belongs to you rather than to any pack.

Options:
  --sizes        Add a size column. Off by default because it walks every directory: measured, 674ms for
                 production's 1.4GB and 1255ms for development's 1.5GB
  --ephemeral    Include the instances \`abuddy run --ephemeral\` made, and say which a dead run left
  --leaked       With rm, remove exactly those
  --help, -h     Show this help
`.trim();

/** One environment's data dir, as a row. `resolve` is a parameter so a spec can answer for a temp tree. */
export interface EnvironmentRow {
  env: AppEnv;
  dir: string;
  exists: boolean;
  /**
   * Whether the app's own directory is in there (`_appDirOf`), which is what tells a data dir from a
   * directory Electron left behind: measured on this machine, `development` holds 1.5GB of Chromium profile
   * and no app dir at all, and reporting that as a data dir with an unknown version says the wrong thing.
   */
  hasAppData: boolean;
  /** What the app that last used it recorded of itself (`host.json`), where it wrote one */
  version?: string;
  inUse: boolean;
}

export function environmentRows(resolve: (env: AppEnv) => string = appDataDirFor): EnvironmentRow[] {
  return APP_ENVS.map((env) => {
    const dir = resolve(env);
    const exists = fs.existsSync(dir);
    const hasAppData = exists && fs.existsSync(_appDirOf(dir));
    return {
      env,
      dir,
      exists,
      hasAppData,
      // Absent is a row rather than an omission: that nothing has ever run this channel here is the useful
      // half of the answer, and a missing line reads as a bug in the listing
      ...(hasAppData ? { version: readHostInfo(dir).version } : {}),
      inUse: exists && instanceInUse(dir),
    };
  });
}

const note = (instance: ListedInstance): string => (instance.inUse
  ? 'an app is running on it'
  : instance.leaked
    ? 'left by a run that has gone'
    : instance.ephemeral ? 'ephemeral' : '');

/**
 * What a listing asks of the machine. Both are parameters so a spec can answer for a temp tree and watch
 * whether `--sizes` is really what decides the walk — the listing's one performance claim, and the reason
 * sizes are opt-in at all.
 */
export interface ListOptions {
  sizes: boolean;
  ephemeral: boolean;
  resolve?: (env: AppEnv) => string;
  bytes?: (dir: string) => number;
}

export function list(dirs: CliDirs, { sizes, ephemeral, resolve, bytes = dirBytes }: ListOptions): void {
  /** Taken only where asked for, since taking it is the slow half */
  const sized = (dir: string): string => size(bytes(dir));
  const envs = environmentRows(resolve);
  const width = Math.max(...envs.map((row) => row.env.length), 'ENVIRONMENT'.length);

  console.log(`\n  ${'ENVIRONMENT'.padEnd(width)}${sizes ? '    SIZE' : ''}  APP         DATA DIR`);
  for (const row of envs) {
    const state = !row.exists ? '  (none yet)' : !row.hasAppData ? '  (no app data)' : row.inUse ? '  (running)' : '';
    console.log(`  ${row.env.padEnd(width)}${sizes ? `  ${(row.exists ? sized(row.dir) : '—').padStart(6)}` : ''}`
      + `  ${(row.version ?? '—').padEnd(10)}  ${row.dir}${state}`);
  }

  const instances = listInstances(dirs).filter((instance) => ephemeral || !instance.ephemeral);
  if (instances.length === 0) {
    console.log(`\n  no instances${ephemeral ? '' : ' (--ephemeral includes the throwaway ones)'}\n`);
    return;
  }
  const names = Math.max(...instances.map((instance) => instance.name.length), 'INSTANCE'.length);
  console.log(`\n  ${'INSTANCE'.padEnd(names)}${sizes ? '    SIZE' : ''}  CREATED`);
  for (const instance of instances) {
    console.log(`  ${instance.name.padEnd(names)}${sizes ? `  ${sized(instance.dir).padStart(6)}` : ''}`
      + `  ${(instance.created ?? '—').slice(0, 10).padEnd(10)} ${note(instance)}`.trimEnd());
  }
  console.log();
}

/**
 * A new instance. A name that is already taken is refused rather than opened: `openInstance` exists for
 * `run --instance x`, where reusing the dir you named last time is the whole point, and here it would hand
 * you someone else's data under the impression you had made something.
 */
export function create(dirs: CliDirs, name: string | undefined): void {
  if (name === undefined) {
    const minted = mintInstance(dirs, false);
    console.log(`  created ${minted.name}\n  ${minted.dir}\n\n  abuddy run --instance ${minted.name}`);
    return;
  }
  const problem = instanceNameProblem(name);
  if (problem) throw new Error(problem);
  const opened = openInstance(dirs, name);
  if (!opened.created) throw new Error(`An instance named "${name}" already exists (${opened.dir}).`);
  console.log(`  created ${opened.name}\n  ${opened.dir}\n\n  abuddy run --instance ${opened.name}`);
}

export function remove(dirs: CliDirs, names: string[], leaked: boolean): void {
  const instances = listInstances(dirs);
  const doomed = leaked
    ? instances.filter((instance) => instance.leaked)
    : names.map((name) => {
      const found = instances.find((instance) => instance.name === name);
      if (!found) throw new Error(`No instance named "${name}". Run abuddy instances to see what there is.`);
      return found;
    });

  if (doomed.length === 0) {
    console.log(leaked ? '  no instances were left behind' : '  nothing to remove');
    return;
  }

  let reclaimed = 0;
  for (const instance of doomed) {
    const bytes = dirBytes(instance.dir);
    // Per instance, because the state was read a moment ago: an app started since makes `removeInstance`
    // refuse, and one refusal should not stop the rest from being considered
    try {
      removeInstance(dirs, instance.dir);
      reclaimed += bytes;
      console.log(`  removed  ${instance.name.padEnd(24)} ${size(bytes).padStart(6)}`);
    } catch (error) {
      console.log(`  kept     ${instance.name.padEnd(24)}        ${errorMessage(error)}`);
    }
  }
  if (reclaimed > 0) console.log(`\n  reclaimed ${size(reclaimed)}`);
}

export async function instances(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const [subcommand, ...rest] = args.filter((arg) => !arg.startsWith('--'));
  const flags = args.filter((arg) => arg.startsWith('--'));
  // Rejected rather than ignored, for `clean`'s reason: this command removes directories, and a mistyped
  // flag that fell through used to take the pack's build output with it
  const known = ['--sizes', '--ephemeral', '--leaked'];
  const unknown = flags.filter((flag) => !known.includes(flag));
  if (unknown.length > 0) throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy instances --help.`);

  const dirs = cliDirs();
  switch (subcommand) {
    case undefined:
      list(dirs, { sizes: flags.includes('--sizes'), ephemeral: flags.includes('--ephemeral') });
      return;
    case 'new':
      if (rest.length > 1) throw new Error('abuddy instances new takes one name, or none to mint one.');
      create(dirs, rest[0]);
      return;
    case 'rename': {
      if (rest.length !== 2) throw new Error('abuddy instances rename takes the name it has and the name it should have.');
      const { dir } = renameInstance(dirs, rest[0]!, rest[1]!);
      console.log(`  renamed ${rest[0]} to ${rest[1]}\n  ${dir}`);
      return;
    }
    case 'rm': {
      const leaked = flags.includes('--leaked');
      // Neither and both are different mistakes, and one message for the two told whoever passed nothing
      // that they had passed too much
      if (!leaked && rest.length === 0) {
        throw new Error('abuddy instances rm takes a name, or --leaked for the ones a killed run left.');
      }
      if (leaked && rest.length > 0) {
        throw new Error(`abuddy instances rm takes names or --leaked, not both. Drop --leaked to remove ${rest.join(', ')}.`);
      }
      remove(dirs, rest, leaked);
      return;
    }
    default:
      throw new Error(`Unknown subcommand "${subcommand}". See abuddy instances --help.`);
  }
}
