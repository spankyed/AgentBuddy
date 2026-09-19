# Getting Started

A **pack** is a self-contained extension for AgentBuddy. It can contribute backend systems, frontend plugins, flow steps, seeds (actions, prompts, flows), artifact viewers, message blocks, services, and data migrations. Packs are declared via an `abuddy.json` manifest and compiled into a distributable bundle.

## Prerequisites

- Node.js >= 22
- AgentBuddy installed
- The `abuddy` CLI, from any of:
  - the app: **AgentBuddy → Install 'abuddy' command in PATH** (macOS; AgentBuddy Beta installs `abuddy-beta`)
  - npm: `npm i -g @abuddy/cli`
  - Homebrew: the formula in `build/homebrew/abuddy.rb`

Whichever `abuddy` you run, inside a pack it hands off to the `@abuddy/cli` version the pack pins in its `devDependencies`, so every pack builds with the CLI it was written against.

## Packages

| Package | What it is |
|---|---|
| `@abuddy/sdk` | Pack-facing API and types (`@abuddy/sdk/fe`, `/steps`, `/events`, …). A dependency of every pack. Libraries shared with the host (vue, xstate, zod) and the AI SDK (`ai` 7, whose types `services.inference` uses) are peer dependencies, and so is TypeScript (5.7 or later). |
| `@abuddy/ears` | The EARS data engine: what the generated `#generated/ears` and `#generated/repository` build on, and the untyped API packs import directly (`untypedQx`, `tx`, `findRelations`, graph and blueprint helpers, `RepositoryError`; `createEarsEngine` for tests and tooling). The app shares one instance with every pack, as it does `@abuddy/sdk`. A dependency of every pack. |
| `@abuddy/ui` | Vue components, tiptap and Monaco editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`). Add it when your pack's UI uses them; it brings the editor libraries, so backend-only packs leave it out. Packs use the app's copy at runtime (see `fe.bundleUi` in the manifest docs). |
| `@abuddy/cli` | The `abuddy` command and build toolchain. A devDependency of every pack. |
| `@abuddy/testing` | Pack tests: `@abuddy/testing/harness` runs a pack's seeds, systems, services and flows in unit tests without the app, `@abuddy/testing/vitest` configures Vitest for it (`isolatedDataDir`), and `@abuddy/testing` is the Playwright fixture for E2E tests in the app (`@playwright/test` is a peer). |

The five are released together with the same version.

## Create a pack

```bash
abuddy init my-pack
cd my-pack
npm install
abuddy add feature notes --label Notes
abuddy build
```

`abuddy init` creates no feature; `abuddy add feature` adds one (a feature id is a lowercase letter followed by letters and digits, like `notes` or `calendarEvents`). This scaffolds:

```
my-pack/
  abuddy.json              # Pack manifest — the single source of truth
  package.json             # depends on @abuddy/sdk and @abuddy/ears, pins @abuddy/cli and @abuddy/testing
  tsconfig.json
  vitest.config.ts         # unit tests: an isolated data dir per run, the harness setup
  .gitignore
  .github/workflows/
    release.yml            # Publishes a GitHub release when `abuddy release` pushes a tag
  src/
    env.d.ts
    features/
      notes/                # added by `abuddy add feature notes`: settings.ts, be/, fe/
    extensions/
      steps/
        register.ts         # Step registration barrel
        build.ts            # Build-only step facets, shipped to packs that depend on yours
    seeds/
      actions/
      flows/
      examples/             # markdown rows of the pack's entity type (the `examples` seed format)
    __generated__/          # Auto-generated from manifest — never edit
  .abuddy/
    generated/              # EARS types from deps
    deps/                   # Cached dependency snapshots and step build code
  tests/
    setup.ts                # starts the unit test harness
    unit/
      my-pack.spec.ts       # seeds the examples entry and reads the rows back
      notes-system.spec.ts  # added with the feature: its system under the app's bus
