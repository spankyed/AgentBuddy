// Compiles @abuddy/ui's components and modules to ESM in dist/. Each export is an entry, and
// modules several entries use are emitted once as shared chunks. Dependencies and peers stay
// external: packs get vue, @abuddy/sdk and the host-shared libraries from the host.
import { defineConfig } from 'tsdown';
import Vue from 'unplugin-vue/rolldown';
import { readFileSync } from 'node:fs';
import { computeEntries } from './scripts/exports.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const external = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)]
  .map((name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(/|$)`));

export default defineConfig({
  entry: computeEntries(),
  outDir: 'dist',
  format: 'esm',
  platform: 'neutral',
  // vue-tsc emits the declarations
  dts: false,
  deps: { neverBundle: external },
  // Compiled components import their own CSS, so a consumer's bundler collects it
  // The postcss transformer inlines relative @imports (the tiptap theme) with postcss-import, a
  // dev dependency; only emitted CSS ships
  css: { inject: true, splitting: true, transformer: 'postcss' },
  plugins: [Vue({ isProduction: true })],
});
