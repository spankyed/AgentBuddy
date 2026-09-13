```
# Goal: fix the review findings for typed facades, @abuddy/ui, @abuddy/host and packaging

Implement docs/issues/goal-review-fixes.md on branch AS/pack-type-facades: Background,
Decisions, Phases, Constraints. Read it first. Decisions are final: implement them, don't
reopen them or stop to ask. Where a detail isn't specified, pick the conventional option,
note it in the final summary, and keep going. The EARS engine instance refactor is out of scope.

Finished when:
- Phases 1–6 meet their "Done when", and every finding in Background is fixed or listed in
  the final summary with the reason it was left.
- Every new guard or test is mutation-checked.
- `npm run typecheck`, `npm run typecheck -w @app/main`, `schema:check`, `api:check`
  (sdk, ui), `packages:build` + `packages:check`, and the api, sdk, host, cli,
  default-setup and renderer unit suites pass.
- `npm run test:external-pack`, the smoke E2E, `npm run test:packaged-authoring` and the
  example pack's `abuddy test --app-root <repo>` (8 tests) pass, from a checkout with no
  `packages/*/dist`.
- A final summary: finding → fixed/left, evidence, and the conventional choices made.

Never:
- push or tag. Commit as you go in logical chunks (conventional messages, no
  Co-Authored-By or session lines). Commit with `git commit -- <paths>` and check
  `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- pkill/killall Electron or node; launch the app outside the test env without an
  isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit
  version/release metadata.
- loosen a failing assertion instead of investigating.
```

## Background

A review of `5bd22a445..HEAD` (the typed facades, `@abuddy/host`, compiled host-shared `@abuddy/ui` and `.ts` specifier work) found these problems. IDs are referenced by the phases.

**Release configuration**
- R1 (high). `@abuddy/ui` peers on `@abuddy/sdk ^0.1.0`. Changesets bumps a peer dependent major whenever the peer bumps minor, and the `fixed` group carries it to all four packages: a minor SDK changeset yields 1.0.0 everywhere (reproduced with `changeset status`; `@changesets/assemble-release-plan` ~line 340).
- R2 (medium). No declared TypeScript floor. Published SDK declarations need TS ≥ 5.0 (TS 4.9 reports TS2691, or turns every import `any` with `skipLibCheck`); 46 UI declarations use `import("vue", { with: { "resolution-mode": "import" } })`, which needs TS ≥ 5.3.
- R3 (medium). `packages/abuddy-sdk/src/fe/index.ts:1` `/// <reference path="./electron-api.d.ts" />` is dropped from emitted declarations (TS ≥ 5.5 needs `preserve="true"`), so published `@abuddy/sdk/fe` no longer declares `window.electronAPI`.
- R4 (low). `@abuddy/ui` tiptap peer floors (`^3.20.1`) are below what its own extensions need (`^3.22.x`); `@tiptap/extension-text-style` (peer of `extension-color`) is undeclared. `typescript` and `esbuild` are runtime `dependencies` of the SDK. SDK source and declaration maps point at unshipped `../src`. `changeset version` doesn't update `package-lock.json`.
- R5 (medium). The UI build's undeclared-import guard can't fire: tsdown bundles any resolvable package that isn't external, so an undeclared import ships a second copy instead of failing.
- R6. `ci.yml` and `publish-packages.yml` run only on `workflow_dispatch`; none of the checks run on PRs.

**Source condition and tooling**
- S1 (medium). Root `.npmrc` `node-options` replaces a user's `NODE_OPTIONS` instead of appending (`NODE_OPTIONS=--max-old-space-size=4096 npm run x` loses the flag). `${NODE_OPTIONS}` expansion isn't usable: npm leaves the literal text when it's unset.
- S2 (medium). `packages/abuddy-cli/bin/abuddy.mjs` source mode adds `@abuddy/source` to every resolution in the CLI (including installed `@abuddy/sdk` copies, which don't ship `src`) and exports it through `NODE_OPTIONS` to every child process (Playwright, npm, launched apps). `test-packaged-authoring.sh` works around it.
- S3 (medium). Processes without the condition (plain `node`/`tsx`, IDE Playwright runners, editors on `tests/e2e`) silently resolve `@abuddy/sdk`/`@abuddy/ui` to a stale `packages/*/dist`; TypeScript falls back to `dist` declarations when a source target doesn't resolve. This hid the component-types bug once already.
- S4 (medium/low). The scaffold tsconfig (`packages/abuddy-cli/src/commands/init.ts:31-46`) lacks `allowImportingTsExtensions`, so a pack linked to a checkout gets TS5097 from `@abuddy/host`/`@abuddy/testing` source; `tests/cli/scaffold.spec.ts:18` now passes flags on the command line instead of testing the generated tsconfig.
- S5 (low). `packages/api/tsconfig.json` sets `allowImportingTsExtensions` twice (the later `false` wins) and still uses node10 `paths` instead of `customConditions` (hence `// @ts-expect-error` on `@abuddy/sdk/inference` in `pack-loader.ts`). `packages/main/tsconfig.json`, `packages/renderer/tsconfig.node.json` and `packages/default-setup/tsconfig.defs.json` lack the flag and pass only because the files they reach have no relative imports. `packages/abuddy-sdk/tests`, `packages/*/scripts`, `packages/abuddy-ui/tsdown.config.ts` and root `scripts/` are never typechecked.
- S6 (low). `scripts/check-import-specifiers.ts` misses `require('./x.js')`, `import x = require()`, `vi.mock('./x.js')`, `.mts`/`.cts`/`.tsx` targets and files, and exits 0 silently when run through a symlinked path. It has no spec. `published-specifiers.spec.ts` only scans `.js`/`.mjs`.
- S7 (low). `api:build` never clears `.temp/api-types`. `published-*` specs skip silently without `dist` and pass against a stale one (`PACKAGES_BUILT` checks existence only).

