```
# Goal: spike `.ts` import specifiers, then switch if it passes

Implement docs/issues/goal-ts-import-specifiers.md on branch AS/pack-type-facades.
Decisions are final. Where a detail isn't specified, pick the conventional option,
note it in the final summary, and keep going.

Finished when:
- The spike result (pass/fail per check, with evidence) is recorded in this doc.
- If it passed:
  - @abuddy/sdk, @abuddy/ui and @abuddy/host use `.ts` relative specifiers.
  - A guard rejects `.js` relative specifiers in them (mutation-checked).
  - Docs are updated.
- If it failed: the doc says why, `.js` stays, and nothing else changed.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`,
  `api:check` (sdk, ui), `packages:build` + `packages:check`, and the api, sdk,
  host, cli, default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the smoke E2E, `npm run test:packaged-authoring`
  and the example pack's `abuddy test --app-root <repo>` (8 tests) pass.
- You give a final summary with the decision and conventional choices.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines); check `git diff --cached` and stage only each
  commit's files.
- npm publish, create GitHub releases, or trigger workflows.
- pkill/killall Electron or node; launch the app outside the test env without an
  isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit
  version/release metadata.
- loosen a failing assertion instead of investigating.
```

## Background

- The three packages use `.js` specifiers (`./query.js`). Node's ESM resolver adds no extensions and `tsc` doesn't rewrite them, so the source names the emitted file. It works, but reads oddly.
- TypeScript 5.7's `rewriteRelativeImportExtensions` lets source import `./query.ts`, and `tsc` rewrites it to `.js` on emit.
- Libraries using `.ts` specifiers: Effect (plain `tsc`, per-file output, `nodenext`, like us), XState, Valibot, Drizzle.
- Zod v4 and Octokit use `.js`. Vue, Vite, tRPC and TanStack Query use extensionless specifiers with a bundler, which we can't: rolled-up declarations duplicate shared class types.

## Decisions

1. `tsc` alone decides the output. No bundler or script rewrites specifiers or declarations.
2. One convention across sdk, ui and host. If any can't switch, all keep `.js`.
3. Flags: `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`. Not `erasableSyntaxOnly` (it would force rewriting the `enum`s).
4. Generated pack code (`generate-entries.ts`) keeps `.js`. It works in any pack tsconfig without extra flags.
5. After a switch, a guard rejects relative `.js` specifiers in the three packages. Use an existing lint rule if one fits (oxlint is in the repo); otherwise a small test. The `nodenext` check for extensionless imports stays.

## Spike (throwaway branch or worktree)

Codemod sdk, then ui (including `.vue` `<script>` blocks), then host and its tests. Check:

1. **Emit:** `dist/` JS, `.d.ts` and vue-tsc `.d.vue.ts` output contain `.js` specifiers (grep, don't assume). Hand-written `.d.ts` files still work.
2. **Published:** `packages:check` and the CLI tests `published-*`, `facade-typing` and `fe-bundler-host-registry`.
3. **SFCs:** `typecheck:ui`, the renderer's `vue-tsc --build`, Vite and Vitest all accept `.vue` scripts importing `.ts` modules.
4. **Consumers compiling this source.** TS5097 fires in any file in the program:
   - api `tsconfig.json`: node10, `paths` into source, and it emits, which `allowImportingTsExtensions` forbids;
   - renderer, main, cli, testing, default-setup (including `tsconfig.defs.json` and `rollup-defs.config.mjs`), and the api-extractor tsconfigs;
   - tsup, esbuild (`dev-build.mjs`, `bundle-package.ts`, the seed compiler), tsx and Playwright.

   Record the fix each consumer needs. If a consumer can only be fixed by violating Decision 1, the spike fails.
5. **End to end:** everything in "Finished when".

Write a "Spike result" section here: per-check result with evidence, the config changes needed, and the decision.

## Switch (if the spike passed)

- Apply the codemod, flags and consumer changes on the branch. Rebuild `packages/default-setup/dist/dev-entry.cjs` before the api suites.
- Add the Decision 5 guard to CI.
- Update root `CLAUDE.md`, the `build-package.ts` comments and any docs that describe `.js` specifiers.

## Spike result (2026-09-13): failed, `.js` stays

Run on a throwaway branch (`spike/ts-specifiers`, deleted afterwards) with TypeScript 5.9.3, vue-tsc 3.2.6, Vite 7.0.6 and esbuild 0.25.12. The codemod rewrote 312 relative specifiers in 81 SDK files, 38 in 17 UI files (including `.vue` `<script>` blocks) and 38 in 16 host files. The one import of a hand-written declaration (`fe/electron-api.d.ts` → `./speech-event.js`) has no `.ts` source and kept `.js`. The spike ran twice with the same outcome.

| Check | Result | Evidence |
|---|---|---|
| 1. Emit | ❌ | **SDK:** tsc-emitted JS has only `.js` relative specifiers, and `import('…/dist/ears/index.js')` loads under plain Node. The emitted `.d.ts` files keep `.ts` (`dist/index.d.ts`: `from './framework/index.ts'`), because `rewriteRelativeImportExtensions` doesn't rewrite declarations. **UI:** the tsc-emitted JS is rewritten, but `.d.ts` (3 files) and `.d.vue.ts` (5 files) keep `.ts`. The **11 `.vue` files shipped as source** keep `.ts` specifiers to modules that exist in `dist/` only as `.js` (`dist/design/ImageLightbox.vue`: `from '../composables/useContextMenu.ts'`, next to `useContextMenu.js`). |
| 2. Published | ✅ SDK / ❌ UI | **SDK:** `attw` exit 0, `publint --strict` "All good!", CLI `published-sdk-types` 5/5 and `published-exports` 2/2. Declarations with `.ts` specifiers resolve under node16 and bundler (with `noImplicitAny`) with no consumer flags. **UI:** `attw`, `published-ui-types` and `fe-bundler-host-registry` pass (none of them builds a shipped SFC); fails through check 5. |
| 3. SFCs | ❌ | `typecheck:ui` fails with `rewriteRelativeImportExtensions` enabled: 16× TS2876 ("This relative import path is unsafe to rewrite because it looks like a file name, but actually resolves to "./SimpleMonacoEditor.vue""), because vue-tsc resolves `X.vue` to a virtual TS file. It passes with `allowImportingTsExtensions` alone and the rewrite flag passed only to the tsc JS-emit run. In the monorepo the renderer's `vue-tsc --build`, Vite build and Vitest pass. A pack's Vite build of the shipped SFCs fails (check 5). |
| 4. Consumers | ✅ (fixable within Decision 1) | TS5097 counts without flags: api 191, host 161, cli 129, testing 129, ui 59. renderer, main and default-setup had 0 (their configs already allow `.ts` imports). Fixes: api `tsconfig.json` needs `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` (it emits); cli, testing, host and ui need `allowImportingTsExtensions`; the `facade-typing` test tsconfig needs it; `scripts/bundle-package.ts` (the testing package's declaration emit) needs `--allowImportingTsExtensions`; the UI build's JS emit needs `--rewriteRelativeImportExtensions` on its tsc run. With these, `npm run typecheck` passed and `packages:build` built all four packages. |
| 5. End to end | ❌ | `npm run test:packaged-authoring` exit 1: `FE bundle failed: Could not resolve "./extensions.ts" from "node_modules/@abuddy/ui/dist/components/tiptap/TiptapEditor.vue?vue&type=script&setup=true&lang.ts"` (the second run hit `./editor-config.ts` in the same file). The remaining suites weren't run on the spike, since this settles it. |

**Why it can't be fixed within the decisions.** `@abuddy/ui` ships `.vue` files as source for the pack's Vite build, and tsc never emits them. Their `.ts` specifiers can only resolve in `dist/` if one of these happens:
- a script rewrites them while copying, or the pack's bundler maps `.ts` to `.js` inside `@abuddy/ui`. Decision 1 rules out both, and the bundler variant would also break authors building with their own Vite config;
- `.ts` sources ship beside the emitted `.js`. SFCs would then load a second instance of those modules alongside the one other `.ts` modules and exports reach through `.js`, and the package would stop being dist-only;
- SFCs keep `.js` specifiers while `.ts` modules switch, which is two conventions (Decision 2);
- the UI build compiles SFCs to JS. That's a different packaging decision (packs would no longer compile the SFCs, or scan them for Tailwind classes) and outside this goal.

**Decision:** per Decision 2, all three packages keep `.js` specifiers. Nothing else changed. Revisit if `@abuddy/ui` stops shipping `.vue` source, or TypeScript and vue-tsc gain a supported way to rewrite specifiers in SFCs.

**Update:** `goal-compiled-ui-host-shared.md` removed the blocker. `@abuddy/ui` now publishes compiled JS, so no `.vue` source ships, and all three packages use `.ts` specifiers.
