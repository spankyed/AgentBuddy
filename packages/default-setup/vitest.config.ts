import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @app/default-setup.
 *
 * Scope: unit tests for pure helpers under `src/actions/**\/_helpers/` and
 * similar. No subprocesses, no real services — everything here should be
 * fast and deterministic.
 *
 * Why it's separate from `@app/api`'s config: the helpers tested here are
 * auto-inlined into compiled actions at runtime (esbuild, see CLAUDE.md in
 * this package), so they live in this workspace and their tests should
 * too. Previously the tests lived in `packages/api/tests/unit/` and
 * reached across the workspace boundary via `../../../default-setup/src/...`
 * relative imports, which worked by esbuild accident but was an ownership
 * smell. Colocating them fixes that.
 *
 * No `vite-tsconfig-paths` plugin: this package has no `@/*` aliases —
 * imports in tests use simple relative paths like `../../src/...`.
 */
export default defineConfig({
  test: {
    globals: true,        // describe/it/expect without imports
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
});
