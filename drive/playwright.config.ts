import { defineDriveConfig } from '@apack/testing/playwright';

/**
 * Driving, not testing. Playwright is only the thing that can hold a page open and talk to Electron:
 * nothing here asserts, nothing gates on it, and `npm test` never sees this directory — it is outside
 * `tests/e2e`, which is what `testDir` there means, rather than excluded from it.
 *
 * Every setting is `defineDriveConfig`'s, so this config and the one `apack drive` scaffolds into a pack
 * cannot drift apart. It also ignores the engine's session, which a driving run must never collect.
 */
export default defineDriveConfig();
