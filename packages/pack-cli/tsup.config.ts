import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  target: 'node22',
  clean: true,
  noExternal: ['@abuddy/sdk', '@app/default-setup'],
  external: ['esbuild', 'typescript'],
});
