import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts). A budget belongs to the tier, not to each
    // test that trips over vitest's 5s default.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // The fast half. The specs that spawn a compiler are `*.integration.spec.ts` and run from
    // `vitest.integration.config.ts`; `suite-split.spec.ts` fails a spec in the wrong half.
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**'],
  },
});
