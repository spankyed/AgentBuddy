import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 2 (`TIER_TIMEOUT_MS`): each of these npm-packs three packages into a temp consumer and compiles
    // it across the TypeScript matrix, which is tens of seconds of work in a handful of tests.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**'],
    // Every spec here spawns compilers of its own, so a worker per core oversubscribes the box and the main
    // thread can miss birpc's window to answer a worker — which fails a run whose tests all passed. A
    // percentage, because vitest reads this as `maxThreads ?? maxWorkers ?? (cpus - 1)`: it replaces the
    // default rather than capping it, so a fixed number would raise the worker count on a smaller machine.
    poolOptions: { threads: { maxThreads: '50%' }, forks: { maxForks: '50%' } },
  },
});
