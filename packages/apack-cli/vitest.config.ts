import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apack/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @apack/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Small (`SIZE_MS`, scripts/lib/unit-suites.ts). Both are here because the alternative is what
    // was here before: vitest's 5s default, and 27 per-test timeouts of 30s to 120s written to escape it —
    // in files that run in about a second. A budget belongs to the size, not to each test that trips over
    // the default.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // The fast suite: every spec here runs in-process. The specs that run a real build, an install or
    // another process are `*.integration.spec.ts` and run from `vitest.integration.config.ts`.
    // `CLAUDE.md` has the rule for choosing, which is a judgement rather than a measured threshold.
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**'],
  },
});
