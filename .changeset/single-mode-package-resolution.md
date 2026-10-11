---
'@apack/testing': minor
'@apack/sdk': minor
'@apack/cli': minor
---

Packs resolve one layout: the `@apack` packages' published `dist`. Source-vs-dist detection is gone, with the exports and the environment variable that drove it. (`@apack/ears` and `@apack/ui` release at the same version, so they move with these three.)

**`@apack/testing/vitest` no longer exports `sourceConditions`.** A `vitest.config.ts` scaffolded by an older `apack init` fails at config load with:

```
SyntaxError: The requested module '@apack/testing/vitest' does not provide an export named 'sourceConditions'
```

Delete the import, the `conditions` constant and the `resolve`/`ssr.resolve` options it fed — nothing replaces them:

```diff
-import { isolatedDataDir, sourceConditions } from '@apack/testing/vitest';
+import { isolatedDataDir } from '@apack/testing/vitest';
-
-const conditions = sourceConditions(import.meta.dirname);
 const dataDir = isolatedDataDir();

 export default defineConfig({
-  resolve: { conditions },
-  ssr: { resolve: { conditions } },
   test: { /* unchanged */ },
 });
```

Do the same in a `tsconfig.json` that sets `"customConditions": ["@apack/source"]`: remove the option. A pack that keeps either one now compiles against a layout it does not have.

**`@apack/sdk/build/source-conditions` is removed**, and `sourceConditions` with it. `APACK_PACKAGES=source|dist` is no longer read anywhere; unset it.

**`@apack/testing`'s three entries resolve their built bundle on every condition**, so a checkout's copy is that bundle too. `apack test` and `apack dev` rebuild it when the checkout's sources moved; a run started directly (`npx vitest`, `npx playwright test`) fails naming `npm run packages:ensure` rather than testing the previous build silently.

**`@apack/sdk/testing` gained `startFeTestRuntime`/`stopFeTestRuntime`**, which bind a frontend host for a test file. Its `FeTestRuntimeOptions` references `vue` and `@tiptap/*` types, which the scaffolded `tsconfig.json` never sees because it sets `skipLibCheck: true`. A pack that turns that off needs `vue` (a required peer of `@apack/sdk`) installed, and `@tiptap/vue-3` and `@tiptap/pm` (optional peers) to check the tiptap members.
