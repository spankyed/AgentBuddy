import { definePackTestConfig } from '@abuddy/testing/vitest';

// Everything a pack's suite needs: a throwaway data dir per run (the harness requires one), the tier's
// timeouts, `tests/**/*.spec.ts`, and a stub for this pack's .vue files so `vitest related` can walk its
// module graph. Pass { vue: true } — with @vitejs/plugin-vue installed — to compile and render them instead.
export default definePackTestConfig();
