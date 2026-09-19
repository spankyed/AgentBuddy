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
    // 25 of these specs shell out to `tsc` and `abuddy build`. With one worker per core each of them
    // also spawns compilers, the box is oversubscribed and the main thread can miss birpc's 60s window
    // to service a worker's `onTaskUpdate` — which fails the run with an unhandled
    // "[vitest-worker]: Timeout calling" even though every test passed.
    //
    // This is a maximum, so it only binds on a machine with more than 4 cores: measured failing at the
    // 10-core default and passing at 2 and at 4, with no wall-clock cost (62.0s against a 62.0s
    // baseline). It is a developer-machine fix; a smaller runner never reaches the worker count that
    // starves the main thread.
    poolOptions: { threads: { maxThreads: 4 }, forks: { maxForks: 4 } },
  },
});
