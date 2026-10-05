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
| `init [name]` | `commands/init.ts` | Writes `abuddy.json`, `package.json`, `tsconfig.json`, `.github/workflows/release.yml` (`RELEASE_WORKFLOW_TEMPLATE`), steps register/build stubs, a markdown seed format example, then runs `generate-entries`. `scaffoldUnitTestSetup()` (also used by `add feature`) writes `vitest.config.ts`, `tests/setup.ts` and devDependencies |
| `add <entity>` | `commands/add.ts` → `commands/add/*.ts` | Entities: `feature`, `step`, `artifact`, `block`, `action`, `prompt`, `flow`, `service`, `migration`. Shared helpers in `add/templates.ts` (naming, `writeIfNotExists`, `parseFlag`) and `add/manifest.ts` (manifest edits). `add feature` takes a `--designation` role (it need not be the feature name) and regenerates entries |
| `generate-entries [--force]` | `commands/generate-entries.ts` | `generatePackFiles` (`@abuddy/sdk/build`) into `src/__generated__/`. Skips when `.inputs-hash` matches **and every file it recorded writing is still there** — `{ hash, files }`, the missing-output check first, as `unitStaleReason` (`@abuddy/host/build/packages-built`) does. It recorded only the hash until 2026-10-01, so deleting one generated file left it reporting "inputs unchanged, skipping" over a tree it had not made. The list is *recorded* rather than fixed because the output set follows the manifest: a pack with no plugins never writes `fe.ts`, and a hard-coded expectation would call it stale forever. Inputs hashed: manifest, `src/`, dependency snapshots and the SDK's codegen source. Deletes generated files it no longer emits; `warnStaleDepTypes` flags `deps/<id>.d.ts` from another version |
| `fetch-deps` | `commands/fetch-deps.ts` | Resolution chain: `file:` path; else workspace (`packages/<id>` or `<id>` in the nearest directory above the pack) → the app configured for `abuddy test` → installed apps (`resolveFromMachine`); else the `.abuddy/deps` cache; else GitHub releases (registry lookup is a stub). `resolveDepFiles` is what `build` uses |
| `build [--skip-generate] [--skip-fe] [--release]` | `commands/build.ts` | See Build pipeline |
| `pack [--out <dir>]` | `commands/pack.ts` | `buildPackArchive()`: `stagePack` into `.abuddy/staged/<id>`, `verifyPack`, `createPackArchive` (all `@abuddy/host/packs`). Records `gitSource()` with credentials stripped from the remote. Refuses built-in packs |
| `release [...]`, `release publish` | `commands/release.ts` | `runRelease`: `nextReleaseVersion` → `preflight` → write version → `verify` (`build --release`, `tsc`, `npm test`, `test`) → commit → pack into `.abuddy/release` → tag → push. `publishRelease` uses Octokit. The shell `Runner` and the Octokit client can be injected (tested in `tests/commands/release.integration.spec.ts`) |
| `facade-report [--update]` | `commands/facade-report.ts` | The reviewed report of the pack's facade types (`etc/pack-types.api.md`), normalised so it moves only with the facade. Fails with a diff when the committed report is stale; `--update` rewrites it |
| `validate` | `commands/validate.ts` | `validateManifest` + `validateFeatures`; unresolved dependencies are warnings only |
| `install <source> [-d\|-b]` | `commands/install.ts` | `detectSource` → `installPackFromLocal` / `installPack`, checking the pack's `hostVersion` and build format against what `readHostInfo(userDataDir)` says the data dir's app is. Bare names go to `resolveFromRemoteRegistry`, which always throws (not implemented) |
| `uninstall <id>`, `list` | `commands/uninstall.ts`, `commands/list.ts` | Target env from `parseTargetEnv`: production by default |
| `run [--app-root <path> \| --app beta] [--instance <name> \| --fresh \| --ephemeral] [--with-keys]` | `commands/run.ts`, `src/app/` | `resolveDevelopmentApp` (may prompt and save), then build, then launch that app unless one is already on its data dir — an app this command started is one it closes. The environment follows the app: a checkout is `development`, a packaged build stamps its own channel (`appEnv`). Then `installToApp` (checked against that app's `readHostInfo`, as `install` is) and a Vite dev server (port 5199, `strictPort: false`) with `packExternalsPlugin`; writes the `pack-dev-servers` marker (`writeDevServerMarker`). `.ts` changes rebuild, reinstall and `POST /dev/reload` to that app's API (port from `apiPortFile`). Without an FE entry: `watchRebuildFallback`. **Instances** (`src/app/instances.ts`) are a data dir and nothing else — `appName` and the environment are untouched, so `--app beta` works. An instance used to be bound to the kind of app that created it, because a checkout and a packaged build kept their stores in different places inside it; one layout later a dir is a dir, and `bindingProblem` is gone. `run` threads one `AppPlace` (`{env, userDataDir}`) through every `resolveAppContext` and sets `ABUDDY_USER_DATA_DIR` plus `ABUDDY_SECRETS_VAULT=file` in the launch env, **only when an instance was named**: setting the first unconditionally would move a plain run's logs into the data dir and override the caller's own variable. Teardown registers before the build, not after the dev server, because that is when Ctrl-C actually arrives. `--with-secrets` (`src/app/instance-secrets.ts`) copies the environment's stored secrets into a **newly created** instance by carrying its data key across rather than re-encrypting, into the instance's own file vault — so `rm -rf` still removes them and the keychain gains nothing. It addresses that store through `@abuddy/host/secrets`' `dataKeyAccount`/`dataKeyFile` rather than respelling either convention, and names the credential store's service with `resolveAppContext({ env }).appName` — the accessor the app's own store reads, so no second copy of `APP_NAMES` exists to drift (it derived the name from `basename(appDataDirFor(env))` until 2026-10-01, which also assumed `platformDataDir` puts the app name last) |
| `drive [script \| --serve]` | `commands/drive.ts` | **Mainly an agent's tool**: launch the app and drive it from a script — the way a coding agent debugs and develops against what it just built, since it has no other way to see a running app. Same app and instance flags as `run`. Scaffolds `drive/` on first use (config, README, a `*` gitignore with the two tracked files negated), then `playwright test --config drive/playwright.config.ts` through `fixtureEnv` plus `PLAYWRIGHT_VISIBLE=1` (shown, so a person can watch) and `E2E_DATA_DIR` for an instance. It launches its own app rather than joining `run`'s, because Electron allows one app per data dir. The fixture takes the data dir from `E2E_DATA_DIR` rather than a `CreateTestOptions` field, because the `test` every script imports is built at module scope with no options. **`--serve`** holds the app open and answers HTTP instead of running a script, so an agent asks many questions of one warm session rather than editing and relaunching for each; the engine is `@abuddy/testing`'s (`src/engine/`), and this writes the two generated files it runs — `drive/engine.config.mts` and `drive/engine-session.mts`. Both scaffolded configs are calls to `@abuddy/testing/playwright`, so their settings follow the package instead of going stale in each pack's copy; a config that has stopped calling its helper is reported once, with the two lines that replace it (`DriveScaffold.keptStale`). **`.mts` is now a second line of defence rather than the only one**: `defineDriveConfig` ignores the session whatever `testMatch` says, where before the only thing stopping a plain `abuddy drive` from collecting the engine and hanging was that the scaffolded config's `**/*.ts` glob does not match a `.mts` file — an accident of two defaults, and unfixable while a `testIgnore` could reach only new packs (`scaffold` writes absent files only). `takeServeFlag` strips it before `parseAppFlags`, since everything left is forwarded to the Playwright CLI verbatim |
| `init-tests` | `commands/init-tests.ts` | Both halves. Playwright: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `.gitignore` entries, `@abuddy/testing` (`^cliVersion()`) + `@playwright/test`. Contract: `scaffoldUnitTestSetup()` (`vitest.config.ts`, `tests/setup.ts`, devDependencies) unless `tests/setup.ts` is already there |
| `test [--app-root <path> \| --app beta]`, `test --contract` | `commands/test.ts`, `src/app/` | Needs `playwright.config.ts`. Runs the pack's Playwright CLI with `fixtureEnv()`. Details in `packages/abuddy-testing/CLAUDE.md`. `--contract` runs the pack's vitest instead and starts no app — the checks that read compiled output, generated types and the harness; it is a no-op with a message in a pack with no vitest config, and `tests/scripts/test-external-pack-contract.sh` runs the fixtures through it |
| `open [-b]` | `commands/open.ts` | macOS `open -a` with the product name; no dev app |
| `db <command>` | `commands/db/` | The app's database, offline, through `@abuddy/host/database` (`openAppDatabase`, `findRunningApp`): `query`/`exec`/`repl` (`code.ts`, `repl.ts`: `@abuddy/sdk/database-console`'s runners, with `EARS` from the installed packs' manifests (`consoleScope`, the SDK's `consoleEars`), as the app's console builds it from its registered packs (`installedEars`)), `script` (`script.ts`: a file whose default export is called with the open database, since the published CLI's own engine copy isn't the one a script would open; TypeScript is bundled to a temp file with its packages resolved to absolute paths from the script's directory, so nothing is written where the script lives and `import.meta` still points at it), `inspect`, `export`, and `import`/`reset`/`clear-settings` (`destructive.ts`: without `--force` they list the change and open the database read-only, so a dry run works while an app runs and against files it may not write; `reset` names each stored secret it deletes by provider and label, since no backup holds them, and `--keep-keys` deletes only the data (the flag predates the store being described as secrets rather than keys)). `target.ts`: `-d`/`-b`/`--production`/`--data-dir`/`--instance` (one of them; an empty value for either of the last two is an error, and a command that writes must name its data dir). `--instance <name>` takes the name `run` and `clean` print, resolved through `listInstances` so an ephemeral one — a level down, under `.ephemeral/` — answers to its printed name, and a name matching none lists what there is. It carries no environment and needs none: once a data dir is named, `env` reaches only `resolveAppContext`, whose every path here is joined onto that dir, which is why it is exclusive with the app flags rather than combining with them, `--schema-from <path>` (a pack snapshot to name the entity types a data dir publishes none of — a read degrades and warns, since an undeclared name makes `qx` answer with the whole database, and a **write is refused**, since it makes `tx` write a row named after the type; the path is resolved whether or not it is needed, so a typo is an error rather than a flag that did nothing), `--volatile` (the run history is hydrated with the data); prints the target on stderr, refuses writes while an app runs on it, warns reads, and holds the data dir's write lock for a change (`holdDatabaseWriteLock`). A flag resolves to that app's own data dir (`appDataDirFor`, `@abuddy/sdk/env`), so `ABUDDY_USER_DATA_DIR` can't redirect a named target; with no flag the variable still applies, which is how the root `db:*` scripts and the specs read a temp data dir. `withDatabase` closes the database after a command, reporting a failed close without ever hiding what the command hit first. `lmdb` is a dependency, external in the bundle. Spec: `tests/commands/db.integration.spec.ts` |
| `instances` | `commands/instances.ts` | Every data dir on the machine, and the verbs for the instances: `new`, `rename`, `rm [--leaked]`. Two groups, listed apart because they are different things — an **environment** per `APP_ENVS` (`appDataDirFor`), which nothing here removes, and the **instances** from `listInstances`. An environment row says whether an app has it open, the version `host.json` recorded, and `(no app data)` when the dir holds only a browser profile, which is what tells a data dir from something Electron left: measured 2026-10-02, `development` held 1.5GB of profile and no app dir at all. **Sizes are opt-in** (`--sizes`): `dirBytes` over the real dirs is 674ms for production's 1.4GB and 1255ms for development's 1.5GB, so a listing whose job is names and paths does not pay ~2s of walking; `list` takes its `resolve` and `bytes` as parameters so a spec can answer for a temp tree and watch that the default walks nothing. `new <name>` **refuses** a name that exists where `openInstance` would open it — that call is for `run --instance x`, where reuse is the point. It replaced `clean --instances`, so there is one door to removing a data dir |
| `info`, `doctor`, `clean` | `commands/info.ts`, `doctor.ts`, `clean.ts` | Summary; manifest/file checks; `clean` removes `dist/`, `.abuddy/` (the dependency cache too) and `src/__generated__/`; `--apps` reclaims the AgentBuddy Beta builds `--app beta` downloaded (all but the newest, which is the one `cachedBetaApp` would reuse; `--all` takes it too, plus the staging dir a killed download leaves, which nothing else ever removes), before `findPackRoot` so it works outside a pack, and rejects an unknown flag rather than ignoring it and deleting the pack's build output instead — naming `abuddy instances` for the one it used to take. `cleanApps` takes its `CliDirs` rather than reading `cliDirs()`, so a spec checks which build survives against a temp cache rather than the machine's |

