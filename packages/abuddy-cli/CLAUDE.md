# @abuddy/cli

The `abuddy` pack CLI: scaffold, generate, build, test, pack, release and install packs. Built-in packs (`packages/default-setup`, `npm run compile`) and external packs go through the same commands. User-facing reference: `docs/public-facing/cli.md` (flags, build output layout, dependency sources). This file is the contributor map. Paths below are relative to `packages/abuddy-cli`.

## Layout

```
bin/abuddy.mjs         entry: project hand-off, then source or dist mode
bin/source-hooks.mjs   Node resolve hooks for source mode
bin/app-launcher.sh    `abuddy` inside the packaged app (runs the bundle on Electron as Node)
src/index.ts           USAGE text + COMMANDS table (lazy import per command)
src/utils.ts           findPackRoot, readManifest, parseTargetEnv (-d/-b), sdkVersion, cliBin, cliVersion
src/commands/          one module per command; add/ holds one module per `abuddy add` entity
src/build/             bundlers and build-time gates used by `build` and `dev`
src/app/               which AgentBuddy `abuddy test` (and dependency resolution) runs against
tests/                 vitest specs (see Tests)
```

A command module exports `async (args: string[]) => void`; `src/index.ts` maps the name to it and prints `err.message` with exit code 1 on a throw. Add a command by adding the module, a `COMMANDS` entry and a `USAGE` line.

## Commands

