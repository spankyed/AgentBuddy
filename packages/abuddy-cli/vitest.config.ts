import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['tests/**/*.spec.ts'],
    // These specs shell out to `tsc` and `abuddy build`, so every worker spawns compilers of its own. With
    // a worker per core the box is oversubscribed and the main thread can miss birpc's 60s window to answer
    // a worker's `onTaskUpdate`, which fails the run with "[vitest-worker]: Timeout calling" though every
    // test passed.
    //
    // A percentage, because vitest reads this as `poolOptions.maxThreads ?? maxWorkers ?? (cpus - 1)`: it
    // replaces the default rather than capping it, so a fixed number raises the worker count on any machine
    // smaller than that number. `50%` is at most `cpus - 1` for cpus >= 2, so it can only lower.
    poolOptions: { threads: { maxThreads: '50%' }, forks: { maxForks: '50%' } },
  },
});
