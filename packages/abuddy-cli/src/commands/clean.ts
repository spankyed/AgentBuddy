import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';
import { cliDirs, type CliDirs } from '../app/app-target';
import { dirBytes, size } from '../app/instances';
import { betaDownloadLeftovers, cachedBetaBuilds } from '../app/beta-app';

const CLEAN_DIRS = ['dist', '.abuddy', 'src/__generated__'];

const HELP = `
Usage: abuddy clean [--apps [--all]]

Remove this pack's build output: ${CLEAN_DIRS.join(', ')}.

Options:
  --apps        List the AgentBuddy Beta builds \`--app beta\` downloaded, and remove all but
                the newest. Works outside a pack.
  --all         With --apps, remove every build, so the next run downloads one
  --help, -h    Show this help

Data dirs are \`abuddy instances\`: what exists, and removing the ones you own.
`.trim();

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
  const unknown = args.filter(arg => !['--apps', '--all'].includes(arg));
  if (unknown.length > 0) {
    const instances = unknown.includes('--instances') ? ' Data dirs are `abuddy instances` now.' : '';
    throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy clean --help.${instances}`);
  }
  if (args.includes('--all') && !args.includes('--apps')) throw new Error('--all only means something with --apps.');

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
