#!/usr/bin/env node
/**
 * Builds the publishable packages when their build output no longer matches the sources it was built
 * from, and is the repo's entry to that rule for everything that is not a package:
 *
 *   tsx scripts/ensure-packages-built.ts        (npm run packages:ensure, @abuddy/cli's pretest)
 *
 * The rule itself lives in `@abuddy/host/build/packages-built`, so `@abuddy/testing` can reach it
 * through a package specifier: a relative import of this file would put the repo root into the
 * declaration emit's common source directory and move every declaration the bundle publishes. This
 * file re-exports it for the build scripts inside `@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui`,
 * which import no package above their own layer.
 *
 * Its presence is also what marks a directory as a checkout (`CHECKOUT_MARKER`).
 */
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PackagesBuildFailed, ensurePackagesBuilt } from '@abuddy/host/build/packages-built';

export * from '@abuddy/host/build/packages-built';

// Run as a script; imported (by the build scripts and the test helper) it only re-exports
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
