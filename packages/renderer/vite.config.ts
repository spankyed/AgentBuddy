import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
// import tailwindcss from 'tailwindcss'
// import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig({
  // base: './', // Use relative paths for Electron compatibility
  plugins: [
    vue(),
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
  define: {
    // Define any environment variables the web app expects
    'import.meta.env.VITE_API_WS': JSON.stringify('ws://localhost:3001/trpc')
  }
})
