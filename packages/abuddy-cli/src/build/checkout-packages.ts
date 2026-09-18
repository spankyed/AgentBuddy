// A pack compiles and runs against the @abuddy packages' published dist. When those packages come from
// an AgentBuddy checkout (a linked pack, the in-repo fixtures), that dist is built on demand and can be
// behind the checkout's source — so a command that loads it asks the checkout to bring it up to date.
// Installed packages have nothing to build: their dist is what npm delivered.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CHECKOUT_MARKER } from '@abuddy/host/build/packages-built';

/** The AgentBuddy checkout a pack's @abuddy packages come from, or undefined when they are installed */
export function checkoutFor(packDir: string): string | undefined {
  let dir: string;
  try {
    dir = path.dirname(fs.realpathSync(createRequire(path.join(packDir, 'package.json')).resolve('@abuddy/sdk/package.json')));
  } catch {
    return undefined;
  }
  for (let root = path.dirname(path.dirname(dir)); root !== path.dirname(root); root = path.dirname(root)) {
    if (fs.existsSync(path.join(root, CHECKOUT_MARKER))) return root;
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
  const result = spawnSync('npm', ['run', 'packages:ensure'], { cwd: checkout, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`The AgentBuddy checkout at ${checkout} could not build its packages, so this pack would load a stale copy of them.`);
  }
}
