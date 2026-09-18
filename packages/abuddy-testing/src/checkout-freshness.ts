// A pack loads this harness from the @abuddy/testing bundle, and in a checkout that bundle is built on
// demand: `abuddy test` and `abuddy dev` refresh it first, but `npx vitest` and `npx playwright test` in
// a pack repo do not. A stale bundle is the dangerous case — it loads and silently tests the previous
// @abuddy/host, since the bundle inlines it — so the harness says so instead of passing quietly.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CHECKOUT_MARKER, REPO_ROOT, stalePackageUnits, staleMessage } from '@abuddy/host/build/packages-built';

/** Whether this copy of the harness came from an AgentBuddy checkout, where its bundle is built on demand */
function inCheckout(): boolean {
  // An installed package has no checkout above it, so there is nothing to be stale against
  return fs.existsSync(path.join(REPO_ROOT, CHECKOUT_MARKER));
}

/**
 * Throws, naming the fix, when the checkout's packages have moved since the build this bundle came from.
 * A no-op for an installed package: what npm delivered is what there is.
 */
export function assertCheckoutPackagesFresh(): void {
  if (!inCheckout()) return;
  let stale;
  try {
    stale = stalePackageUnits();
  } catch {
    return; // Not a layout this check understands: leave the run alone rather than fail it
  }
  if (stale.length === 0) return;
  throw new Error(
    `@abuddy/testing was built before the checkout's current sources, so this run would test the previous ones:\n${staleMessage(stale)}\n`
    + 'Run: npm run packages:ensure in the checkout (abuddy test and abuddy dev do it for you).',
  );
}
