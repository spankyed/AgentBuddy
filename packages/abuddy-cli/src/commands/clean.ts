import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';
import { cliDirs } from '../app/app-target';
import { listInstances, removeInstance } from '../app/instances';

const CLEAN_DIRS = ['dist', '.abuddy', 'src/__generated__'];

const HELP = `
Usage: abuddy clean [--instances [--all]]

Remove this pack's build output: ${CLEAN_DIRS.join(', ')}.

Options:
  --instances   List the instances \`abuddy run\` created, and remove the ones left by a run
                that is no longer going. Works outside a pack.
  --all         With --instances, remove every instance, including named ones you may want
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
    removeInstance(dirs, instance.dir);
    removed++;
  }

  console.log(removed === 0
    ? '\n  nothing to remove'
    : `\n  removed ${removed} instance${removed === 1 ? '' : 's'}`);
  const kept = instances.filter(i => !i.inUse).length - removed;
  if (!all && kept > 0) console.log('  --all removes the rest');
}

export async function clean(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  // Rejected rather than ignored: this command deletes directories, and a mistyped flag used to be
  // dropped silently and take the pack's build output with it
  const unknown = args.filter(arg => arg !== '--instances' && arg !== '--all');
  if (unknown.length > 0) throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy clean --help.`);
  if (args.includes('--all') && !args.includes('--instances')) throw new Error('--all only means something with --instances.');

  if (args.includes('--instances')) {
    cleanInstances(args.includes('--all'));
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