`src/app/`: `app-target.ts`. **One precedence ladder, `namedApp` — flags, `--app beta`/`ABUDDY_APP`, `ABUDDY_ROOT`, then the caller's saved choice — and three policies over it**, which differ only in what they pass as `saved` and what they do when nothing is named: `resolvePinnedApp` (`test`) passes nothing, so it cannot read machine state, and defaults to the hostVersion-pinned beta; `resolveDevelopmentApp` (`run`) owns the choice and may prompt and save it; `configuredAppPackagesDir` (`build`, via `fetch-deps`) reads that choice but never writes or prompts. **A beta comes from the download cache wherever one satisfies the range** — `cachedBetaApp`, which matches against each cached build's **own** version rather than the tag its directory is named after, since a promoted beta differs — and `ensureBetaApp` is reached only when none does. `packagedTarget` (`test`, `run`) asks the same question, which it did not until 2026-10-02: it listed releases every run and skipped only the download, so a cached build was unusable offline and CI paid an API call per run. The rule used to depend on *how* beta was asked for (named this run → fetch, remembered → cache); it no longer does, because neither `build` nor `test` is an upgrade command. Also `parseAppFlags` and the saved choice in `cliDirs()` via `env-paths`), `instances.ts` (a data dir you can throw away: `openInstance`, `mintInstance`, `listInstances`, `renameInstance`, `removeInstance`, and the name rule and refusals they share — `abuddy instances` is the command over it), `beta-app.ts` (`pickBetaRelease`, `ensureBetaApp`: download, sha256 check, cache), `playwright.ts` (`resolvePlaywrightCli`).

