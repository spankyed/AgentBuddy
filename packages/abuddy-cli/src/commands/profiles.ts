/**
 * What AgentBuddy data exists on this machine, and the verbs for the part of it you own.
 *
 * Two kinds of directory, listed apart because the difference is the whole point. An **environment** is
 * where an app of that channel keeps its data whatever anyone does — `production`, `beta`, `development`,
 * `test`, one per `APP_ENVS` — and nothing here removes one. An **profile** is a data dir you can throw
 * away (`app/profiles.ts`), created on demand by `abuddy run --profile x` or by `new` below. The word is
 * `profile` and not `instance` because an instance of an app is a running process, which is what Electron's
 * single-instance lock is about; a named, disposable data dir that leaves the app's identity alone is a
 * browser profile.
 *
 * **The environments are listed because that is where the bytes are**: measured 2026-10-02, 1.4GB under
 * `production` and 1.5GB under `development` against 180MB of profiles. Reclaiming any of it is `rm` here,
 * so there is one door to deleting a data dir rather than two.
 */
import * as fs from 'node:fs';
import { _appDirOf, APP_ENVS, appDataDirFor, type AppEnv } from '@abuddy/sdk/env';
import { readHostInfo } from '@abuddy/host/packs';
import { errorMessage } from '@abuddy/sdk/utils/pure';
import { cliDirs, type CliDirs } from '../app/app-target';
import {
  dirBytes, profileInUse, profileNameProblem, listProfiles, mintProfile, openProfile,
  removeProfile, renameProfile, size, type ListedProfile,
} from '../app/profiles';

