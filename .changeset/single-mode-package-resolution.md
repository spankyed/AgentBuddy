---
'@abuddy/testing': minor
'@abuddy/sdk': minor
'@abuddy/cli': minor
---

Packs resolve one layout: the `@abuddy` packages' published `dist`. Source-vs-dist detection is gone, with the exports and the environment variable that drove it. (`@abuddy/ears` and `@abuddy/ui` release at the same version, so they move with these three.)

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

**`@abuddy/testing`'s three entries resolve their built bundle on every condition**, so a checkout's copy is that bundle too. `abuddy test` and `abuddy dev` rebuild it when the checkout's sources moved; a run started directly (`npx vitest`, `npx playwright test`) fails naming `npm run packages:ensure` rather than testing the previous build silently.

**`@abuddy/sdk/testing` gained `startFeTestRuntime`/`stopFeTestRuntime`**, which bind a frontend host for a test file. Its `FeTestRuntimeOptions` references `vue` and `@tiptap/*` types, which the scaffolded `tsconfig.json` never sees because it sets `skipLibCheck: true`. A pack that turns that off needs `vue` (a required peer of `@abuddy/sdk`) installed, and `@tiptap/vue-3` and `@tiptap/pm` (optional peers) to check the tiptap members.
