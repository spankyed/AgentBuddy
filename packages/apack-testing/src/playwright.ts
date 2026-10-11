// A pack's Playwright configs: its E2E suite, its driving scripts, and the engine serving one of them.
//
//   import { definePackE2EConfig } from '@apack/testing/playwright';
//   export default definePackE2EConfig();
//
// The counterpart to `@apack/testing/vitest` for the other runner, and it exists for the same reason: six
// configs restated these settings, and the repo's own had already drifted to a `use` block the three packs'
// lacked. A setting held here reaches a pack on its next update; one copied into a pack's own config does
// not — which is how a `testIgnore` became unaddable and the engine's session got an extension instead.
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

/** A pack's driving config, which collects the scripts beside it */
const DRIVE_CONFIG_FILE = 'playwright.config.ts';

/**
 * A pack's E2E suite, run by `apack test`.
 *
 * Nothing in the tooling reads these back, so a pack's own word is last — pass anything Playwright takes.
 *
 * **`timeout` has to stay a literal here.** `suite-timeouts.spec.ts` (`@app/repo-checks`) reads a config's
 * timeouts as *text* rather than importing one, following the delegation to this file, and holds the value
 * to the large size budget (`SIZE_MS`, `scripts/lib/unit-suites.ts`). Computing it would read as absent.
 */
export function definePackE2EConfig(options: PlaywrightTestConfig = {}): PlaywrightTestConfig {
  return defineConfig({
    testDir: 'tests/e2e',
    // The large budget: an E2E test that takes longer is hung, not slow
    timeout: 60_000,
    // One app at a time — two workers would fight over one data dir, which Electron locks per dir
    workers: 1,
    // Beside the suite rather than Playwright's default `test-results/` at the pack root
    outputDir: 'tests/results',
    ...options,
  });
}

/** What a driving config may set: everything but where it looks, which the `drive/` layout decides */
export type DriveConfigOptions = Omit<PlaywrightTestConfig, 'testDir'>;

/**
 * A pack's driving scripts, run by `apack drive`. Driving is not testing: nothing asserts and nothing
 * gates on it, so there is no budget to hold and no timeout at all — you are looking at the app.
 *
 * **The session is ignored whatever `testMatch` says**, which is the one thing a pack cannot override. A
 * driving run that collected the engine would start it and hang, waiting for an HTTP request that the
 * person watching has no reason to send. Until this helper existed that was prevented by the session's
 * `.mts` extension falling outside this config's `**\/*.ts` glob — a true accident of two defaults, and one
 * that a pack widening its own `testMatch` to `.mts` would have undone with no warning.
 */
export function defineDriveConfig(options: DriveConfigOptions = {}): PlaywrightTestConfig {
  return defineConfig({
    // Any .ts file: a driving script should not have to be named like a spec
    testMatch: '**/*.ts',
    // One app at a time; two scripts would fight over the same data dir
    workers: 1,
    // No timeout: you are looking at it
    timeout: 0,
    reporter: 'list',
    // Beside the scripts rather than `test-results/` at the pack root, which `drive/.gitignore` cannot
    // reach: driving output is not test output, which is why the screenshots are here too
    outputDir: 'results',
    ...options,
    testDir: '.',
    testIgnore: [DRIVE_CONFIG_FILE, ...ignored(options.testIgnore)],
  });
}

/** A `testIgnore` as a list, whatever shape it was given: Playwright takes one or many, and a RegExp too */
function ignored(testIgnore: PlaywrightTestConfig['testIgnore']): (string | RegExp)[] {
  if (testIgnore === undefined) return [];
  return Array.isArray(testIgnore) ? [...testIgnore] : [testIgnore];
}
