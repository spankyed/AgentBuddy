import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apack/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @apack/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Small (`SIZE_MS`, scripts/lib/unit-suites.ts). Declared rather than left to vitest's 5s
    // default, which is *tighter* than the size allows: under the chain's three lanes a 5.8s typecheck in
    // @apack/sdk crossed it and reported a hang where the size had headroom to spare.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.spec.ts'],
  },
});
