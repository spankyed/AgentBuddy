import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';
import { assertCompilerTestRunner } from './tests/_support/compiler-test-runner.ts';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apackdev/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // The runner check runs when vitest sets this project up, before any spec loads, and not when the module
  // is imported: repo-checks' chain-table spec imports every integration config to read its settings.
  plugins: [{ name: 'compiler-test-runner', configResolved: () => assertCompilerTestRunner() }],
  // Workspace @apackdev/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Large (`SIZE_MS`). Longer multi-build scenarios declare reviewed per-test budgets.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ['./tests/_support/turn-event-loop.ts'],
    include: ['tests/**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
