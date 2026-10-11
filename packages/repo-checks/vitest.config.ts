import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apack/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @apack/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Small (`SIZE_MS`, scripts/lib/unit-suites.ts). A budget belongs to the size, not to each
    // test that trips over vitest's 5s default.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // The fast half. The specs that spawn a compiler are `*.integration.spec.ts` and run from
    // `vitest.integration.config.ts`, which gives them 60s and half the cores.
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**'],
  },
});
