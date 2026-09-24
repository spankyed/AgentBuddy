import { defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';

const dataDir = isolatedDataDir('e2e-fixture-tests-');

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    env: dataDir.env,
    globalSetup: dataDir.globalSetup,
    setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],
  },
});
