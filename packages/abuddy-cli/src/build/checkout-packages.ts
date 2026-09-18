// A pack compiles and runs against the @abuddy packages' published dist. When those packages come from
// an AgentBuddy checkout (a linked pack, the in-repo fixtures), that dist is built on demand and can be
// behind the checkout's source — so a command that loads it asks the checkout to bring it up to date.
// Installed packages have nothing to build: their dist is what npm delivered.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CHECKOUT_MARKER } from '@abuddy/host/build/packages-built';

/**
 * The packages a pack can resolve whose dist a checkout builds on demand. Every one is asked, because a
 * pack need not link them all: with @abuddy/sdk installed from the registry and @abuddy/ui linked to a
 * checkout, asking only the SDK would find no checkout and leave that linked dist stale and silent.
 */
const CHECKOUT_PACKAGES = ['@abuddy/sdk', '@abuddy/ears', '@abuddy/ui', '@abuddy/testing', '@abuddy/cli'];

/** The checkout a package resolves into from `packDir`, or undefined for an installed copy */
function checkoutOf(packDir: string, pkg: string): string | undefined {
  let dir: string;
  try {
    dir = path.dirname(fs.realpathSync(createRequire(path.join(packDir, 'package.json')).resolve(`${pkg}/package.json`)));
  } catch {
    return undefined; // Not installed here, or it exports no package.json: nothing to build either way
  }
  for (let root = path.dirname(path.dirname(dir)); root !== path.dirname(root); root = path.dirname(root)) {
    if (fs.existsSync(path.join(root, CHECKOUT_MARKER))) return root;
  }
  return undefined;
}

/** The AgentBuddy checkout a pack's @abuddy packages come from, or undefined when they are all installed */
export function checkoutFor(packDir: string): string | undefined {
  for (const pkg of CHECKOUT_PACKAGES) {
    const checkout = checkoutOf(packDir, pkg);
    if (checkout) return checkout;
  }
  return undefined;
}

/**
 * Builds the checkout's packages when its sources moved since the last build, so what this command
 * loads is what the checkout says. A no-op for a pack whose packages are installed, and a directory
 * walk (under a second) when nothing is stale.
 */
export function ensureCheckoutPackages(packDir: string): void {
  const checkout = checkoutFor(packDir);
  if (!checkout) return;
  // npm is a shell script on Windows, which spawn cannot launch without one
  const windows = process.platform === 'win32';
  const result = spawnSync(windows ? 'npm.cmd' : 'npm', ['run', 'packages:ensure'], { cwd: checkout, stdio: 'inherit', shell: windows });
  if (result.status === 0) return;
  // A spawn that never ran has no status and a reason of its own; a build that failed printed its own
  const why = result.error ? `: ${result.error.message}` : '';
  throw new Error(`The AgentBuddy checkout at ${checkout} could not build its packages, so this pack would load a stale copy of them${why}`);
}