| Command | Source | Notes |
|---|---|---|
| `init [name]` | `commands/init.ts` | Writes `abuddy.json`, `package.json`, `tsconfig.json`, `.github/workflows/release.yml` (`RELEASE_WORKFLOW_TEMPLATE`), steps register/build stubs, a markdown seed format example, then runs `generate` + `generate-entries`. `scaffoldUnitTestSetup()` (also used by `add feature`) writes `vitest.config.ts`, `tests/setup.ts` and devDependencies |
| `add <entity>` | `commands/add.ts` → `commands/add/*.ts` | Entities: `feature`, `step`, `artifact`, `block`, `action`, `prompt`, `flow`, `service`, `migration`. Shared helpers in `add/templates.ts` (naming, `writeIfNotExists`, `parseFlag`) and `add/manifest.ts` (manifest edits). `add feature` rejects a `--designation` other than the feature name and regenerates entries |
| `generate` | `commands/generate.ts` | Resolves dependency snapshots (`resolveDeps`, fails on any unresolved one) and writes `.abuddy/generated/types.ts` with `emitDepTypes` |
| `generate-entries [--force]` | `commands/generate-entries.ts` | `generatePackFiles` (`@abuddy/sdk/build`) into `src/__generated__/`. Skips when `.inputs-hash` matches (manifest, `src/`, dependency snapshots and the SDK's codegen source). Deletes generated files it no longer emits; `warnStaleDepTypes` flags `deps/<id>.d.ts` from another version |
| `fetch-deps` | `commands/fetch-deps.ts` | Resolution chain: `file:` path; else workspace (`packages/<id>` or `<id>` in the nearest directory above the pack) → the app configured for `abuddy test` → installed apps (`resolveFromMachine`); else the `.abuddy/deps` cache; else GitHub releases (registry lookup is a stub). `resolveDepArtifacts` is what `build` uses |
| `build [--skip-generate] [--skip-fe] [--release]` | `commands/build.ts` | See Build pipeline |
| `pack [--out <dir>]` | `commands/pack.ts` | `packBundle()`: `stageBundle` into `.abuddy/bundle/<id>`, `verifyBundle`, `createBundleArchive` (all `@abuddy/host/packs`). Records `gitSource()` with credentials stripped from the remote. Refuses built-in packs |
| `release [...]`, `release publish` | `commands/release.ts` | `runRelease`: `nextReleaseVersion` → `preflight` → write version → `verify` (`build --release`, `tsc`, `npm test`, `test`) → commit → pack into `.abuddy/release` → tag → push. `publishRelease` uses Octokit. The shell `Runner` and the Octokit client can be injected (tested in `tests/cli/release.spec.ts`) |
| `validate` | `commands/validate.ts` | `validateManifest` + `validateFeatures`; unresolved dependencies are warnings only |
| `install <source> [-d\|-b]` | `commands/install.ts` | `detectSource` → `installPackFromLocal` / `installPack`, checking `hostVersion` from `readHostVersion(userDataDir)`. Bare names go to `resolveFromRegistry`, which always throws (not implemented) |
| `uninstall <id>`, `list` | `commands/uninstall.ts`, `commands/list.ts` | Target env from `parseTargetEnv`: production by default |
| `dev` | `commands/dev.ts` | Build + `installToDev`, then a Vite dev server (port 5199, `strictPort: false`) with `packExternalsPlugin`; writes the `pack-dev-servers` marker (`writeDevServerMarker`). `.ts` changes rebuild, reinstall and `POST /dev/reload` to the dev API (port from `apiPortFile`). Without an FE entry: `watchRebuildFallback` |
| `init-tests` | `commands/init-tests.ts` | `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `.gitignore` entries, `@abuddy/testing` (`^cliVersion()`) + `@playwright/test` |
| `test [--app-root <path> \| --app beta]` | `commands/test.ts`, `src/app/` | Needs `playwright.config.ts`. Runs the pack's Playwright CLI with `fixtureEnv()`. Details in `packages/abuddy-testing/CLAUDE.md` |
| `open [-b]` | `commands/open.ts` | macOS `open -a` with the product name; no dev app |
| `db <command>` | `commands/db/` | The app's database, offline, through `@abuddy/host/database` (`openAppDatabase`, `findRunningApp`): `query`/`exec`/`repl` (`code.ts`, `repl.ts`: `@abuddy/sdk/database-console`'s runners, with `EARS` from the installed packs, `consoleScope`), `inspect`, `export`, and `import`/`reset`/`clear-settings` (`destructive.ts`: without `--force` they list the change and open the database read-only, so a dry run works while an app runs and against files it may not write). `target.ts`: `-d`/`-b`/`--production`/`--data-dir` (one of them; an empty `--data-dir` is an error, and a command that writes must name its data dir), prints the target on stderr, refuses writes while an app runs on it, warns reads, and holds the data dir's write lock for a change (`holdDatabaseWriteLock`). `withDatabase` closes the database after a command, reporting a failed close without ever hiding what the command hit first. `lmdb` is a dependency, external in the bundle. Spec: `tests/cli/db.spec.ts` |
| `info`, `doctor`, `clean` | `commands/info.ts`, `doctor.ts`, `clean.ts` | Summary; manifest/file checks; `clean` removes `dist/`, `.abuddy/` (the dependency cache too) and `src/__generated__/` |

`src/app/`: `app-target.ts` (`resolveTestApp`, `parseTestAppFlags`, saved choice in `cliDirs()` via `env-paths`, `configuredAppPackagesDir` for dependency resolution), `beta-app.ts` (`pickBetaRelease`, `ensureBetaApp`: download, sha256 check, cache), `playwright.ts` (`resolvePlaywrightCli`, `testingFromSource`).

## Build pipeline (`commands/build.ts`)

1. `parseManifest`; `clearBuildOutput` (external: all of `dist/`; built-in: only this build's outputs, since the runtime build also writes there).
2. Unless `--skip-generate`: `resolveDeps` → `generate` → `generateEntries`.
3. `featureSettingsProblems` (each `features[].settings` through `checkFeatureSettings`).
4. Dependencies' `steps.build.mjs` and manifests feed `buildPackConfigFromManifest`; its `loadDefinitions()` go into a registry of this build's own (`createPackRegistry()`, so a registry the process has bound is never touched: `tests/build/build-registry.spec.ts`), whose steps, artifacts and blocks `compilePack` compiles `boot.seed` with (pack TypeScript loaded with tsx's `tsImport`), then `bundlePackSeedCompilers` (`seedFormats[].compiler`).
5. Facade types: `bundlePackTypes` (`build/types-bundler.ts`, rollup-plugin-dts) → `dist/types/pack-types.d.ts`, then the facade gate (below). Then `bundlePackFlowHelpers` (`build/flow-helpers-bundler.ts`); the snapshot is written last, once every step succeeded.
6. `bundlePackStepBuild` (manifest `steps.build`), `bundlePackSeedRuntime` + `checkSeedRuntimeLoads`, `bundleDslDefs` (`build/dsl-defs.ts`, manifest `dsl`).
7. Built-in packs stop here: their FE goes into the renderer (`virtual:built-in-packs`) and their backend into the API bundle.
8. External packs: `bundlePackRuntime` → `dist/runtime/index.cjs`, then `bundlePackFE` (`build/fe-bundler.ts`, Vite library build) for `findFEEntry()` unless `--skip-fe`.

A failing bundle or gate is reported and the build continues, so every failure shows; the build then throws before writing the snapshot (built-in packs after step 6, external packs after step 8), so a failed build never leaves a snapshot advertising its output. The seed-compiler bundle fails the build immediately. `BUNDLE_PATHS` (`@abuddy/host/packs`) names every output path.

- **`build/be-bundler.ts`**: `buildPackBundle` is the shared esbuild setup (pack tsconfig, path aliases, `package.json` `imports`, `rejectHostImportsPlugin`, which fails an import of `@abuddy/host` or of an export only the app loads (`APP_ONLY_EXPORTS`, `@abuddy/ears/lmdb`; `tests/build/host-import-guard.spec.ts`), `stubFrontendAssetsPlugin`). `HOST_EXTERNALS` = `SHARED_DEPS` + the `SHARED_INSTANCE_PACKAGES` (`@abuddy/sdk`, `@abuddy/ears`) and their subpaths (`sharedInstanceExternals()`). The seed runtime keeps only the shared-instance packages external.
- **`build/seed-runtime-check.ts`**: loads `dist/build/seed-runtime.mjs` in a fresh Node process with the SDK's optional peers blocked by a resolve hook, as a dependent's harness would load it.
- **`build/fe-bundler.ts`**: `packExternalsPlugin` rewrites host-shared imports (`getSharedFeDeps`, `getSdkFeModules`, and every `@abuddy/ui` export from `getUiFeModules` unless `fe.bundleUi`) into `generateGlobalProxy` modules that read `window.__abuddy[globalKey]`. It fails the build when an inlined SDK module reaches the SDK's host bindings (`runtime/host-runtime`, `runtime/fe-host`: an inlined copy has no app bound) and rejects `@abuddy/host`. Tailwind: the pack's `tailwind.config.{ts,js}` or a generated one over `src/**`, plus `@abuddy/ui`'s files with `fe.bundleUi`; `tailwindInjectPlugin` prepends `@tailwind utilities` to the entry.

## Facade gate

`facadeProblems(packDir, bundleFile)` in `build/facade-gate.ts` checks `dist/types/pack-types.d.ts` before it goes into the snapshot's `defs`. Dependents compile it with `skipLibCheck`, where these problems would silently become `any`:

- the bundle type-checks on its own (the pack's tsconfig, `skipLibCheck: false`, `customConditions` from `sourceConditions(packDir)`); only diagnostics inside the bundle count;
- no relative or absolute imports;
- imports only `@abuddy/*`, `@abuddy/sdk`'s `peerDependencies` (as the pack resolves the SDK) and Node built-ins;
- no `@abuddy/*` import that installed dependents can't resolve: a `private` package (`@abuddy/host`) or an export only under `@abuddy/source` (`unpublishedReason`);
- every import resolves to declarations.

Each problem names the facade exports that reach it (`exportsReaching`). Specs: `tests/build/facade-gate.spec.ts`, `facade-gate-system-entry.spec.ts` (an annotated `SystemEntry` fails the gate, `satisfies` passes), `facade-typing.spec.ts`, `types-bundler-determinism.spec.ts`.

The committed report is separate: `npm run facade:check` / `facade:update` in `packages/default-setup` run `scripts/facade-report.ts`. It normalizes the built bundle (sorted imports, declarations and literal unions) and compares it with `etc/pack-types.api.md`. Run `abuddy build` first; a changed facade needs `facade:update`.

## Source vs dist mode (`bin/abuddy.mjs`)

1. **Hand-off.** `projectCli()` resolves `@abuddy/cli` from the cwd. If that is a different install (by realpath), the bin imports that project's `bin/abuddy.mjs`, so a global, Homebrew or app-bundled `abuddy` runs the version the pack pins (`tests/cli/handoff.spec.ts`).
2. **tsx** is registered either way (`tsx/esm/api`): packs' TypeScript is loaded at build time.
3. **Dist mode**: `../dist/cli.js` exists, which is true only in the published layout (`dist/package/bin` next to `dist/package/dist/cli.js`). The bundle is imported.
4. **Source mode** (a checkout, where `packages/abuddy-cli/dist/cli.js` never exists): `module.register` installs `bin/source-hooks.mjs` with the checkout root. For `@abuddy/*` specifiers the hook retries with the `@abuddy/source` condition and keeps the result only when it lands in the checkout outside `node_modules`. Packs linked to the checkout get workspace source; installed copies keep their `dist`. `assertSourceResolution` (`@abuddy/host/build/source-resolution`) then fails if the checkout's SDK/UI would still resolve to `dist`. Then `../src/index.ts` is imported.

The hooks apply only to this process. Child processes that load workspace source pass the condition themselves: `fixtureEnv` adds `--conditions=@abuddy/source` to `NODE_OPTIONS` when `testingFromSource(packDir)`. `tsconfig.json` and `vitest.config.ts` set the condition for type checks and tests. `bin/app-launcher.sh` runs `Resources/app/packages/abuddy-cli/dist/package/bin/abuddy.mjs` with `ELECTRON_RUN_AS_NODE=1` (`tests/cli/app-launcher.spec.ts`).

## Bundling (`scripts/bundle-package.ts`)

`npm run build:package -w @abuddy/cli` (part of `npm run packages:build`) writes `dist/package/`:

- esbuild bundles the `cli` entry (`src/index.ts`, ESM, node22, code splitting) with the shared-instance packages (`@abuddy/sdk`, `@abuddy/ears`) and the private `@abuddy/host` **inlined from source**; `@abuddy/testing/harness` keeps them external as peers. Every other package stays external and becomes a dependency at the workspace range. A `require` banner lets bundled CommonJS work.
- `bin/abuddy.mjs` is copied. The generated `package.json` pins each shared-instance package the CLI declares as a dependency to its workspace version (`@abuddy/sdk`; `@abuddy/ears` isn't declared, so it's only inlined) and drops `@abuddy/host`. A package with entries that keep the shared-instance packages external (`@abuddy/testing/harness`) declares them as peers at `^version` instead.
- No declarations (`attw` skips the CLI in `packages:check`; `publint` checks `dist/package`). `scripts/publish-packages.ts` publishes from `dist/package`.

Because host code is inlined, `@abuddy/host` imports are fine in `src/`. The CLI's scaffold templates (`src/commands/add`, `src/commands/init.ts`) are pack code and must not use it: `npm run check:specifiers` enforces that.

## Tests

`npm test -w @abuddy/cli` (vitest, `tests/**/*.spec.ts`). It is not part of the root `test:unit`; CI runs it after `packages:build` (`.github/workflows/ci.yml`).

- `tests/build/`: bundlers and gates (`facade-*`, `seed-runtime-*`, `dsl-defs`, `fe-bundler-*`, `host-import-guard`, `clear-build-output`, `feature-settings`, `step-collisions`, `build-registry`) and published-package checks (`published-*`, `ui-exports`, `ui-import-side-effects`, `import-specifiers`, `with-source`, `verify-node-modules`, `testing-source-entry`).
- `tests/cli/`: commands run end to end or through their exports: scaffold, `add`, pack, release, install `hostVersion`, a scaffolded pack installed and loaded by the host pack loader (`init-install-load`), dev install, hand-off, source hooks, app launcher.
- `tests/app/`: app target resolution, beta download (`ensureBetaApp`: macOS arm64 only), Playwright resolution, app version.
- `tests/harness/`: `@abuddy/testing/harness` from a scaffolded pack (`harness-setup`) and a dependent pack running default-setup's runtime (`dependency-runtime`, skipped until default-setup is built).
- `tests/packs/host-artifacts.spec.ts`: `publishHostPackArtifacts` and dependency resolution from an installed app.
- `tests/helpers/published-packages.ts`: `PACKAGES_BUILT`, `installPublishedPackages()` (npm-packs `@abuddy/ears`, the SDK and UI into a temp `node_modules`), `compileConsumer()` over `CONSUMER_MATRIX` (current TypeScript and the 5.7 floor from `packages/typescript-floor`, × `node16`/`bundler`). The `published-*` specs skip without `dist/`, but throw in CI or when `dist` is older than `src`: run `npm run packages:build`.

End-to-end coverage outside this package: `npm run test:external-pack` (`tests/fixtures`) and `npm run test:packaged-authoring` (packed tarballs, outside the monorepo).
