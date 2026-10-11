import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@apack/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @apack/* packages resolve to source (see their package.json exports)
  resolve: {
    conditions,
    // The bridge imports Electron; a test runs it on Node, so `contextBridge` and `ipcRenderer` are stubs
    // that record what it asked Electron to do — `@app/main`'s suite is the same arrangement
    alias: { electron: path.resolve(import.meta.dirname, 'tests/electron-stub.ts') },
  },
  ssr: { resolve: { conditions } },
  test: {
    // Small (`SIZE_MS`, scripts/lib/unit-suites.ts). Declared rather than left to vitest's 5s default,
    // which is *tighter* than the size allows and reports a hang where the size has headroom
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.spec.ts'],
  },
});
