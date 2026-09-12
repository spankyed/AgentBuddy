import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');
  return {
    plugins: [
      tsconfigPaths({ projects: ['./tsconfig.test.json', '../api/tsconfig.test.json'] }),
    ],

    test: {
      globals: true,
      environment: 'node',
      include: [
        'tests/unit/**/*.spec.ts',
        'tests/integration/**/*.spec.ts',
        // Colocated tests next to the code they cover. Without this they are
        // silently never run.
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      testTimeout: 120_000,
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
