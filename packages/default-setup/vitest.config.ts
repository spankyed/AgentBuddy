import tsconfigPaths from 'vite-tsconfig-paths';
import { definePackTestConfig } from '@abuddy/testing/vitest';

// Everything a pack's suite needs is `definePackTestConfig` (@abuddy/testing/vitest): the SFC stub that lets
// `vitest related` walk this pack's graph, the include and exclude, the tier-1 timeouts, and a throwaway data
// dir per run. What is left here is this pack's own, and only this pack's.
export default definePackTestConfig({
  dataDirPrefix: 'default-setup-tests-',
  // This pack names its own modules with `@/…`, a TypeScript `paths` mapping no runtime reads, so its test
  // run has to be told. `goal-one-way-to-name-your-own-modules.md` replaces them with `#` subpath imports,
  // which Node, Vite and esbuild all resolve, and then this line goes too.
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
});
