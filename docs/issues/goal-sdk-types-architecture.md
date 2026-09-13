```
# Goal: typed facades, @abuddy/ui and one-manifest packaging for the SDK

Implement docs/issues/goal-sdk-types-architecture.md on branch
AS/external-pack-authoring: Background, Decisions, Phases, Deferred items,
Constraints. Read it first. Decisions are final: implement them, don't reopen
them or stop to ask. Where a detail isn't specified, pick the conventional
option, note it in the final summary, and keep going.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard
  or test is mutation-checked. Breaking changes to pack-facing APIs are
  expected: migrate default-setup, the in-repo fixture pack, the example pack
  and the scaffold/codegen with them, and don't keep compatibility shims.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`,
  `api:check`, and the api, sdk, cli, default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the monorepo smoke E2E,
  `npm run test:packaged-authoring`, and the example pack's
  `abuddy test --app-root <repo>` (8 tests) pass.
- Deferred items are fixed or listed with a reason.
- You give a final summary: phase/item → done/deferred, evidence, and the
  conventional choices you made.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines); stage only each commit's files.
- npm publish, create GitHub releases, or trigger workflows (dry runs/mocks only).
- pkill/killall Electron or node; launch the app outside the test env without
  an isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, run `npm install` in the example pack, or
  edit monorepo version/release metadata.
