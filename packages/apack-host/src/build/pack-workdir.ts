/**
 * The pack's own working directory, and what a build keeps there rather than in `dist/`.
 *
 * In host because the two sides cannot reach each other: `apack build` writes the record
 * (`@apack/cli`) and the repo's chain checks read it (`scripts/lib/build-reads.ts`), while a package may
 * not import the repo's `scripts/` and `scripts/` cannot import the CLI, which publishes no exports map.
 * Two literals agreeing by convention is a rename away from a reader that finds nothing and blames the
 * build for not having run.
 *
 * Deliberately not part of `PACK_LAYOUT` (`packs/layout.ts`): staging copies what that names into the
 * published pack, and nothing here is published — `apack clean` removes it, no fingerprint walks it
 * (dot-prefixed entries being skipped), and `electron-builder.mjs` excludes it from the installed app.
 */

/** The pack-relative working directory: dependency cache, staging, release output, build records */
export const PACK_WORK_DIR = '.apack';

/** What each bundling phase of `apack build` read, pack-relative. Written by the build, read by the chain. */
export const PACK_READS_FILE = `${PACK_WORK_DIR}/reads.json`;
