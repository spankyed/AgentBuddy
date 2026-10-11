import { definePackTestConfig } from '@apack/testing/vitest';

// Everything a pack's suite needs is `definePackTestConfig` (@apack/testing/vitest): the SFC stub that lets
// `vitest related` walk this pack's graph, the include and exclude, the small-target timeouts, and a throwaway data
// dir per run. This pack adds nothing: its own modules are `#` subpath imports, which Vite resolves from
// `package.json` `imports` unaided — measured, including extensionless — so the `vite-tsconfig-paths` that
// used to be here for its `@/…` aliases went with them.
export default definePackTestConfig({ dataDirPrefix: 'default-setup-tests-' });