```

The scaffold has no dependencies, so it builds as generated. To use another pack's entity types or flow steps (for example `keepAlive` from the built-in `default-setup` pack), add it to `dependencies` in `abuddy.json`. `abuddy build` resolves each dependency from a `file:` path, the workspace, the app you configured for `abuddy test` (a checkout or the downloaded beta; `ABUDDY_APP=beta` in CI), an installed AgentBuddy app, the `.abuddy/deps` cache, or a GitHub release, in that order. The resolved version must satisfy the range you declare, and your flows are validated with the dependency's real step code. The scaffolded release workflow runs on macOS with `ABUDDY_APP=beta`, so built-in dependencies resolve in CI.

## The dev loop

```bash
abuddy dev
```

Run it alongside the dev app (`npm start` in an AgentBuddy checkout). It builds, installs the pack into the development data dir and starts a Vite dev server: frontend changes hot-reload through Vite HMR, `abuddy.json` changes regenerate `src/__generated__/`, and backend `.ts` changes rebuild, reinstall and reload the pack's backend in the running app.

The build pipeline (`abuddy build`):

1. Validates `abuddy.json` and clears `dist/`
2. `abuddy generate` and `abuddy generate-entries` — resolve dependencies, write their EARS types and generate `src/__generated__/`
3. Checks each feature's settings file sets only its own plugin's settings
4. Resolves dependencies, warning when the generated dependency types are from a different version
5. Seed compilation — compiles `boot.seed` from `src/seeds/` to `dist/runtime/seeds/`, validating flows with the dependencies' step code
6. Facade types — bundles `dist/types/pack-types.d.ts`, the types packs that depend on yours import, and fails unless it type-checks on its own and imports only `@abuddy/*` packages, `@abuddy/sdk`'s peers and Node built-ins
7. Snapshot — writes `dist/types/snapshot.json` (types, facade types, flow helpers, manifest) for downstream packs
8. Build code for dependents — `dist/build/steps.build.mjs` (step build code), `dist/build/seed-runtime.mjs` (your entity types, repositories and seed hooks, for their unit tests) and `dist/build/seed-compilers.mjs` (your seed formats' compiler modules). The build loads the seed runtime the way their tests do, and fails if it can't: repositories and seed hooks can't use native modules or optional `@abuddy/sdk` peers such as `@tiptap/pm`
9. Backend bundling — `dist/runtime/index.cjs` (systems, services, steps, boot hooks, migrations)
10. FE bundling — bundles `src/__generated__/pack-entry-fe.ts` into `dist/runtime/fe.js` via Vite

See [CLI Reference](cli.md#building) for details.

## Build and distribute

```bash
# Compile the pack
abuddy build

# Bundle into a verified .tgz archive (integrity.json lists a sha256 per file)
abuddy pack
# Creates my-pack-0.1.0.tgz and my-pack-0.1.0.tgz.sha256

# Install into AgentBuddy
abuddy install ./my-pack-0.1.0.tgz
```

You can also install directly from a built pack directory, a `.zip` or `.tar.gz` archive, a URL to an archive, or a GitHub release:

```bash
abuddy install ../my-pack          # local directory
abuddy install my-pack.zip         # zip archive
abuddy install user/repo           # latest GitHub release (user/repo@v0.1.0 for a tag)
```

`abuddy install` targets the production app; add `-d` for the development data dir or `-b` for AgentBuddy Beta.

After installing, **restart the app** for the pack to load.

To release a version, run `abuddy release [patch|minor|major] [--beta]`: it checks the repo, bumps the version, builds, typechecks, runs the unit and E2E tests, commits, tags and pushes; the scaffolded workflow publishes the GitHub release. `--dry-run` builds and verifies the pack without bumping, committing or publishing anything, `--local` publishes from your machine instead of CI, and `--skip-tests`/`--skip-e2e` skip the unit or E2E tests.

## Unit tests

```bash
npm test
```

Unit tests run your pack without the app, through `@abuddy/testing/harness`: seeds and repositories against an in-memory database, systems under the app's bus, services with others mocked, and flows on the brain with `services.inference` mocked, including your dependencies' behaviour. The scaffold wires it up in `vitest.config.ts` and `tests/setup.ts`; run `abuddy build` once first, so dependencies are fetched. See [Testing](testing.md).

## E2E tests

```bash
abuddy init-tests
npm install
abuddy test --app beta      # or --app-root ../AgentBuddy for a local checkout
```

`abuddy init-tests` adds `playwright.config.ts` and a smoke test in `tests/e2e/`. `abuddy test` builds the pack, installs it into a throwaway data dir and runs the tests in the app: a checkout (`--app-root`, or `ABUDDY_ROOT`), or the newest AgentBuddy Beta satisfying your `hostVersion` (`--app beta`, or `ABUDDY_APP=beta` in CI). Without either, it asks once and saves your choice. See [Testing](testing.md).

## Verify it works

After restarting, your pack's feature should appear in the sidebar. Run `abuddy list` to see all installed packs.

## Useful commands

```bash
abuddy info       # Show pack summary (features, steps, seeds, etc.)
abuddy validate   # Check manifest and file references
abuddy doctor     # Run health checks
abuddy clean      # Remove dist/, .abuddy/, __generated__/
```

## Key concepts

- **Manifest (`abuddy.json`)** — declares everything: features, steps, services, seeds, entities. See [Manifest Reference](manifest.md).
- **Generated files (`__generated__/`)** — auto-generated from the manifest. Never edit these. They are regenerated on every build. The generated `pack-entry.ts` and `pack-entry-fe.ts` are your pack's registrations: everything it contributes (systems, services, repositories, steps, seeders, DSL types, …) reaches the app through them, never by writing to a registry when a module is imported.
- **Host dependencies** — packs share `vue`, `xstate`, tiptap, `lucide-vue-next` and other libraries, the SDK modules and `@abuddy/ui` with the host app via `window.__abuddy` globals. The build pipeline externalizes these automatically.
- **Seeds** — actions, prompts, flows and entity rows are compiled at build time and seeded when the pack loads. See [Seeds](seeds.md) for what action code may import.
- **`pack://` protocol** — the host loads your pack's FE bundle at runtime via `pack://<id>/runtime/fe.js`. This is handled automatically.

## Constraints

- Some manifest fields are for built-in packs only: validation rejects `features[].earlySystem` and `boot.seed.settings` in an external pack, and the app ignores an external pack's `partitionPolicy` and `features[].references`.
- Entity types, relation kinds and service keys must be unique across all installed packs, or the pack fails to load. Service keys also can't be the host's (`logger`, `emitter`, `repository`, `appData`, `traceStore`, `inference`, `secrets`).
- The app must be restarted after installing or uninstalling a pack.

## Next steps

- [Manifest Reference](manifest.md) — every field in `abuddy.json`
- [Features](features.md) — building systems and plugins
- [Seeds](seeds.md) — writing actions, prompts, and flows
- [Extensions](extensions.md) — steps, artifacts, and blocks