- loosen a failing assertion instead of investigating.
```

## Background

Investigation (2026-09-12) of how the published SDK should ship declarations. Prototypes and logs from that session aren't in the repo; the facts below are what they established.

**Current state.**
- `@abuddy/sdk` source: 170 `.ts` files and 46 `.vue` files. 398 relative imports have no extension.
- Published build: `packages/abuddy-sdk/scripts/build-package.ts` writes `dist/package` with a generated `package.json`. It transpiles each file with esbuild through a hand-written resolve plugin that adds `.js`, emits declarations with `tsc -p tsconfig.package.json`, then regex-rewrites relative specifiers in the `.d.ts` files. `.vue` files ship as source without declarations.
- The workspace `package.json` exports point at `src/`; the publish manifest drops host-only entries (`ears/internals`, `fe/host`, `fe/pack-store`, `persistence`, `backup`, `packs`, `build/discover`, `build/shared-deps`, `testing`). Host code imports these 40 times across api, renderer, main, cli and testing.
- Wildcard exports (`./fe/design/*`, `./fe/components/*`, `./fe/composables/*`, `./fe/layout/*`, `./fe/utils/*`, tiptap) have no `types` condition. Extensionless imports such as `@abuddy/sdk/fe/components/node-handles` don't typecheck against the published package.
- The scaffold's `src/env.d.ts` types every `.vue` import as `DefineComponent<Record<string, unknown>, Record<string, unknown>, any>`, so SDK component props are unchecked in packs.

**Pack typing depends on module augmentation.**
- The registries `EntityShapeRegistry`, `PluginEventRegistry`, `ServiceRegistry` and `NodeEntityRegistry` are declared in `packages/abuddy-sdk/src/types/entities.ts`.
- `generate-entries.ts` (lines ~532, ~810, ~826) and default-setup's step `types.ts` files augment `declare module '@abuddy/sdk/types'`, a module that only re-exports them.
- The SDK itself augments the declaring module: `declare module '../types/entities'` in `src/steps/types.ts`.
- Consumers of the registries: `ears/index.ts`, `ears/attribute-storage.ts`, `services/index.ts`, `helpers/actor-helpers.ts`, `framework/pack-registration.ts`, `steps/types.ts`.

**What the prototypes showed** (per-file vs rollup-plugin-dts shared chunks vs isolated per-entry rollups vs api-extractor `dtsRollup`; consumers: a cross-entry test, `tests/fixtures/external-pack`, a copy of the example pack, a copy of default-setup):

| Layout | Pack augmentation | `findById` from `@abuddy/sdk/ears` |
|---|---|---|
| Per-file (current) | works | typed (`MemoEntity & BaseEntity`) |
| Shared-chunk rollup | TS2664 unless the pack imports `@abuddy/sdk/types` somewhere | typed once the augmentation applies |
| Isolated rollup / api-extractor | compiles | `Record<string, any>`: the ears bundle has its own registry copy |

- Private-member classes (`StepRegistry`, `ArtifactRegistry`, `BlockRegistry`) and the `BinaryOperator` enum don't break across entries.
- Declaration size is 130–190 KB in every layout.

Root causes:
- Pack typing relies on ambient module augmentation of a re-exporting module.
- Published-artifact correctness comes from post-processing rather than the source and build.
- The component library is untyped and weighs down every pack's dependencies.
- The public surface is a filter over a dual manifest.

## Decisions

Final. Breaking changes are acceptable: nothing is published yet, so choose the right contract and migrate every in-repo consumer and template with it.

1. **Registry contract: generated typed facades, no module augmentation.**
   - A pack's typed data, event and service APIs come from its own generated modules: `#generated/ears`, `#generated/events` and `#generated/services`.
   - They are typed against a generated `PackShapes` (the pack's entities plus its dependencies' entities from the resolved dependency snapshots) and the pack's own event channels and services.
   - No untyped path for pack code:
     - `@abuddy/sdk/ears` exports a typed factory, `defineEars<S extends EntityShapes>()`, instead of the raw query helpers.
     - Codegen emits `export const { qx, findById, … } = /*#__PURE__*/ defineEars<PackShapes>();`. The factory returns the SDK's singleton functions (no runtime cost, no SDK bridge change), and the `__PURE__` annotation lets FE bundles that only use the `EARS` constants drop it.
     - The raw helpers move to host-internal `@abuddy/sdk/ears/internals` (later `@abuddy/host`), with `unknown` generic defaults instead of `Record<string, any>`.
   - No `any` fallback: an entity type the shape map doesn't declare reads as `BaseEntity & Record<string, unknown>` (id, entityType and createdAt are typed; other fields need narrowing).
   - Events use the same pattern: `defineEvents<PackEvents>()` returns typed `emit` and `sendToPlugin`. The raw `emit` / `sendToPlugin` stay available for host code but are strict (`P extends string`, `E extends { type: string }`), never `any`.
   - The global registries (`EntityShapeRegistry`, `PluginEventRegistry`, `ServiceRegistry`, `NodeEntityRegistry`) and every `declare module '@abuddy/sdk/…'` augmentation are removed.
   - Why: explicit instead of ambient type state (no program-inclusion or merge-order effects, no cross-pack collisions when the host compiles built-in packs together), dependencies compose visibly, independent of declaration layout, and consistent with the codegen-first model (Prisma/Drizzle/tRPC style).
2. **Host package split: in scope, before the first publish.**
   - Host-only modules move to a private workspace package `@abuddy/host`.
   - `@abuddy/sdk`'s own `package.json` is the published manifest, with an `@abuddy/source` export condition that monorepo tooling uses to resolve source.
   - Why: the package boundary is the API boundary, one manifest can't drift, the monorepo resolves the same exports as the public, and the dual-manifest class of publish bugs goes away.
3. **Typed components: in scope before the first release, as a separate `@abuddy/ui` package.**
   - The Vue component library (`fe/design`, `fe/components` incl. tiptap and Monaco editors, `fe/composables`, `fe/layout`, `fe/utils`) moves out of `@abuddy/sdk` into `@abuddy/ui`.
   - It ships vue-tsc declarations and an explicit exports map (no untyped wildcards). Its peers are vue and the host-shared libraries; the editor libraries are its own dependencies.
   - `@abuddy/sdk` keeps the platform API, including FE contracts (`Plugin`, `safeEvents`, contributions, `useActorSystem`, etc.), and drops the editor dependencies.
   - Why: correct types from the first release (no `any` usage baked into packs), and packs that don't render SDK UI don't install tiptap, `highlight.js` or the Monaco loader.

## Phases

### Phase 1 — Generated typed facades
- **Codegen** (`packages/abuddy-sdk/src/build/generate-entries.ts`, run by `abuddy generate-entries`):
  - `#generated/ears` exports `PackShapes` (including the SDK-owned `SdkEntityShapes`, e.g. `TNode`), `EntityShape<E>`, and `qx`, `findById`, `findByIdRaw`, `findAll`, `findWhere`, `findFirst`, `createEntity` from `/*#__PURE__*/ defineEars<PackShapes>()`.
  - `PackShapes` = this pack's entity shapes plus each dependency's entity shapes. The dependency snapshot (`.abuddy/deps/<id>/snapshot.json`, the `defs` / `.abuddy/generated/types.ts`) must carry what's needed to reference the dependency's entity types. Extend the snapshot if it doesn't.
  - `#generated/events` exports `PackEvents` and typed `emit` and `sendToPlugin` from `/*#__PURE__*/ defineEvents<PackEvents>()` (replacing `PluginEventRegistry`).
  - `#generated/services` exports `services` typed with the pack's feature services (replacing `ServiceRegistry`). A pack's own service modules can't import it (it imports them), so they use the SDK's `services`, which is typed as the host services only.
  - `#generated/types` exports `NodeEntity`, the union of the pack's step node interfaces (`interface XNode extends NodeBase` in each step's `types.ts`), replacing `NodeEntityRegistry`.
  - Remove the generated `entity-shapes.ts`, `event-channels.ts` and `service-types.ts` augmentation files, or turn them into plain type modules the facades import.
