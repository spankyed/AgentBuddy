#!/usr/bin/env node
/**
 * Builds the publishable packages when their build output no longer matches the sources it was built
 * from, and is the repo's entry to that rule for everything that is not a package:
 *
 *   tsx scripts/ensure-packages-built.ts        (npm run packages:ensure, @abuddy/cli's pretest)
 *
 * The rule itself lives in `@abuddy/host/build/packages-built`, which everything that needs it imports
 * by that name: a relative import of this file would put the repo root into `@abuddy/testing`'s
 * declaration emit and move every declaration its bundle publishes.
 *
 * Its presence is also what marks a directory as a checkout (`CHECKOUT_MARKER`).
 */
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PackagesBuildFailed, ensurePackagesBuilt } from '@abuddy/host/build/packages-built';

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    ensurePackagesBuilt();
  } catch (err) {
    if (!(err instanceof PackagesBuildFailed)) throw err;
    // The build printed its own error; exit with its status rather than a stack trace over it
    fs.writeSync(2, 'npm run packages:build failed — the packages are not built.\n');
    process.exitCode = err.status;
  }
}
