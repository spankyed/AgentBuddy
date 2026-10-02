import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';
import { cliDirs, type CliDirs } from '../app/app-target';
import { listInstances, removeInstance, dirBytes } from '../app/instances';
import { betaDownloadLeftovers, cachedBetaBuilds } from '../app/beta-app';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const CLEAN_DIRS = ['dist', '.abuddy', 'src/__generated__'];

const HELP = `
Usage: abuddy clean [--instances [--all] | --apps [--all]]

Remove this pack's build output: ${CLEAN_DIRS.join(', ')}.

Options:
  --instances   List the instances \`abuddy run\` created, and remove the ones left by a run
                that is no longer going. Works outside a pack.
  --apps        List the AgentBuddy Beta builds \`--app beta\` downloaded, and remove all but
                the newest. Works outside a pack.
  --all         With --instances, remove every instance, including named ones you may want;
                with --apps, remove every build, so the next run downloads one
  --help, -h    Show this help
`.trim();

const size = (bytes: number): string =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)}GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)}MB` : `${Math.round(bytes / 1e3)}kB`;

/**
 * Instances are the CLI's own state, not a pack's, so this runs before `findPackRoot` — which throws
 * outside a pack, and there is no reason to stand in one to tidy up disk this command created.
 *
 * Only leaked instances go by default. A named one is something someone asked to keep, and an ephemeral
 * one whose `abuddy run` is still going is a live app's data dir; `listInstances` decides that with
 * `lockIsHeld`, whose contract is never to miss a live holder.
 */
function cleanInstances(all: boolean): void {
  const dirs = cliDirs();
  const instances = listInstances(dirs);
  if (instances.length === 0) {
    console.log('  no instances');
    return;
  }

  let removed = 0;
  for (const instance of instances) {
    // An app still has this one open, and `--all` does not override that: removing a data dir underneath
    // a running app does not stop it, it makes it write the directory back with whatever it had in memory
    const go = !instance.inUse && (all || instance.leaked);
    const note = instance.inUse
      ? 'an app is running on it'
      : instance.ephemeral
        ? (instance.leaked ? 'ephemeral, left by a run that has gone' : 'ephemeral')
        : 'named';
    console.log(`  ${go ? 'removing' : '  keeping'}  ${instance.name.padEnd(24)} ${size(instance.bytes).padStart(6)}  ${note}`);
    if (!go) continue;
    // Per instance, because `listInstances` read the state a moment ago: an app started since makes
    // `removeInstance` refuse, and one refusal should not stop the rest from being considered
    try {
      removeInstance(dirs, instance.dir);
      removed++;
    } catch (error) {
      console.log(`            ${instance.name.padEnd(24)}         ${errorMessage(error)}`);
    }
  }

  console.log(removed === 0
    ? '\n  nothing to remove'
    : `\n  removed ${removed} instance${removed === 1 ? '' : 's'}`);
  const kept = instances.filter(i => !i.inUse).length - removed;
  if (!all && kept > 0) console.log('  --all removes the rest');
}

/**
 * The downloaded Beta builds, which nothing has ever reclaimed — each one an unpacked app of a few hundred
 * megabytes, and they accumulate one per release tested against.
 *
 * **The newest is kept by default, because resolution prefers a cached build.** `cachedBetaApp`
 * (`app-target.ts`) answers from the cache whenever a downloaded build satisfies the pack's range, so
 * emptying it on a plain `clean` would turn every later run into a download. `--all` is for when that is
 * what you want — moving to a newer Beta is deleting the one you have.
 *
 * Staging directories go whatever the flag says: a download that was killed leaves one, nothing reads it
 * again, and `cachedBetaBuilds` already refuses to see it.
 *
 * `dirs` is a parameter where `cleanInstances` reads `cliDirs()` for itself, and the difference is the test:
 * this deletes from a cache a person owns, so the policy — which build survives — is checked against a
 * temporary one rather than trusted. `clean` passes nothing.
 */
export function cleanApps(all: boolean, dirs: CliDirs = cliDirs()): void {
  const builds = cachedBetaBuilds(dirs.cache);
  const leftovers = betaDownloadLeftovers(dirs.cache);
  if (builds.length === 0 && leftovers.length === 0) {
    console.log('  no downloaded app builds');
    return;
  }

  let removed = 0;
  let reclaimed = 0;
  // `cachedBetaBuilds` is newest first, which is the one this keeps — the same build resolution would pick
  builds.forEach(({ tag, dir }, index) => {
    const go = all || index > 0;
    const bytes = dirBytes(dir);
    console.log(`  ${go ? 'removing' : '  keeping'}  ${tag.padEnd(24)} ${size(bytes).padStart(6)}${go ? '' : '  newest'}`);
    if (!go) return;
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
    reclaimed += bytes;
  });
  for (const dir of leftovers) {
    reclaimed += dirBytes(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
    console.log(`  removing  ${path.basename(dir).padEnd(24)}         an interrupted download`);
  }

  console.log(removed === 0
    ? '\n  nothing to remove'
    : `\n  removed ${removed} build${removed === 1 ? '' : 's'}, reclaiming ${size(reclaimed)}`);
  if (!all && builds.length > 0 && removed < builds.length) console.log('  --all removes the newest too');
}

export async function clean(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  // Rejected rather than ignored: this command deletes directories, and a mistyped flag used to be
  // dropped silently and take the pack's build output with it
  const unknown = args.filter(arg => !['--instances', '--apps', '--all'].includes(arg));
  if (unknown.length > 0) throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy clean --help.`);
  if (args.includes('--instances') && args.includes('--apps')) throw new Error('--instances and --apps clean different things; run one at a time.');
  if (args.includes('--all') && !args.includes('--instances') && !args.includes('--apps')) {
    throw new Error('--all only means something with --instances or --apps.');
  }

  if (args.includes('--instances')) {
    cleanInstances(args.includes('--all'));
    return;
  }
  if (args.includes('--apps')) {
    cleanApps(args.includes('--all'));
    return;
  }

  const root = findPackRoot(process.cwd());

  let removed = 0;
  for (const dir of CLEAN_DIRS) {
    const fullPath = path.join(root, dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  removed ${dir}/`);
      removed++;
    }
  }

  if (removed === 0) {
    console.log('  nothing to clean');
  } else {
    console.log(`\n  cleaned ${removed} director${removed === 1 ? 'y' : 'ies'}`);
  }
}
