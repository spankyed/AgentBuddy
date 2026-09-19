// Checker 5 of the package-freshness doors (the doors are listed in packages/abuddy-testing/CLAUDE.md):
// A pack loads this harness from the @abuddy/testing bundle, and in a checkout that bundle is built on
// demand: `abuddy test` and `abuddy dev` refresh it first, but `npx vitest` and `npx playwright test` in
// a pack repo do not. A stale bundle is the dangerous case — it loads and silently tests the previous
// @abuddy/host, since the bundle inlines it — so the harness says so instead of passing quietly.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CHECKOUT_MARKER, REPO_ROOT, runningPackageBuild, stalePackageUnits, staleMessage, type StaleUnit } from '@abuddy/host/build/packages-built';

/** What the check reads. The defaults are this checkout's; a test passes its own. */
export interface CheckoutFreshnessOptions {
  /** The directory the marker is looked for in: a checkout, or wherever an installed package sits */
  root?: string;
  /** The packages that need building, in that checkout */
  stalePackages?: () => StaleUnit[];
  /** The package build running right now, if one is */
  runningBuild?: () => { pid: number; label: string } | undefined;
}

/**
 * Throws, naming the fix, when the checkout's packages have moved since the build this bundle came from.
 * A no-op for an installed package: there is no checkout above it, and what npm delivered is what there is.
 *
 * It does not catch: `stalePackageUnits` reports an unreadable input as a reason rather than throwing, so
 * anything that does throw here is a bug in the check and should be seen, not swallowed into a pass.
 */
export function assertCheckoutPackagesFresh(
  { root = REPO_ROOT, stalePackages = stalePackageUnits, runningBuild = runningPackageBuild }: CheckoutFreshnessOptions = {},
): void {
  if (!fs.existsSync(path.join(root, CHECKOUT_MARKER))) return;
  const stale = stalePackages();
  if (stale.length === 0) return;
  // A build removes each stamp before rewriting it, so one running beside this run makes its packages
  // read as unbuilt. Still a failure — what is on disk right now is half of two builds — but the fix is
  // to wait for it, not to start another.
  const building = runningBuild();
  if (building) {
    throw new Error(
      `A package build is running in this checkout (pid ${building.pid}, ${building.label}), so its packages are `
      + 'part-written and this run would test a mixture of two builds. Wait for that build to finish, then run this again.',
    );
  }
  throw new Error(
    `@abuddy/testing was built before the checkout's current sources, so this run would test the previous ones:\n${staleMessage(stale)}\n`
    + 'Run: npm run packages:ensure in the checkout (abuddy test and abuddy dev do it for you).',
  );
}