- **SDK:**
  - Remove the four registries from `src/types/entities.ts`, the internal `declare module '../types/entities'` in `src/steps/types.ts`, and every conditional type keyed on them (`EntityShape`, typed overloads in `ears`, `services/index.ts`, `helpers/actor-helpers.ts`, `framework/pack-registration.ts`, `ears/attribute-storage.ts`).
  - Replace them with generic, explicit signatures (`findById<T>`, `emit<P extends string, E>`…).
  - SDK-owned entities (e.g. `TNode`) are typed directly where the SDK uses them.
  - Run `npm run api:update` and commit the reports.
- **Consumers:** migrate default-setup (113 `@abuddy/sdk/ears` imports plus its step `types.ts` augmentations), the api/renderer host code that relied on registry typing, the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`; edit its source, don't `npm install`), and the scaffold and `abuddy add` templates.
- **Guardrail:** the compiler enforces it: the raw helpers aren't in the pack-facing SDK exports, so pack code can only use `#generated/ears`. No lint rule is needed.
- **Tests:**
  - Codegen unit test: a pack with its own entity and a dependency entity gets a facade whose `findById` types both, and rejects an unknown entity id type. Check with `IsAny` on a literal-typed field; `Record<string, any>` makes naive checks pass.
  - A consumer typecheck against the packed SDK with the generated facade (bundler and node16).

**Done when:** `@abuddy/sdk/ears` exports no untyped query helper; no fallback type in the facades or SDK is `any`; no `declare module '@abuddy/sdk` remains in SDK, codegen, templates, default-setup or the fixture/example packs. The facade tests pass and fail when the facade falls back to untyped signatures (mutation). default-setup, fixture and example pack typecheck; all E2E suites green.

### Phase 2 — Emit by construction
- Codemod every relative import in `packages/abuddy-sdk/src` to an explicit `.js` specifier (`./x.js`, `./dir/index.js`). Leave `.vue`, `.css` and `.json` as they are.
- The SDK typecheck uses `module`/`moduleResolution: nodenext` and `verbatimModuleSyntax`, so an extensionless relative import fails `npm run typecheck:sdk`.
- Build JS, `.d.ts` and `declarationMap` with `tsc`. Delete the esbuild resolve plugin and the `.d.ts` regex rewrite from `build-package.ts`. Keep the undeclared bare-import guard, reading `tsc`'s output and the `.vue` scripts.
- Confirm the monorepo consumers of SDK source still build and typecheck with `.js` specifiers: renderer Vite, api tsup and `tsc` (moduleResolution node), main (NodeNext), default-setup `tsc` and `dev-build.mjs`, and tsx in the CLI.

