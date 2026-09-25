import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // The fast suite: every spec here runs in-process. The specs that run a real build, an install or
    // another process are `*.integration.spec.ts` and run from `vitest.integration.config.ts`.
    // `CLAUDE.md` has the rule for choosing; `suite-split.spec.ts` fails a spec in the wrong half.
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**'],
  },
});
