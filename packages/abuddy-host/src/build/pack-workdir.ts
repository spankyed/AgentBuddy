/**
 * The pack's own working directory, and what a build keeps there rather than in `dist/`.
 *
 * Here because the two sides of the record cannot reach each other: `abuddy build` writes it
 * (`@abuddy/cli`'s `build/build-reads.ts`) and the repo's chain checks read it
 * (`scripts/lib/build-reads.ts`), and a package may not import the repo's `scripts/` while `scripts/`
 * cannot import the CLI, which publishes no exports map. Two literals agreeing by convention is how a
 * rename becomes a reader that finds nothing and blames the build for not having run.
 *
 * `dist/` has `PACK_LAYOUT` (`packs/layout.ts`) and this is deliberately not part of it: staging copies
 * what that names into the published pack, and nothing here is published — `abuddy clean` removes the
 * directory, and no fingerprint walks it, dot-prefixed entries being skipped by `inputFiles`.
 */

/** The pack-relative working directory: dependency cache, staging, release output, build records */
export const PACK_WORK_DIR = '.abuddy';

/** What each bundling phase of `abuddy build` read, pack-relative. Written by the build, read by the chain. */
export const PACK_READS_FILE = `${PACK_WORK_DIR}/reads.json`;