**Done when:** `@arethetypeswrong/cli` reports no problems for the packed SDK in node10, node16 (ESM) and bundler modes (node10 limitations explicitly ignored if the package is ESM-only). Adding an extensionless relative import fails the SDK typecheck (mutation). `test:packaged-authoring` passes.

### Phase 3 — `@abuddy/ui`: typed component library
- Create the workspace package `packages/abuddy-ui` (`@abuddy/ui`). Move the Vue component library out of `@abuddy/sdk`: `src/fe/design`, `src/fe/components` (including tiptap and Monaco editors), `src/fe/composables`, `src/fe/layout`, `src/fe/utils`.
- The FE platform contracts stay in `@abuddy/sdk/fe` (`Plugin`, `PackFERegistration`, `safeEvents`, contributions, navigation helpers, `useActorSystem`). Where a moved module is imported by SDK contract code, move the shared piece to the side that owns it; `@abuddy/sdk` must not depend on `@abuddy/ui`.
- Dependencies:
  - `@abuddy/ui` peers on `vue` and the host-shared libraries (`reka-ui`, `lucide-vue-next`, `@tiptap/core`, `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/pm`, `@vue-flow/core`, `@xstate/vue`, `xstate`) with host ranges, and on `@abuddy/sdk`.
  - The editor libraries (tiptap extensions, `highlight.js`, `lowlight`, `tiptap-markdown`, `@guolao/vue-monaco-editor`; `monaco-editor` types as appropriate) are its own dependencies.
  - Remove them from `@abuddy/sdk`.
- **Spike first:** determine which declaration filename (`X.vue.d.ts` or `X.d.vue.ts`) TypeScript 5.9 resolves for `import X from '@abuddy/ui/design/button.vue'` through the exports map, and whether consumers need `allowArbitraryExtensions`. Record the result in this doc.
- Emit SFC and TS declarations with `vue-tsc --declaration --emitDeclarationOnly` (vue-tsc 3.2.6), next to the shipped `.vue` source and compiled `.js`.
- Explicit exports map generated at build time: every public module gets `types` and `default` (no untyped wildcards).
- Migrate imports: default-setup, renderer, the fixture and example packs (the example pack gets `node_modules/@abuddy/ui` linked to the workspace package the same way its `@abuddy/sdk` is linked; no `npm install`), and the scaffold.
- FE bundler (`packages/abuddy-cli/src/build/fe-bundler.ts`) and `@abuddy/sdk/build/shared-deps`:
  - decide per `@abuddy/ui` module whether it's inlined into pack bundles (default for components) or host-shared;
  - keep the host-registry guard and the relative-import proxying working for `@abuddy/ui` modules that reach shared SDK modules.
- Add `@abuddy/ui` to the Changesets fixed group, `packages:build`, `publish-packages.ts`, the undeclared-import guard, `test:packaged-authoring` (install its tarball; the pack imports `TiptapEditor` and `SimpleMonacoEditor` from `@abuddy/ui`), CI and docs.
- Update the scaffold `tsconfig`/`env.d.ts` so `@abuddy/ui` components are typed; keep a `*.vue` shim only for the pack's own SFCs if still needed.

**Done when:** a pack passing a wrong prop type to an `@abuddy/ui` component fails typecheck against the packed packages (mutation: passes with the old shim). Every export entry has types (attw). A backend-only scaffolded pack installs no tiptap or `highlight.js` (checked in `test:packaged-authoring`). All E2E suites green.

### Phase 4 — One manifest per package, private `@abuddy/host`
- Create the private workspace package `packages/abuddy-host` (`@abuddy/host`) holding the host-only modules: `ears/internals`, `fe/host`, `fe/pack-store`, `persistence`, `backup`, `packs`, `build/discover`, `build/shared-deps` (move `shared-deps` wherever the CLI needs it; the CLI inlines host code into its bundle).
- Update the host imports in api, renderer, main, cli and testing (40 at the time of writing). The CLI and testing bundles inline `@abuddy/host` the way `scripts/bundle-package.ts` inlines the SDK today.
- `@abuddy/sdk` and `@abuddy/ui` each publish their own `package.json`:
  - `exports` has `types` and `import` pointing at `dist`, plus an `@abuddy/source` condition pointing at source.
  - `files` limits the tarball to built output (and `.vue` source for `@abuddy/ui`).
  - The dependencies are the real ones.
