import { configDefaults, defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';

const dataDir = isolatedDataDir('e2e-fixture-tests-');

export default defineConfig({
  test: {
    // A spec's path mirrors the source it covers, so one pattern covers every one of them. `tests/e2e/` is
    // excluded because it is Playwright's, run by `abuddy test` — a different runner, not a level.
    include: ['tests/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    env: dataDir.env,
    globalSetup: dataDir.globalSetup,
    setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],
  },
});
