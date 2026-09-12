import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// Test imports open LMDB via @abuddy/sdk/env, which requires an explicit environment.
// Each run gets its own throwaway data dir (removed in tests/global-teardown.ts).
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-setup-tests-'));

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');
  return {
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
      env: { ABUDDY_ENV: 'test', ABUDDY_USER_DATA_DIR: userDataDir },
      globalSetup: ['./tests/global-teardown.ts'],
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