- Enable `@abuddy/source` in monorepo tooling:
  - Vite `resolve.conditions` (renderer, default-setup, and the CLI FE bundler only when building in-repo packs);
  - tsconfig `customConditions` in every workspace tsconfig that resolves these packages;
  - tsx `--conditions` (CLI bin in the monorepo), tsup/esbuild `conditions` (api, default-setup `dev-build.mjs`), vitest.
- Remove the generated publish manifests: `packages/abuddy-sdk/scripts/build-package.ts` only builds `dist/`, and `scripts/publish-packages.ts` publishes package directories.
- Update the SDK bridge (`packages/api/src/packs/pack-loader.ts`), `sdk-bridge-drift.spec.ts` and the FE host-shared module list for the moved modules.

**Done when:**
- The published `package.json` of `@abuddy/sdk` and `@abuddy/ui` is the workspace `package.json`, byte for byte.
- No host-only module is reachable from `@abuddy/sdk` or `@abuddy/ui` (attw plus a test).
- Host build, typecheck, unit suites and all E2E suites pass.

### Phase 5 — Validation in CI
- Run `publint` and `@arethetypeswrong/cli` on every packed package (`@abuddy/sdk`, `@abuddy/ui`, `@abuddy/cli`, `@abuddy/testing`) in `.github/workflows/ci.yml`.
- Consumer typecheck matrix against the packed packages, under bundler and node16:
  - generated facade typing (own and dependency entities);
  - `@abuddy/ui` component props;
  - every public export resolves.
- api-extractor reports for all public `@abuddy/sdk` and `@abuddy/ui` entries (not only `ears` and `types`), with `@internal` tags for exported-but-internal symbols; `api:check` covers them.
- Update D5 in `docs/issues/goal-external-pack-authoring.md`:
  - per-file declarations emitted by `tsc` / vue-tsc;
  - typed facades generated per pack instead of registry augmentation;
  - `@abuddy/ui` for components;
  - host modules in private `@abuddy/host`;
  - one manifest per package with the `@abuddy/source` condition.
- Update pack-author docs (`docs/public-facing/*`, `packages/abuddy-testing/CLAUDE.md`, root `CLAUDE.md` SDK barrel section, `packages/default-setup/CLAUDE.md`) for the new packages and imports.

**Done when:** each check fails CI on its class of break (mutation per check) and passes on the branch.

## Deferred items from the PR review

Fix or list with a reason:
- **Updater and `hostVersion`:** the updater (`packages/abuddy-sdk/src/packs/pack-updater.ts`) offers releases whose `hostVersion` the app can't satisfy. The release listing doesn't expose a pack's `hostVersion`; options include publishing it in release metadata (e.g. the `.sha256` sibling or a `bundle.json` asset) or reading `bundle.json` from the archive.
- **Install and fixture skip `hostVersion`:** `abuddy install` and the `@abuddy/testing` fixture don't check it, because the CLI doesn't know the target app's version. The checkout's `package.json` and the packaged app's `Info.plist` / `Resources/app/package.json` are available.
- **Staging-dir sweep:** old `.<id>.installing-*` / `.<id>.previous-*` dirs in the packs dir are never swept. A sweep must not delete another process's in-progress install (e.g. only dirs whose PID suffix isn't running, or older than a threshold at boot).
- **Untested release ordering:** `abuddy release` packs after the version commit (`d1ba64914`) without a test for that ordering.

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Check `git diff --cached` before each commit and stage only that commit's files. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases, no Homebrew tap pushes. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack (edit its source; link new workspace packages into its `node_modules` like its existing `@abuddy/sdk` link). Don't edit monorepo version/release metadata.
- Investigate failing tests before changing assertions; mutation-check every new guard or test.
- Prefer libraries over hand-rolled code (`tsc`, vue-tsc, publint, `@arethetypeswrong/cli`, api-extractor). No polling or hacky workarounds.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
- Manual API boots: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node dist/server.js`.
