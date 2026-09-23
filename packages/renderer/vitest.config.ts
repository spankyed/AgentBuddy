import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // Specs live in tests/, mirroring src/ (tests/source-layout.spec.ts). Both spellings, so a file named
      // *.test.ts isn't silently never run
      include: ['tests/**/*.{spec,test}.?(c|m)[jt]s?(x)'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
