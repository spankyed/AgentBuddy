import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: {
    conditions,
    // The main process's modules import Electron; a test runs them on Node, so `app` is a stub that
    // records what they asked Electron to do
    alias: { electron: path.resolve(__dirname, 'tests/electron-stub.ts') },
  },
  ssr: { resolve: { conditions } },
  define: {
    // The release channel the build stamps in (build/build.sh); a test is neither channel
    __ABUDDY_CHANNEL__: '"unstamped"',
  },
  test: {
    include: ['tests/**/*.spec.ts'],
  },
});
