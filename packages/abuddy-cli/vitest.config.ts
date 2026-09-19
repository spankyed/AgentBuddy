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
    // also spawns compilers, the box is oversubscribed and the main thread can miss birpc's 60s
    // window to service a worker's `onTaskUpdate` — which fails the run with an unhandled
    // "[vitest-worker]: Timeout calling" even though every test passed. Capping the pool keeps
    // enough cores free to answer.
    poolOptions: { threads: { maxThreads: 4 }, forks: { maxForks: 4 } },
  },
});
