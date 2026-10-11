import { definePackTestConfig } from '@apack/testing/vitest';

// What every pack's suite needs is `definePackTestConfig` (@apack/testing/vitest), and this pack needs
// nothing beyond it but a data-dir prefix that names the run. `tests/e2e/` is Playwright's, run by
// `apack test`, and the helper leaves it out.
export default definePackTestConfig({ dataDirPrefix: 'e2e-fixture-tests-' });
