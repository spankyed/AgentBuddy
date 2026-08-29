import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
// import tailwindcss from 'tailwindcss'
// import autoprefixer from 'autoprefixer'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const featuresDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../default-setup/src/features');
const sdkDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../abuddy-sdk');

// https://vite.dev/config/
export default defineConfig({
  base: './', // Use relative paths for Electron compatibility
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Vidstack player web components
          isCustomElement: (tag) => tag.startsWith('media-'),
        },
      },
    }),
    vueDevTools(),
  ],
  resolve: {
    alias: [
      // Map @/registries/... to default-setup registries
      { find: /^@\/registries\/(.+)$/, replacement: resolve(featuresDir, '../registries/$1') },
      // Map @/features/... to default-setup features
      { find: /^@\/features\/(.+)$/, replacement: `${featuresDir}/$1` },
      // Map design system components to SDK
      { find: /^@\/core\/components\/design\/(.+)$/, replacement: resolve(sdkDir, 'src/fe/design/$1') },
      { find: /^@\/core\/composables\/(useMenuState|useContextMenu)(\.ts)?$/, replacement: resolve(sdkDir, 'src/fe/composables/$1.ts') },
      // Catch-all @/ alias for renderer internals
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      { find: '@abuddy/api', replacement: fileURLToPath(new URL('../api/src', import.meta.url)) },
    ],
  },
  optimizeDeps: {
    include: [
      'monaco-editor',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-web-links',
      'xstate',
      '@xstate/vue',
      'lucide-vue-next'
    ]
  },
  // Removed hardcoded VITE_API_WS - port is now injected dynamically at runtime
})
