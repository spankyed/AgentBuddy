import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports). This package writes
  // files and reads none of the built output, so it needs no `pretest`: the condition is for `population`,
  // which its own spec imports from @abuddy/sdk.
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Small (`SIZE_MS`, scripts/lib/unit-suites.ts), declared rather than left to vitest's 5s
    // default, which is tighter than the size allows (`suite-timeouts.spec.ts`).
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
