import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
// import tailwindcss from 'tailwindcss'
// import autoprefixer from 'autoprefixer'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

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
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Add alias for API imports that might still reference the old path
      '@abuddy/api': fileURLToPath(new URL('../api/src', import.meta.url))
    },
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
  // build: {
  //   // Ensure CSS is properly handled in production builds
  //   cssCodeSplit: false,
  //   rollupOptions: {
  //     output: {
  //       // Ensure consistent file naming
  //       assetFileNames: 'assets/[name]-[hash][extname]',
  //       chunkFileNames: 'assets/[name]-[hash].js',
  //       entryFileNames: 'assets/[name]-[hash].js',
  //     }
  //   }
  // },
  // Removed hardcoded VITE_API_WS - port is now injected dynamically at runtime
})
