import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apack/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @apack/* packages resolve to source (see their package.json exports)
  resolve: {
    conditions,
    // The main process's modules import Electron; a test runs them on Node, so `app` is a stub that
    // records what they asked Electron to do
    alias: { electron: path.resolve(__dirname, 'tests/electron-stub.ts') },
  },
  ssr: { resolve: { conditions } },
  define: {
    // The release channel the build stamps in (build/build.sh); a test is neither channel
    __APACK_CHANNEL__: '"unstamped"',
  },
  test: {
    // Small (`SIZE_MS`, scripts/lib/unit-suites.ts). Declared rather than left to vitest's 5s
    // default, which is *tighter* than the size allows: under the chain's three lanes a 5.8s typecheck in
    // @apack/sdk crossed it and reported a hang where the size had headroom to spare.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.spec.ts'],
  },
});
