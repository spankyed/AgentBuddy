import { definePackTestConfig } from '@abuddy/testing/vitest';

// What every pack's suite needs is `definePackTestConfig` (@abuddy/testing/vitest), and this pack needs
// nothing beyond it but a data-dir prefix that names the run. `tests/e2e/` is Playwright's, run by
// `abuddy test`, and the helper leaves it out.
export default definePackTestConfig({ dataDirPrefix: 'e2e-fixture-tests-' });
