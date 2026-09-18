---
'@abuddy/testing': major
'@abuddy/sdk': major
'@abuddy/cli': major
---

Packs resolve one layout: the `@abuddy` packages' published `dist`. Source-vs-dist detection is gone, with the exports and the environment variable that drove it.

**`@abuddy/testing/vitest` no longer exports `sourceConditions`.** A `vitest.config.ts` scaffolded by an older `abuddy init` fails at config load with:

```
SyntaxError: The requested module '@abuddy/testing/vitest' does not provide an export named 'sourceConditions'
```

Delete the import, the `conditions` constant and the `resolve`/`ssr.resolve` options it fed — nothing replaces them:

```diff
-import { isolatedDataDir, sourceConditions } from '@abuddy/testing/vitest';
+import { isolatedDataDir } from '@abuddy/testing/vitest';
-
-const conditions = sourceConditions(import.meta.dirname);
 const dataDir = isolatedDataDir();

 export default defineConfig({
-  resolve: { conditions },
-  ssr: { resolve: { conditions } },
   test: { /* unchanged */ },
 });
```

Do the same in a `tsconfig.json` that sets `"customConditions": ["@abuddy/source"]`: remove the option. A pack that keeps either one now compiles against a layout it does not have.

**`@abuddy/sdk/build/source-conditions` is removed**, and `sourceConditions` with it. `ABUDDY_PACKAGES=source|dist` is no longer read anywhere; unset it.

**`@abuddy/sdk/testing` gained `startFeTestRuntime`/`stopFeTestRuntime`**, which bind a frontend host for a test file. `FeTestRuntimeOptions` references `vue` and `@tiptap/*` types, so a pack whose unit tests import `@abuddy/sdk/testing` and type-check with `skipLibCheck: false` needs those packages installed — the pack frontend template already has them.
