import { defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

// Test imports open LMDB via @abuddy/sdk/env, which requires an explicit environment. Each run
// gets a throwaway data dir, split per worker and removed when the run ends.
const dataDir = isolatedDataDir('default-setup-tests-');

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');
  return {
    // Workspace @abuddy/* packages resolve to source (see their package.json exports)
    resolve: { conditions },
    ssr: { resolve: { conditions } },
    plugins: [
      tsconfigPaths({ projects: ['./tsconfig.test.json', '../api/tsconfig.test.json'] }),
    ],

    test: {
      globals: true,
      environment: 'node',
      include: [
        'tests/unit/**/*.spec.ts',
        'tests/integration/**/*.spec.ts',
        // Colocated tests next to the code they cover. Without this they are
        // silently never run.
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      testTimeout: 120_000,
      env: dataDir.env,
      globalSetup: dataDir.globalSetup,
      setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],
    },
  };
});
