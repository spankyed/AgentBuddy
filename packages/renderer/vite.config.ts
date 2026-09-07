import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
// import tailwindcss from 'tailwindcss'
// import autoprefixer from 'autoprefixer'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const defaultSetupDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../default-setup/src');
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
      { find: /^@default-setup\/(.+)$/, replacement: resolve(defaultSetupDir, '$1') },
      { find: /^@\/registries\/(.+)$/, replacement: resolve(defaultSetupDir, 'registries/$1') },
      { find: /^@\/plugins\/(.+)$/, replacement: resolve(defaultSetupDir, 'plugins/$1') },
      { find: /^@\/steps\/(.+)$/, replacement: resolve(defaultSetupDir, 'steps/$1') },
      { find: /^@\/blocks\/(.+)$/, replacement: resolve(defaultSetupDir, 'blocks/$1') },
      { find: /^@\/artifacts\/(.+)$/, replacement: resolve(defaultSetupDir, 'artifacts/$1') },
      // Map design system components to SDK
      { find: /^@\/core\/components\/design\/(.+)$/, replacement: resolve(sdkDir, 'src/fe/design/$1') },
      // Map shared components (tiptap, monaco, etc.) to SDK — layout/ stays in renderer
      { find: /^@\/core\/components\/(?!layout\/|ApiStatus)(.+)$/, replacement: resolve(sdkDir, 'src/fe/components/$1') },
      { find: /^@\/core\/utils\/monaco-config$/, replacement: resolve(sdkDir, 'src/fe/components/monaco-config.ts') },
      { find: /^@\/core\/composables\/(useMenuState|useContextMenu)(\.ts)?$/, replacement: resolve(sdkDir, 'src/fe/composables/$1.ts') },
      // SDK rpc module delegates to backend host modules — on the frontend, redirect to renderer's trpc
      { find: '@abuddy/sdk/rpc', replacement: fileURLToPath(new URL('./src/core/trpc.ts', import.meta.url)) },
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
