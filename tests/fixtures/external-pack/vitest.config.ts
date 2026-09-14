import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';
import { isolatedDataDir, sourceConditions } from '@abuddy/testing/vitest';

// This fixture links the checkout's @abuddy/* packages, which resolve to source
const conditions = [...sourceConditions(), ...defaultServerConditions.filter((c) => c !== 'module')];
const dataDir = isolatedDataDir('e2e-fixture-tests-');

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    env: dataDir.env,
    globalSetup: dataDir.globalSetup,
    setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],
  },
});
