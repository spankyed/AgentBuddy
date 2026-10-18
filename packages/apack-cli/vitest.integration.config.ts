import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';
import { assertCompilerTestRunner } from './tests/_support/compiler-test-runner.ts';

assertCompilerTestRunner();

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apackdev/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @apackdev/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Large (`SIZE_MS`). Longer multi-build scenarios declare reviewed per-test budgets.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
