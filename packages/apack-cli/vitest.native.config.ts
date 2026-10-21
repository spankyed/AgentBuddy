import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';
import { assertCompilerTestRunner } from './tests/_support/compiler-test-runner.ts';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apackdev/source', ...defaultServerConditions.filter((c) => c !== 'module')];

// The native half: specs that execute a captured native compiler runtime or hold live filesystem watchers.
// Same settings as the integration half; its own file so the two run, and are selected, apart.
export default defineConfig({
  // The runner check runs when vitest sets this project up, before any spec loads
  plugins: [{ name: 'compiler-test-runner', configResolved: () => assertCompilerTestRunner() }],
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Large (`SIZE_MS`). Longer multi-build scenarios declare reviewed per-test budgets.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.native.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
