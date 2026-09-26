import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts). Declared rather than left to vitest's 5s
      // default, which is *tighter* than the tier allows: under the chain's three lanes a 5.8s typecheck in
      // @abuddy/sdk crossed it and reported a hang where the tier had headroom to spare.
      testTimeout: 15_000,
      hookTimeout: 15_000,
      environment: 'jsdom',
      // Specs live in tests/, mirroring src/ (tests/source-layout.spec.ts). Both spellings, so a file named
      // *.test.ts isn't silently never run
      include: ['tests/**/*.{spec,test}.?(c|m)[jt]s?(x)'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
