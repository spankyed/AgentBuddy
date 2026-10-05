// A pack's Playwright configs: its E2E suite, its driving scripts, and the engine serving one of them.
//
//   import { definePackE2EConfig } from '@abuddy/testing/playwright';
//   export default definePackE2EConfig();
//
// The counterpart to `@abuddy/testing/vitest` for the other runner, and it exists for the same reason: six
// configs restated these settings, and the repo's own had already drifted to a `use` block the three packs'
// lacked. A setting held here reaches a pack on its next update; one copied into a pack's own config does
// not — which is how a `testIgnore` became unaddable and the engine's session got an extension instead.
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

/**
 * The engine's session: the file `abuddy drive --serve` scaffolds, and the only file a serving run collects.
 *
 * `@abuddy/cli`'s `drive.ts` names it too, because it is the file that command writes. The two are not one
 * declaration on purpose — importing this module there would make `@abuddy/testing` a runtime dependency of
 * the published CLI for the sake of one string — so `@app/repo-checks`' `playwright-config.spec.ts` holds
 * them to each other instead.
 */
const ENGINE_SESSION_FILE = 'engine-session.mts';

/** A pack's driving config, which collects the scripts beside it */
const DRIVE_CONFIG_FILE = 'playwright.config.ts';

/**
 * A pack's E2E suite, run by `abuddy test`.
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
 * A pack's driving scripts, run by `abuddy drive`. Driving is not testing: nothing asserts and nothing
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
    testIgnore: [ENGINE_SESSION_FILE, DRIVE_CONFIG_FILE, ...ignored(options.testIgnore)],
  });
}

/**
 * What a serving config may set — everything the engine's HTTP handshake does not depend on.
 *
 * The four it omits are not preferences, and the rule is that they are what the tool or its own docs read
 * back. Setting one is a compile error here rather than a value quietly discarded at the call site:
 *
 * - `testMatch` selects the session, and nothing else does. A glob instead would drag a pack's own `.mts`
 *   driving scripts into a serving run.
 * - `workers` must be 1. Four things a session owns have no worker key: the app's data dir (Electron locks
 *   one per directory, so a second worker dies waiting for a window), the marker file (the later write wins
 *   and the earlier session's exit deletes the survivor's), the `host/drive` bus claim (the API refuses a
 *   second), and the screenshot directory.
 * - `timeout` must be 0. A session ends when `/close` is answered or a signal arrives, and nothing else
 *   resolves it; a deadline kills a live one mid-request with its teardown never reached, leaving the
 *   marker advertising a dead address and the bus claim held.
 * - `outputDir` must stay the one Playwright wipes at the start of a run, because that is the whole of the
 *   marker's staleness story — it carries no pid check. Its value is also written into the CLI's usage, two
 *   documents and a spec.
 */
export type EngineConfigOptions = Omit<PlaywrightTestConfig, 'testDir' | 'testMatch' | 'workers' | 'timeout' | 'outputDir'>;

/**
 * The engine's serving session, run by `abuddy drive --serve`: one app held open, answering HTTP.
 *
 * The handshake is spread after the caller's options, so a cast that reached past the type above still
 * cannot break a session.
 */
export function defineEngineConfig(options: EngineConfigOptions = {}): PlaywrightTestConfig {
  return defineConfig({
    reporter: 'list',
    ...options,
    testDir: '.',
    // Named exactly rather than by a glob, so no driving script joins a serving run
    testMatch: ENGINE_SESSION_FILE,
    workers: 1,
    timeout: 0,
    outputDir: 'results',
  });
}

/** A `testIgnore` as a list, whatever shape it was given: Playwright takes one or many, and a RegExp too */
function ignored(testIgnore: PlaywrightTestConfig['testIgnore']): (string | RegExp)[] {
  if (testIgnore === undefined) return [];
  return Array.isArray(testIgnore) ? [...testIgnore] : [testIgnore];
}
