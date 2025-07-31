import { defineConfig } from 'vitest/config';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables from .env file
dotenvConfig();

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');
  return {
  /* Vite‑level plugins -------------------------------------------------- */
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.test.json'] }),
  ],

  /* Vitest‑specific options -------------------------------------------- */
  test: {
    globals: true,                   // use `describe/it/expect` without imports
    environment: 'node',             // happy in pure Node (no jsdom needed here)
    include: ['tests/unit/**/*.spec.ts'],
    // ❶  there is **no** `tsconfig` option – remove it
  },

  /* Optional manual alias fallback (not needed if plugin works) -------- */
  // resolve: {
  //   alias: {
  //     '@': '/src',
  //   },
  // },
  };
});