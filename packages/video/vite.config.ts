import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../renderer/src', import.meta.url)),
      '@video': fileURLToPath(new URL('./src', import.meta.url)),
      '@abuddy/api': fileURLToPath(new URL('../api/src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('film'),
  },
  server: {
    host: '127.0.0.1',
  },
});