## Build pipeline (`commands/build.ts`)

1. `parseManifest`; `clearBuildOutput` (external: all of `dist/`; built-in: only this build's outputs, since the runtime build also writes there).
2. Unless `--skip-generate`: `resolveDeps` → `generateEntries`.
3. `featureSettingsProblems` (each `features[].settings` through `checkFeatureSettings`).
4. Dependencies' `steps.build.mjs` and manifests feed `buildPackConfigFromManifest`; its `loadDefinitions()` go into a registry of this build's own (`createPackRegistry()`, so a registry the process has bound is never touched: `tests/build/build-registry.spec.ts`), whose steps, artifacts and blocks `compilePack` compiles `boot.seed` with (pack TypeScript loaded with tsx's `tsImport`), then `bundlePackSeedCompilers` (`seedFormats[].compiler`).
5. Facade types: `bundlePackTypes` (`build/types-bundler.ts`, rollup-plugin-dts) → `dist/types/pack-types.d.ts`, then the facade gate (below). Then `bundlePackFlowHelpers` (`build/flow-helpers-bundler.ts`); the snapshot is written last, once every step succeeded.
6. `bundlePackStepBuild` (manifest `steps.build`), `bundlePackSeedRuntime` + `checkSeedRuntimeLoads`, `bundleDslDefs` (`build/dsl-defs.ts`, manifest `dsl`).
7. Built-in packs stop here: their FE goes into the renderer (`virtual:built-in-packs`) and their backend into the API bundle.
8. External packs: `bundlePackRuntime` → `dist/runtime/index.cjs`, then `bundlePackFE` (`build/fe-bundler.ts`, Vite library build) for `findFEEntry()` unless `--skip-fe`.

A failing bundle or gate is reported and the build continues, so every failure shows; the build then throws before writing the snapshot (built-in packs after step 6, external packs after step 8), so a failed build never leaves a snapshot advertising its output. The seed-compiler bundle fails the build immediately. `PACK_LAYOUT` (`@abuddy/host/packs`) names every output path.

- **`build/be-bundler.ts`**: `bundlePackSource` is the shared esbuild setup (pack tsconfig, path aliases, `package.json` `imports`, `rejectHostImportsPlugin`, which fails an import of `@abuddy/host` or of an export only the app loads (`APP_ONLY_EXPORTS`, `@abuddy/ears/lmdb`; `tests/build/host-import-guard.spec.ts`), `stubFrontendAssetsPlugin`). `HOST_EXTERNALS` = `SHARED_DEPS` + the `SHARED_INSTANCE_PACKAGES` (`@abuddy/sdk`, `@abuddy/ears`) and their subpaths (`sharedInstanceExternals()`). The seed runtime keeps only the shared-instance packages external.
- **`build/build-reads.ts`**: what the build read, per phase, into `.abuddy/reads.json` — esbuild's `metafile.inputs`, Rollup's `watchFiles` and the FE bundle's module graph, which every bundler computed and discarded. A `RecordReads` per bundle, so a bundler reports what it read without knowing which phase it is and the phase is named where it is known (`commands/build.ts`); `BUILD_PHASES` is the list and `BuildPhase` is derived from it. Keyed by phase so a phase that didn't run is absent rather than empty, written with the snapshot so a failed build records nothing, and `ABUDDY_NO_BUILD_READS=1` turns it off. It is read by the repo's chain checks (`scripts/lib/build-reads.ts`, `repo-checks`' `dep-files.integration.spec.ts`), never by the build.
- **`build/seed-runtime-check.ts`**: loads `dist/build/seed-runtime.mjs` in a fresh Node process with the SDK's optional peers blocked by a resolve hook, as a dependent's harness would load it.
- **`build/fe-bundler.ts`**: `packExternalsPlugin` rewrites host-shared imports (`getSharedFeDeps`, `getSdkFeModules`, and every `@abuddy/ui` export from `getUiFeModules` unless `fe.bundleUi`) into `generateGlobalProxy` modules that read `window.__abuddy[globalKey]`. It fails the build when an inlined SDK module reaches the SDK's host bindings (`runtime/host-runtime`, `runtime/fe-host`: an inlined copy has no app bound) and rejects `@abuddy/host`. Tailwind: the pack's `tailwind.config.{ts,js}` or a generated one over `src/**`, plus `@abuddy/ui`'s files with `fe.bundleUi`; `tailwindInjectPlugin` prepends `@tailwind utilities` to the entry.

## Facade gate

`facadeProblems(packDir, bundleFile)` in `build/facade-gate.ts` checks `dist/types/pack-types.d.ts` before it goes into the snapshot's `defs`. Dependents compile it with `skipLibCheck`, where these problems would silently become `any`:

- the bundle type-checks on its own (the pack's tsconfig, `skipLibCheck: false`, and no `customConditions`: a pack compiles against the packages' published `dist`); only diagnostics inside the bundle count;
- no relative or absolute imports;
- imports only `@abuddy/*`, `@abuddy/sdk`'s `peerDependencies` (as the pack resolves the SDK) and Node built-ins;
- no `@abuddy/*` import that installed dependents can't resolve: a `private` package (`@abuddy/host`) or an export only under `@abuddy/source` (`unpublishedReason`);
- every import resolves to declarations.

Each problem names the facade exports that reach it (`exportsReaching`). Specs: `tests/build/facade-gate.integration.spec.ts`, `facade-gate-system-contract.integration.spec.ts` (the contract's events reach the facade however the entry is declared), `facade-typing.integration.spec.ts`, `types-bundler-determinism.integration.spec.ts`.

The committed report is separate: `abuddy facade-report [--update]` (`commands/facade-report.ts`), which `packages/default-setup`'s `facade:check` / `facade:update` scripts invoke. It normalizes the built bundle (sorted imports, declarations in name order, literal unions sorted via `build/declaration-text.ts`, the pack's path shortened) and compares it with `etc/pack-types.api.md`. Run `abuddy build` first; a changed facade needs `facade:update`. It was a repo script until 2026-09-28, which is why the normalisation it shares with the bundler had spent a spell in `@abuddy/host`: a repo script and a package's `src/` cannot reach each other, so the util moved when the thing in the wrong place should have.

## Source vs dist mode (`bin/abuddy.mjs`)

1. **Hand-off.** `projectCli()` resolves `@abuddy/cli` from the cwd. If that is a different install (by realpath), the bin imports that project's `bin/abuddy.mjs`, so a global, Homebrew or app-bundled `abuddy` runs the version the pack pins (`tests/commands/handoff.spec.ts`).
2. **tsx** is registered either way (`tsx/esm/api`): packs' TypeScript is loaded at build time.
3. **Dist mode**: `../dist/cli.js` exists, which is true only in the published layout (`dist/package/bin` next to `dist/package/dist/cli.js`). The bundle is imported.
4. **Source mode** (a checkout, where `packages/abuddy-cli/dist/cli.js` never exists): `module.register` installs `bin/source-hooks.mjs` with the checkout root. For `@abuddy/*` specifiers the hook retries with the `@abuddy/source` condition and keeps the result only when it lands in the checkout outside `node_modules`. Packs linked to the checkout get workspace source; installed copies keep their `dist`. `assertSourceResolution` (`@abuddy/host/build/source-resolution`) then fails if the checkout's SDK/UI would still resolve to `dist`. Then `../src/index.ts` is imported.

The hooks apply only to this process, and only to the CLI's own code: a pack is compiled and run against the packages' `dist` either way. Child processes the CLI starts for pack code get the condition stripped, not added (`fixtureEnv` for the Playwright runner, `checkSeedRuntimeLoads`, the fixture's `launchEnv` for the app), so an `abuddy` invoked from a repo command doesn't leak it into them. The CLI's own `tsconfig.json` and `vitest.config.ts` set the condition, as every host config does. `bin/app-launcher.sh` runs `Resources/app/packages/abuddy-cli/dist/package/bin/abuddy.mjs` with `ELECTRON_RUN_AS_NODE=1` (`tests/commands/app-launcher.spec.ts`).

## Bundling (`scripts/bundle-package.ts`)

`npm run build:package -w @abuddy/cli` (part of `npm run packages:build`) writes `dist/package/`:

- esbuild bundles the `cli` entry (`src/index.ts`, ESM, node22, code splitting) with the shared-instance packages (`@abuddy/sdk`, `@abuddy/ears`) and the private `@abuddy/host` **inlined from source**; `@abuddy/testing/harness` keeps them external as peers. Every other package stays external and becomes a dependency at the workspace range. A `require` banner lets bundled CommonJS work.
- `bin/abuddy.mjs` is copied. The generated `package.json` pins each shared-instance package the CLI declares as a dependency to its workspace version (`@abuddy/sdk`; `@abuddy/ears` isn't declared, so it's only inlined) and drops `@abuddy/host`. A package with entries that keep the shared-instance packages external (`@abuddy/testing/harness`) declares them as peers at `^version` instead.
- No declarations (`attw` skips the CLI in `packages:check`; `publint` checks `dist/package`). `scripts/publish-packages.ts` publishes from `dist/package`.

Because host code is inlined, `@abuddy/host` imports are fine in `src/`. The CLI's scaffold templates (`src/commands/add`, `src/commands/init.ts`) are pack code and must not use it: `npm run check:specifiers` enforces that.

## Tests

Two suites, split by what a spec costs:

- **`npm test -w @abuddy/cli`** — the fast half (`tests/**/*.spec.ts`, `vitest.config.ts`): 38 specs and
  about 13.5s of file time, a couple of seconds of wall. The per-change loop.
- **`npm run test:integration -w @abuddy/cli`** — the expensive half (`tests/**/*.integration.spec.ts`,
  `vitest.integration.config.ts`, which caps worker threads because many of these specs spawn compilers of
  their own): 15 specs, about 157s of file time.

**Specs about the repo's own tooling are not here.** Fifteen of them were, and none was about the CLI: they
moved to `@app/repo-checks`, which is where a spec that reads `scripts/` belongs and where `npm run spec`
can reach one from a change to what it checks. `repo-check-boundary.spec.ts` there keeps them from coming
back.

**Which half a spec is in is a decision, declared by its filename**, and nothing re-derives it. What the
integration half buys is a 60s per-test budget instead of 15s, a worker pool capped at half the cores, and
separation from the per-change loop — so what belongs there is a spec that needs one of those, which in this
package means the ones that spawn compilers.

It was decided by measured cost against fixed edges until 2026-10-05: a recorded millisecond per spec, a
window of readings, a band of 2.5s up and 1.5s back, two idle floors and a machine identity, with
`spec-cost:update` to maintain it. All of it is gone, and the reason is that the quantity was never one
number — a spec in this package read 2.8s in the fast pool and 0.64s in the integration pool, 4.37x apart
against a band of 2.5x, so each half's reading demanded a move the other took back. Root `CLAUDE.md`'s
sample section has what the apparatus cost and what to read before adding another.

Slowness is visible rather than adjudicated: vitest prints any test over its 300ms threshold under its
file, the chain prints each step's five slowest tests, and the pool that runs this suite ranks its five
slowest *files* per half. If this package's fast half stops being worth running in a loop, that is what
shows it. A spec that is slow for a reason says so in its header (`// @slow: <reason>`), and the pool fails
the step if that stops being true — which is safe to gate on because load can only inflate a duration.

The `*.integration.spec.ts` suffix is orthogonal to the folders below, which group by area. It is a
decision rather than a mechanism, so renaming a spec is how it changes half.

The root `test:unit` runs the fast half last, being the slowest of the unit suites; CI and the pre-merge
chain run both halves (`.github/workflows/ci.yml`), after `packages:build`. The `published-*` specs read what `packages:build` wrote, so the suite's `pretest` (`scripts/ensure-packages-built.ts`, the command over `@abuddy/host/build/packages-built`) runs that build itself when anything it read has changed, and skips it otherwise. Freshness is a success stamp, not a timestamp: each build unit records a content fingerprint of its inputs (its own sources, `@abuddy/host`, the bundler script, the manifests and tsconfigs) under `node_modules/.cache/abuddy-packages-build/`, written only when the build returns, so an interrupted or failed build reads as not built rather than as fresh. A run that bypasses `pretest` (`npx vitest` directly) still refuses to test stale output, naming the workspace and why.

- `tests/build/`: bundlers and gates (`facade-*`, `seed-runtime-*`, `dsl-defs`, `fe-bundler-*`, `host-import-guard`, `clear-build-output`, `feature-settings`, `step-collisions`, `build-registry`), how a pack's own paths are read and the checks on what a build produces here (`package-freshness`, `checkout-packages`, `verify-node-modules`). The specs whose subject is the *published* packages are `@app/publish-checks`; `@abuddy/ui`'s own exports map and import side effects are its own suite's.
- `tests/commands/`: commands run end to end or through their exports: scaffold, `add`, pack, release, install `hostVersion`, a scaffolded pack installed and loaded by the host pack loader (`init-install-load`), dev install, hand-off, source hooks, app launcher,
  and what the shell may still decide about a pinned run (`fixture-env-reach`: the variables the Playwright fixture reads, derived
  from its own module graph, each one either decided by `fixtureEnv` or allow-listed with its reason).
- `tests/app/`: app target resolution, beta download (`ensureBetaApp`: macOS arm64 only), Playwright resolution, app version.
- `tests/harness/`: `@abuddy/testing/harness` from a scaffolded pack (`harness-setup`) and a dependent pack running default-setup's runtime (`dependency-runtime`, skipped until default-setup is built).
- `tests/packs/host-output.spec.ts`: `publishHostPackOutput` and dependency resolution from an installed app.

A spec's path under `tests/` mirrors the source it covers, as it does in every package
([`test-inventory.md`](../../docs/reference/test-inventory.md)); `commands/`, `build/` and `app/` are
`src/`'s own folders. `harness/` and `packs/` are the two that name a *dependency's* module instead —
`@abuddy/testing`'s harness and `@abuddy/host/packs` — which this package holds because it is where a
pack's whole toolchain is driven from, and `repo-checks/tests/spec-placement.spec.ts` records both with
that reason. `_support/` is the prefix that says a directory claims to mirror nothing.
- The packing fixture moved to `@app/publish-checks` and is imported from here as that package: `facade-typing`, `fe-bundler-host-registry`, `types-bundler-determinism` and `package-freshness` use it to build a consumer, which is the fixture rather than the subject. `tests/_support/pack-builds.ts` stays.

### How a pack's own module paths are resolved

**One mechanism: `#` subpath imports from the pack's own `package.json`.** A pack's
`compilerOptions.paths` is TypeScript's business and no build here reads it — `tsconfig-aliases.ts` and
`makeAliasPlugin` were deleted with the `@/` aliases they served
([`goal-one-way-to-name-your-own-modules.md`](../../docs/archive/goals/goal-one-way-to-name-your-own-modules.md)),
because four separate bundler configs each had to re-implement a mapping no runtime reads. What follows is
what the audit of 2026-09-26 cost to establish, so it needn't be established again.

- **Nothing here resolves a pack's `#` imports any more.** A specifier names the file that is there
  ([`goal-pack-imports-name-the-file.md`](../../docs/archive/goals/goal-pack-imports-name-the-file.md)), and
  esbuild and Vite both resolve the pack's mapping themselves once it does — measured by deleting the two
  plugins that used to supply the suffix and rebuilding: `abuddy build` over both fixture packs and
  default-setup green, and the API's tsup build byte for byte the same. What supplying the extension cost to
  establish is recorded in that goal's Outcome; what is left is `@abuddy/host/build/subpath-imports`, which
  reads `package.json` `imports` for the check below and resolves nothing.
- **`pack-resolution.ts`** asks where the pack's own compiler resolves the `@abuddy` packages, and refuses a
  pack that lands on a checkout's `src/`. It resolves rather than reading config (`ts.resolveModuleName` against
  the pack's own parsed options), because the routes to source are several — `customConditions`, an `extends`
  chain, a `paths` entry — and the message can then name the file it landed on. What makes it worth a rule:
  esbuild has no notion of `customConditions` (the string is absent from its binary) and the FE bundler names
  Vite's conditions outright, so a pack that enables it typechecks against source while shipping bundles built
  from `dist` — green locally, and wrong after publishing. `assertSourceResolution`
  (`@abuddy/host/build/source-resolution`) is the same question with the opposite expectation, asked of a host
  process; it lives in host and this cannot, because this needs `typescript` and `packages/api` imports host.
- **`own-module-specifiers-gate.ts`** refuses a specifier that names no file — extensionless, or the `.js` a
  pack never emits — through `@abuddy/host/build/own-module-specifiers`, the same rule
  `scripts/check-import-specifiers.ts` applies to the packs in this checkout. The rule is shared; the reading
  is not, because each caller already parses a pack's sources for other rules.
- **`pack-sources.ts` is that reading, once**: the files, an SFC's `<script>` blocks, and every specifier in
  them, from a syntax tree. `pack-rules.ts` reads every pack rule off it, and so does the repo's own script. A regex over the text was tried and is
  the reason this is a parser: a regex literal holding an unbalanced quote made a commented-out import look
  real and failed a build naming a comment, and three module-path forms (`vi.mock`, `require.resolve`,
  `import x = require(…)`) went unread.
- **The FE bundler reads neither `imports` nor supplies extensions, on purpose**: Vite resolves them
  natively. The evidence is `tests/packs/external-pack`, whose `features/memos/fe/state.ts` value-imports
  `#generated/events.ts` and whose FE bundle and Playwright suite pass.
- **A conditional target keeps the pack's own key order**, taking the first of `node`, `import`, `require`,
  `default` — Node's rule, not an imposed preference. `abuddy init` writes `"type": "module"`, so `import` is
  the condition a pack's entries are likeliest to carry. A *pattern* is matched the other way round, longest
  first, which is also Node's rule: key order named the wrong file for a pack declaring both `#gen/*` and
  `#gen/deep/*`.

An unreadable `package.json` is reported rather than passed over in silence, because the failure that
follows — "can't resolve `#generated/…`" — names neither the file nor the cause.

End-to-end coverage outside this package: `npm run test:external-pack` (`tests/packs`) and `npm run test:packaged-authoring` (packed tarballs, outside the monorepo).