**`@abuddy/ui` contract**
- U1 (high). Component API reports contain only `const _default: typeof __VLS_export`: props, emits, slots and exposed members aren't in `etc/*.api.md`, so `api:check` doesn't catch a breaking component change (it only caught `SimpleMonacoEditor` because that one exports a named props interface). The host-shared semver contract isn't enforced.
- U2 (medium). A pack whose host lacks a UI module crashes its whole FE entry (`Cannot read properties of undefined`); a missing named export is silently `undefined`. `fe-bundler-shared-ui.spec.ts:35` stubs missing keys with `?? {}`.
- U3 (medium). With `fe.bundleUi`, only the exact `@tiptap/core`, `@tiptap/vue-3`, `@tiptap/starter-kit` specifiers are host-shared, so the pack inlines `prosemirror-*`/`@tiptap/pm/*` and `@tiptap/vue-3/menus` next to the host's core: two ProseMirror instances.
- U4 (medium). `fe.bundleUi` packs don't scan `@abuddy/ui` for Tailwind classes (`fe-bundler.ts:258`); it only works because the host CSS has the same classes.
- U5 (low). Proxy export discovery (`parseNamedExports`, `discoverSourceExports`) is regex-based. It matches es-module-lexer on today's 67 entries, but misses `export * from './x.ts'`, `export * as`, `export enum`, destructured exports, and names in comments, with nothing guarding it.
- U6 (low). `computeEntries` publishes every `.ts` under `src` (a future helper or `*.spec.ts` becomes public). `findComponentsWithoutEntry` runs only in `exports:update` and isn't mutation-checked by a spec.
- U7 (low). The UI build emits no source maps. `virtual:host-deps` loads every UI module at boot, so module side effects (e.g. `UnifiedMonacoEditor.vue`'s window error listeners) always install.

**Type contract**
- T1 (high). Dependency entity shapes never resolve in real packs: `abuddy build` reads `snapshot.defs` from `<pack>/defs`, which nothing writes (default-setup's snapshot has 0 defs); `entityShapeEntries` only matches `export interface|type X`, not rollup's `export type { X }`; unmatched shapes are skipped silently. `facade-typing.spec.ts` hand-writes a defs file, so it passes.
- T2 (high). Own and dependency (or two dependency) shapes with the same type name generate duplicate `import type` lines (`TS2300 Duplicate identifier`).
- T3 (high). `any` reaches packs from `@abuddy/sdk/ears` and `@abuddy/sdk/services`: `repository: any`; `tx()` has no return annotation, so its chain methods are `any` in `dist`; `getAttr` returns `any`; `createEntityWithDefaults`/`updateEntity` use `Record<string, any>`; `findWithFields`, `findByIdWithFields`, `findWithRole`, `findFirstWithRole` stay pack-facing with caller-chosen `T`; `services: HostServices & Record<string, any>`; `AttributeValue` includes `any`.
- T4 (high). `packages/default-setup/tests/unit/sdk-type-safety.spec.ts`, `typed-event-channels.spec.ts` and `entity-shape-registry.spec.ts` use assertions that pass on `any`/`Record<string, unknown>` (`toHaveProperty`, `toMatchTypeOf`), so they don't catch a facade regression. Comments still describe augmentation.
- T5 (medium). `PackEvents` maps a feature's plugin id to only that feature system's `Outgoing` events. Legitimate sends can't be typed (actions → flows, settings → host `application`, sends to dependency plugins), so default-setup falls back to raw `emit` in `actions/be/system.ts`, `settings/be/system.ts`, `code/be/features/terminal.ts`. Features with a plugin but no system get no entry.
- T6 (medium). Generated `Services` omits dependency services (`services.llm` is a compile error in a pack depending on default-setup, though present at runtime). At runtime the proxy merges every pack's services into one object: same-named services shadow each other, and a pack service named `logger` replaces the host logger.
- T7 (medium). `packages/default-setup/dist/defs/monaco/database-defs.d.ts` re-exports `getAllEntities`, `queryEntitiesBy*` from `@abuddy/host/ears`, which Monaco can't resolve (`tsconfig.defs.json` has no host path).
- T8 (medium). `docs/public-facing/services-and-data.md` says `pick`/`pickOne`/`linksPick` aren't narrowed (they are), that id-seeded builders can't know the entity (branded ids do), and that `@abuddy/sdk/ears` has no untyped helpers (see T3). The services section doesn't mention `#generated/services`.
- T9 (medium). Node16 facade coverage is nominal: `facade-typing.spec.ts` only includes `ears.ts`. Generated `pack-entry.ts`/`pack-entry-fe.ts` emit extensionless side-effect imports (`import './seeders'`, `import './dsl-register-fe'`, `generate-entries.ts:351,450`).
- T10 (low). Codegen: dotted extensionless manifest entries (`src/x/memo.types`) get no `.js`; backslash paths aren't normalized; a namespace service named `services` collides with the generated export; `abuddy-cli/src/commands/generate-entries.ts:14` looks for `build/generate-entries.js` but the published SDK ships `dist/build/generate-entries.js`; a pack `TNode` shape silently intersects the SDK's.

**Pack lifecycle**
- L1 (medium). `placePack` (`pack-installer.ts:159-163`) renames `<id>` to `.<id>.previous-<pid>` before renaming `incoming` to `<id>`; a crash between them leaves the pack only in `.previous`, which the boot sweep deletes. The sweep (`api/src/setup/backend.ts:44-50`) runs after `loadExternalPacks()`, which has already dropped the "missing" pack from the registry.
- L2 (medium). The sweep regex `/^\.[^/]+\.(installing|previous|publishing)-(\d+)?/` isn't anchored: legacy random suffixes starting with digits are read as PIDs (`installing-1AbCdE` → PID 1, never swept; `installing-99999x` → swept at once).
- L3 (medium). `findLatestRelease` walks every candidate including versions at or below the installed one: up to 100 sequential raw fetches per pack per check, no timeout.
- L4 (low). The updater reads `abuddy.json` only from the repo root at the tag (subdirectory packs, private repos and rate limits silently skip the filter). Cached `availableVersion` within the check interval bypasses the host check and survives app upgrades/downgrades.
- L5 (low). Sweep, `recordHostVersion` and stat errors (ENOENT race, Windows EBUSY) can reject `setupBackend`; `host.json` isn't written atomically; `.previous-${process.pid}` has no random suffix, so PID reuse after a crash makes the next install fail with ENOTEMPTY.
- L6 (low). `abuddy dev` (`commands/dev.ts`) installs without `hostVersion`. `@abuddy/sdk/cron` and `@abuddy/sdk/utils/compare-versions` aren't bridged; in the packaged app an external pack has no `node_modules`, so requiring them fails. Root `test:unit` doesn't run `@abuddy/host`.

**Shipping follow-ups**
- F1. The example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) isn't a git repo; its migration exists only on disk.
- F2. `npm run build` doesn't rebuild `packages/default-setup/dist/dev-entry.cjs`, so the api's dev loading goes stale after SDK/host changes.
- F3. Renderer startup cost of exposing every UI module eagerly isn't measured (main chunk +0.77%).
- F4. The publish dry run isn't in CI.

## Decisions

Final.

1. **Changesets.** `@abuddy/ui` peers on `@abuddy/sdk` with `">=0.1.0 <1.0.0"` (widen it only when the fixed group's major changes), and `.changeset/config.json` sets `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH.onlyUpdatePeerDependentsWhenOutOfRange: true`. The publish workflow's version step runs `npx changeset version && npm install --package-lock-only`.
2. **TypeScript floor.** `@abuddy/sdk` and `@abuddy/ui` declare `typescript: ">=5.3"` as an optional peer. The published-types specs also run under TypeScript 5.3, installed as a root devDependency alias (`typescript-5.3: npm:typescript@~5.3.3`).
3. **SDK package hygiene.** `preserve="true"` on the `electron-api.d.ts` reference. No source or declaration maps in the SDK build (the package ships `dist` only). `typescript` and `esbuild` become optional peers of `@abuddy/sdk` (the CLI and the api provide them). Tiptap peer floors in `@abuddy/ui` rise to the minimum its own dependencies require, and `@tiptap/extension-text-style` is declared.
4. **Undeclared imports fail the UI build.** `tsdown.config.ts` sets `deps.onlyBundle: []`, so resolving any package that isn't a declared dependency or peer is a build error.
5. **Node processes get the source condition explicitly, not from `.npmrc`.**
   - Remove `node-options` from `.npmrc`.
   - `scripts/with-source.mjs <command…>` appends `--conditions=@abuddy/source` to any existing `NODE_OPTIONS` and runs the command. Root and workspace scripts that start Node on workspace source (Playwright, `tsx` scripts, `abuddy` from source, `api` dev boots) use it. Vite, Vitest, esbuild and tsup keep their own configured conditions.
   - Docs replace `npx playwright test …` with `npm test -- …`.
6. **The CLI's source mode is scoped.** The resolve hook adds `@abuddy/source` only when the importing file is inside the checkout and outside any `node_modules`. The bin no longer sets `NODE_OPTIONS`. `abuddy test` passes the condition (via Decision 5's appending) only to Playwright, and only when `@abuddy/testing` resolves from the checkout; it never passes it to a launched app.
7. **Stale `dist` fails loudly.** `@abuddy/testing`, the CLI in source mode and the api's dev boot throw when `@abuddy/sdk`, `@abuddy/ui` or `@abuddy/host` resolve inside the checkout's `packages/*/dist` while the matching `packages/*/src` exists, naming the missing condition. `tests/tsconfig.json` sets `customConditions` for editors.
8. **Every workspace config that compiles SDK/host/UI source states its flags.** Scaffold template gets `allowImportingTsExtensions` (it has `noEmit`). api drops the duplicate key and moves from `paths` to `customConditions`. main, renderer `tsconfig.node.json` and `tsconfig.defs.json` get the flag. `packages/abuddy-sdk/tests`, `packages/*/scripts`, `packages/abuddy-ui/tsdown.config.ts` and root `scripts/` get tsconfigs and run in `npm run typecheck`.
9. **The specifier guard covers every module form**: static and dynamic imports, re-exports, import types, `require`, import-equals, `vi.mock`-style module-path calls, `.ts`/`.tsx`/`.mts`/`.cts` sources and targets, and `.vue` scripts. It has a spec with a fixture per form. The published-specifier spec scans `.js`/`.mjs`/`.cjs`.
10. **Component contracts are reported.** `scripts/api-reports.ts` writes `etc/<entry>.component.md` for each component entry: resolved props (name, type, optional), emits (name, payload), slots (name, props) and exposed members, computed with the TypeScript checker over `vue-component-type-helpers` (`ComponentProps`, `ComponentEmit`, `ComponentSlots`, `ComponentExposed`; add it as a root devDependency). `api:check` fails when one is out of date.
11. **Proxies fail clearly on an older host.** The generated proxy throws `@abuddy/ui/<subpath> isn't provided by this AgentBuddy; update the app or check the pack's hostVersion` when the host lacks the module, and `console.warn`s once per missing named export. Export discovery uses es-module-lexer on the resolved module (compiled JS; SFC source is compiled through Vite's transform first when resolved under `@abuddy/source`).
12. **`fe.bundleUi` bundles everything but the host's editor core.** Host-shared tiptap is matched by prefix: `@tiptap/core`, `@tiptap/pm` and every `@tiptap/pm/*` subpath, `@tiptap/vue-3` and every `@tiptap/vue-3/*` subpath, and `@tiptap/starter-kit`; the renderer exposes those subpaths too. So a bundled UI and the host share one ProseMirror. The pack's Tailwind content includes the resolved `@abuddy/ui` `dist/**/*.js` (or its `src/**/*.{vue,ts}` under the source condition).
13. **UI publish surface.** Public modules are `.ts` files under `src` except `*.spec.ts`, `*.test.ts` and anything under an `internal/` directory. `findComponentsWithoutEntry` runs in `packages/abuddy-ui/scripts/build-package.ts` and as `npm run check:ui-entries` in `npm run typecheck`. The UI build emits source maps.
14. **Each pack build publishes its facade types for dependents.**
    - `abuddy build` writes `dist/types/pack-types.d.ts`: a self-contained declaration bundle (rollup-plugin-dts, added to `@abuddy/cli` dependencies) exporting `PackEntityShapes`, `PackEvents`, `Services` and `Repositories` of that pack. `snapshot.json` carries it, and `fetch-deps` writes it to `.abuddy/deps/<id>/defs/pack-types.d.ts`.
    - Generated facades import each dependency's types under a pack-specific alias (`import type { PackEntityShapes as __dep_base_pack_Shapes } …`), so type names never collide.
    - Codegen fails when a declared own entity shape can't be found.
15. **Events are keyed by the receiving plugin.**
    - Manifest `features[].system.sendsTo?: string[]` lists plugin ids the system sends to besides its own: own feature ids, dependency plugin ids, or host plugins.
    - `PackEvents[p]` = the union of `Outgoing` events of p's own system and of every system whose `sendsTo` includes p; dependency plugins' unions come from the dependency's `PackEvents`; host plugins come from an SDK `HostPluginEvents` type (starting with `application`).
    - Features with a plugin but no system get an entry when something sends to them.
    - default-setup declares its cross-plugin sends and uses only the generated `emit`/`sendToPlugin`. Raw `emit`/`sendToPlugin` stay public for host code (Decision 1 of `goal-sdk-types-architecture.md`), but default-setup, the fixture and example packs and the scaffold templates don't import them (`npm run check:specifiers` gains a check for raw event helper imports under pack sources).
16. **Repositories are declared like services.**
    - Manifest `features[].repositories?: Record<string, string>` maps a repository name to `path#exportName`.
    - Codegen generates `#generated/repository` exporting `repository` typed as this pack's repositories plus its dependencies' (`Repositories` from their `pack-types.d.ts`), and the generated pack entry registers them (replacing `registerRepository(...)` side effects in feature code).
    - `@abuddy/sdk/ears`' `repository` becomes `Record<string, unknown>` for host code.
17. **No `any` on the pack-facing SDK surface.**
    - `tx()` is annotated as returning `TransactionBuilder`.
    - `createEntityWithDefaults`, `updateEntity`, `getAttr`, `getAttrs`, `findWithFields`, `findByIdWithFields`, `findWithRole` and `findFirstWithRole` join `defineEars`' typed factory (typed by the pack's shapes) and move to `@abuddy/sdk/ears/internals` for host code.
    - `AttributeValue` and `services` use `unknown` instead of `any`.
    - A test walks the published `@abuddy/sdk` pack-facing declarations (every export except `ears/internals`) and fails on any exported symbol whose type contains `any` (allowlist with a reason for genuine cases, e.g. XState generics).
18. **Services are typed with dependencies and can't collide.** Generated `Services` intersects each dependency's `Services`. `registerPack` throws when a service name is already registered by another pack or is a host service name (`logger`, `emitter`, `repository`).
19. **Pack lifecycle.**
    - The api boot runs `recoverStagingDirs` before pack discovery: a `.<id>.previous-<pid>-<suffix>` whose process is gone and whose `<id>` is missing is renamed back to `<id>`; then stale staging dirs are removed. New staging names are `.<id>.(installing|previous)-<pid>-<random>` and `.<id>.publishing-<pid>-<random>`, matched by anchored patterns; legacy names without a PID use the one-hour age rule. Each entry and each boot call is wrapped so a failure logs instead of rejecting boot. `host.json` is written via temp file and rename.
    - `abuddy release` uploads `<archive>.bundle.json` (the bundle's `bundle.json`, which includes `hostVersion`) as a release asset. The updater only considers releases newer than the installed version, reads that asset for them (falling back to `abuddy.json` at the tag), stops at the first compatible one, caps fetches at 10 with a 10 s timeout each, and keys its cached result by host version.
    - `abuddy dev` passes `hostVersion`. `@abuddy/sdk/cron` and `@abuddy/sdk/utils/compare-versions` are added to `SDK_BRIDGE`.
20. **Shipping.**
    - `ci.yml` runs on `pull_request` and `push` to master (the external-pack job included). The check job runs `scripts/publish-packages.ts --dry-run` after `packages:build`, and the `published-*` specs fail when `CI` is set and packages aren't built. Root `test:unit` includes `@abuddy/host`.
    - `packages/default-setup`'s `build` script runs `dev-build.mjs` too.
    - The example pack gets `git init` and one commit of its current state (no remote).
    - Renderer startup is measured (the smoke fixture's "app connected N ms after launch") before and after Phase 3; UI modules are exposed lazily only if startup regressed more than 10%.

## Phases

### Phase 1 — Release safety and CI (R1–R6, F4, Decision 1–4, 20 CI parts)

- Apply Decisions 1–4 and the CI parts of Decision 20.
- Tests: a spec runs `changeset status` against a scratch copy of the manifests and config with a minor SDK changeset and expects 0.2.0 for all four (mutation: removing the option yields 1.0.0); the published-types specs run under TS 5.3 and assert `window.electronAPI` is declared; a tsdown undeclared import fails `build:package` (mutation-checked once by hand, recorded).

**Done when:** the changeset spec passes; `packages:check` passes; `npm pack --dry-run` of the SDK lists no `.map` files; CI triggers on PRs.

### Phase 2 — Source-condition hygiene (S1–S7, Decisions 5–9)

- Replace the `.npmrc` setting with `scripts/with-source.mjs` and update scripts and docs.
- Scope the CLI hook; remove its `NODE_OPTIONS` export; drop the `unset NODE_OPTIONS npm_config_node_options` workaround from `test-packaged-authoring.sh`.
- Stale-`dist` detection in `@abuddy/testing`, CLI source mode and the api dev boot.
- Config fixes (Decision 8), guard extension with spec (Decision 9), `.temp` clearing, CI-strict `published-*` skips.
- Tests: user `NODE_OPTIONS` survives an npm script; the CLI hook leaves an installed `@abuddy/sdk` resolving to `dist`; stale-`dist` detection throws (unit test with a scratch checkout layout); the scaffold spec runs plain `tsc` on the generated tsconfig with a linked checkout.

**Done when:** all of the above tests pass and are mutation-checked; `npx playwright test` documentation is gone; the smoke E2E passes via `npm test -- smoke` with no `dist`.

### Phase 3 — `@abuddy/ui` contract (U1–U7, Decisions 10–13, F3)

- Component contract reports; proxy host checks and es-module-lexer discovery; prefix-shared tiptap and Tailwind content for `fe.bundleUi`; publish-surface rule; entries check in build and typecheck; UI source maps.
- Tests: changing a prop, emit or slot fails `api:check`; a pack FE loaded against a host without a module throws the Decision 11 message and warns on a missing named export (remove `?? {}` from `fe-bundler-shared-ui.spec.ts`); proxy export names equal es-module-lexer's exports for every UI entry; a `fe.bundleUi` pack's `fe.js` contains no `prosemirror-model` code and its `fe.css` contains a class only a UI component uses; the fixture pack gets a second plugin built with `fe.bundleUi` that renders `TiptapEditor` in E2E.
- Record renderer startup before/after (Decision 20).

**Done when:** those tests pass and are mutation-checked; startup numbers are recorded in this doc.

### Phase 4 — Type contract (T1–T10, Decisions 14–18)

- `pack-types.d.ts` in the build and snapshot; aliased dependency imports; `sendsTo`, `HostPluginEvents` and receiver-keyed `PackEvents`; manifest `repositories` and `#generated/repository`; the `any` removals and typed factory additions; dependency `Services` and collision checks.
- Migrate default-setup (declare `sendsTo` and `repositories`; replace raw `emit`, `registerRepository` side effects and the moved helpers), the fixture pack, the example pack and the scaffold/`abuddy add` templates. Regenerate schemas and API reports.
- `tsconfig.defs.json` host path (T7). Rewrite the `services-and-data.md` paragraphs (T8). Add `.js` to the side-effect imports and include every generated facade file in `facade-typing.spec.ts` under node16 and bundler (T9). Codegen fixes (T10).
- Rewrite the default-setup type specs with `Equal`/`IsAny`/`@ts-expect-error` (T4).
- Tests: a real `abuddy build` of a scratch dependency pack, `fetch-deps`, and a dependent pack whose `findAll('<DepEntity>')[0].<field>` is exactly typed and whose `services.<depService>` and `repository.<depRepo>` typecheck; own/dependency type-name collision compiles; `emit('flows', <action event>)` from a system with `sendsTo: ['flows']` typechecks and without it fails; `sendToPlugin('application', …)` is typed; the published-SDK `any` walk passes; `registerPack` rejects a duplicate service name; codegen fails on an unfindable own shape.

**Done when:** those tests pass and are mutation-checked; default-setup, fixture and example packs contain no raw `emit`/`sendToPlugin` or `registerRepository` calls; `grep` of pack-facing declarations for `any` returns only allowlisted entries.

### Phase 5 — Pack lifecycle (L1–L6, Decision 19)

- Staging recovery before discovery, anchored patterns, random suffixes, wrapped boot calls, atomic `host.json`.
- Release `bundle.json` asset; updater bounds, timeout, cache key; `abuddy dev` `hostVersion`; bridge the two leaves (update `sdk-bridge-drift.spec.ts`).
- Tests: crash recovery (`.previous` with `<id>` missing is restored and the registry keeps the pack enabled); a digit-first legacy name follows the age rule; a boot with an unremovable staging dir still boots; the updater stops at the installed version and makes at most 10 fetches; a cached result is ignored after a host version change; `abuddy release --dry-run` lists the `bundle.json` asset; external pack requiring `@abuddy/sdk/cron` loads through the bridge.

**Done when:** those tests pass and are mutation-checked.

### Phase 6 — Ship (F1–F3, Decision 20)

- `default-setup` build runs `dev-build.mjs`; example pack under git; root `test:unit` includes host; startup decision applied (Phase 3 numbers).
- Update `CLAUDE.md`, `packages/default-setup/CLAUDE.md`, `packages/abuddy-testing/CLAUDE.md`, `tests/e2e/CLAUDE.md` and `docs/public-facing/*` for `with-source.mjs`, `npm test -- …`, `sendsTo`, `repositories`, `#generated/repository`, `pack-types.d.ts`, component contract reports and the TS floor.

**Done when:** a fresh clone flow (`rm -rf packages/*/dist`, `npm run build`, `npm test -- smoke`) works without manual steps; docs describe no removed mechanism (`.npmrc` node-options, `npx playwright test`, raw `emit` in packs, `registerRepository` in packs).

## Constraints

- Commit as you go in logical chunks, with conventional messages and no Co-Authored-By or Claude-Session lines. Use `git commit -- <paths>` and check `git diff --cached` before each commit: something outside the session stages files. Never push or tag.
- Never publish externally: no `npm publish` (use `npm pack` and `--dry-run`), no real GitHub releases. CI workflows may be written, not triggered.
- Never use broad pkill/killall on Electron or node. E2E runs alongside the user's dev and prod apps in the `abuddy-test` namespace.
- Don't launch the app outside the test environment without isolating `ABUDDY_USER_DATA_DIR`.
- Never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack (edit its source; link workspace packages into its `node_modules` like its existing links). Don't edit version/release metadata.
- Investigate failing tests before changing assertions; mutation-check every new guard or test.
- Prefer libraries over hand-rolled code (es-module-lexer, vue-component-type-helpers, rollup-plugin-dts, Changesets options). No polling or hacky workarounds.
- External packs are first-class. Keep the in-repo fixture pack, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
- Verify from a checkout with no `packages/*/dist` before declaring a phase done: a built `dist` hides resolution bugs (Background S3).
- Manual API boots: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js` (after Phase 2; until then `node --conditions=@abuddy/source dist/server.js`).