const HELP = `
Usage: abuddy profiles [--sizes] [--all]
       abuddy profiles new [name]
       abuddy profiles rename <from> <to>
       abuddy profiles rm <name>... | --leaked

List every AgentBuddy data dir on this machine: the environments an app of each channel uses, and the
profiles you created. Works outside a pack — a data dir belongs to you rather than to any pack.

Options:
  --sizes        Add a size column. Off by default because it walks every directory: measured, 674ms for
                 production's 1.4GB and 1255ms for development's 1.5GB
  --all          Include the throwaway profiles \`--fresh --rm\` made, which the listing hides, and say
                 which a dead run left behind
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
      inUse: exists && profileInUse(dir),
    };
  });
}

const note = (profile: ListedProfile): string => (profile.inUse
  ? 'an app is running on it'
  : profile.leaked
    ? 'left by a run that has gone'
    : profile.ephemeral ? 'ephemeral' : '');

/**
 * What a listing asks of the machine. Both are parameters so a spec can answer for a temp tree and watch
 * whether `--sizes` is really what decides the walk — the listing's one performance claim, and the reason
 * sizes are opt-in at all.
 */
export interface ListOptions {
  sizes: boolean;
  /** Include the throwaway profiles the listing hides by default */
  all: boolean;
  resolve?: (env: AppEnv) => string;
  bytes?: (dir: string) => number;
}

export function list(dirs: CliDirs, { sizes, all, resolve, bytes = dirBytes }: ListOptions): void {
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

  const profiles = listProfiles(dirs).filter((profile) => all || !profile.ephemeral);
  if (profiles.length === 0) {
    console.log(`\n  no profiles${all ? '' : ' (--all includes the throwaway ones)'}\n`);
    return;
  }
  const names = Math.max(...profiles.map((profile) => profile.name.length), 'PROFILE'.length);
  console.log(`\n  ${'PROFILE'.padEnd(names)}${sizes ? '    SIZE' : ''}  CREATED`);
  for (const profile of profiles) {
    console.log(`  ${profile.name.padEnd(names)}${sizes ? `  ${sized(profile.dir).padStart(6)}` : ''}`
      + `  ${(profile.created ?? '—').slice(0, 10).padEnd(10)} ${note(profile)}`.trimEnd());
  }
  console.log();
}

/**
 * A new profile. A name that is already taken is refused rather than opened: `openProfile` exists for
 * `run --profile x`, where reusing the dir you named last time is the whole point, and here it would hand
 * you someone else's data under the impression you had made something.
 */
export function create(dirs: CliDirs, name: string | undefined): void {
  if (name === undefined) {
    const minted = mintProfile(dirs, false);
    console.log(`  created ${minted.name}\n  ${minted.dir}\n\n  abuddy run --profile ${minted.name}`);
    return;
  }
  const problem = profileNameProblem(name);
  if (problem) throw new Error(problem);
  const opened = openProfile(dirs, name);
  if (!opened.created) throw new Error(`A profile named "${name}" already exists (${opened.dir}).`);
  console.log(`  created ${opened.name}\n  ${opened.dir}\n\n  abuddy run --profile ${opened.name}`);
}

export function remove(dirs: CliDirs, names: string[], leaked: boolean): void {
  const profiles = listProfiles(dirs);
  const doomed = leaked
    ? profiles.filter((profile) => profile.leaked)
    : names.map((name) => {
      const found = profiles.find((profile) => profile.name === name);
      if (!found) throw new Error(`No profile named "${name}". Run abuddy profiles to see what there is.`);
      return found;
    });

  if (doomed.length === 0) {
    console.log(leaked ? '  no profiles were left behind' : '  nothing to remove');
    return;
  }

  let reclaimed = 0;
  for (const profile of doomed) {
    const bytes = dirBytes(profile.dir);
    // Per profile, because the state was read a moment ago: an app started since makes `removeProfile`
    // refuse, and one refusal should not stop the rest from being considered
    try {
      removeProfile(dirs, profile.dir);
      reclaimed += bytes;
      console.log(`  removed  ${profile.name.padEnd(24)} ${size(bytes).padStart(6)}`);
    } catch (error) {
      console.log(`  kept     ${profile.name.padEnd(24)}        ${errorMessage(error)}`);
    }
  }
  if (reclaimed > 0) console.log(`\n  reclaimed ${size(reclaimed)}`);
}

export async function profiles(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const [subcommand, ...rest] = args.filter((arg) => !arg.startsWith('--'));
  const flags = args.filter((arg) => arg.startsWith('--'));
  // Rejected rather than ignored, for `clean`'s reason: this command removes directories, and a mistyped
  // flag that fell through used to take the pack's build output with it
  const known = ['--sizes', '--all', '--leaked'];
  const unknown = flags.filter((flag) => !known.includes(flag));
  if (unknown.length > 0) throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy profiles --help.`);

  const dirs = cliDirs();
  switch (subcommand) {
    case undefined:
      list(dirs, { sizes: flags.includes('--sizes'), all: flags.includes('--all') });
      return;
    case 'new':
      if (rest.length > 1) throw new Error('abuddy profiles new takes one name, or none to mint one.');
      create(dirs, rest[0]);
      return;
    case 'rename': {
      if (rest.length !== 2) throw new Error('abuddy profiles rename takes the name it has and the name it should have.');
      const { dir } = renameProfile(dirs, rest[0]!, rest[1]!);
      console.log(`  renamed ${rest[0]} to ${rest[1]}\n  ${dir}`);
      return;
    }
    case 'rm': {
      const leaked = flags.includes('--leaked');
      // Neither and both are different mistakes, and one message for the two told whoever passed nothing
      // that they had passed too much
      if (!leaked && rest.length === 0) {
        throw new Error('abuddy profiles rm takes a name, or --leaked for the ones a killed run left.');
      }
      if (leaked && rest.length > 0) {
        throw new Error(`abuddy profiles rm takes names or --leaked, not both. Drop --leaked to remove ${rest.join(', ')}.`);
      }
      remove(dirs, rest, leaked);
      return;
    }
    default:
      throw new Error(`Unknown subcommand "${subcommand}". See abuddy profiles --help.`);
  }
}
