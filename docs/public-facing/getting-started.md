# Getting Started

A **pack** is a self-contained extension for apack. It can contribute backend systems, frontend plugins, flow steps, content (actions, prompts, flows), artifact viewers, message blocks, services, and data migrations. Packs are declared via an `apack.json` manifest and compiled into a distributable archive.

## Prerequisites

- Node.js >= 22
- apack installed
- The `apack` CLI, from any of:
  - the app: **apack → Install 'apack' command in PATH** (macOS; apack Beta installs `apack-beta`)
  - npm: `npm i -g @apack/cli`
  - Homebrew: the formula in `build/homebrew/apack.rb`

Whichever `apack` you run, inside a pack it hands off to the `@apack/cli` version the pack pins in its `devDependencies`, so every pack builds with the CLI it was written against.

## Packages

| Package | What it is |
|---|---|
| `@apack/sdk` | Pack-facing API and types (`@apack/sdk/fe`, `/steps`, `/events`, …). A dependency of every pack. Libraries shared with the host (vue, xstate, zod) and the AI SDK (`ai` 7, whose types `services.inference` uses) are peer dependencies, and so is TypeScript (5.7 or later). |
| `@apack/ears` | The EARS data engine: what the generated `#generated/ears` and `#generated/repository` build on, and the untyped API packs import directly (`untypedQx`, `tx`, `findRelations`, graph and blueprint helpers, `RepositoryError`; `createEarsEngine` for tests and tooling). The app shares one instance with every pack, as it does `@apack/sdk`. A dependency of every pack. |
| `@apack/ui` | Vue components, tiptap and Monaco editors and UI composables (`@apack/ui/design/button`, `@apack/ui/components/tiptap/TiptapEditor`). Add it when your pack's UI uses them; it brings the editor libraries, so backend-only packs leave it out. Packs use the app's copy at runtime (see `build.bundleUi` in the manifest docs). |
| `@apack/cli` | The `apack` command and build toolchain. A devDependency of every pack. |
| `@apack/testing` | Pack tests: `@apack/testing/harness` runs a pack's content, systems, services and flows in unit tests without the app, `@apack/testing/vitest` configures Vitest for it (`isolatedDataDir`), and `@apack/testing` is the Playwright fixture for E2E tests in the app (`@playwright/test` is a peer). |

The five are released together with the same version.

## Create a pack

```bash
apack init my-pack
cd my-pack
npm install
apack add feature notes --label Notes
apack build
```

`apack init` creates no feature; `apack add feature` adds one (a feature id is a lowercase letter followed by letters and digits, like `notes` or `calendarEvents`). This scaffolds:

```
my-pack/
  apack.json              # Pack manifest — the single source of truth
  package.json             # depends on @apack/sdk and @apack/ears, pins @apack/cli and @apack/testing
  tsconfig.json
  vitest.config.ts         # unit tests: an isolated data dir per run, the harness setup
  .gitignore
  .github/workflows/
    release.yml            # Publishes a GitHub release when `apack release` pushes a tag
  src/
    env.d.ts
    features/
      notes/                # added by `apack add feature notes`: settings.ts, be/, fe/
    extensions/             # added by `apack add step|artifact|block`: one directory each,
                            # declared in apack.json's `extensions` — there is no barrel
    content/
      actions/
      flows/
      examples/             # markdown rows of the pack's entity type (the `examples` content format)
    __generated__/          # Auto-generated from manifest — never edit
  .apack/
    generated/              # EARS types from deps
    deps/                   # Cached dependency snapshots and step build code
  tests/
    setup.ts                # starts the unit test harness
    unit/
      my-pack.spec.ts       # content the examples entry and reads the rows back
      notes-system.spec.ts  # added with the feature: its system under the app's bus
```

The scaffold has no dependencies, so it builds as generated. To use another pack's entity types or flow steps (for example `keepAlive` from the built-in `default-setup` pack), add it to `dependencies` in `apack.json`. `apack build` resolves each dependency from a `file:` path, the workspace, the app you configured for `apack test` (a checkout or the downloaded beta; `APACK_BUILD=beta` in CI), an installed apack app, the `.apack/deps` cache, or a GitHub release, in that order. The resolved version must satisfy the range you declare, and your flows are validated with the dependency's real step code. The scaffolded release workflow runs on macOS with `APACK_BUILD=beta`, so built-in dependencies resolve in CI.

## The dev loop

```bash
apack dev
```

This launches apack with your pack installed and keeps it in step with your edits: frontend changes hot-reload through Vite HMR, `apack.json` changes regenerate `src/__generated__/`, and backend `.ts` changes rebuild, reinstall and reload the pack's backend in the running app.

It works out which app to use rather than asking: the apack checkout your pack is built against if there is one, else the newest Beta build your `hostVersion` accepts. `--build <path>` and `--build beta` name one outright, and it always says which it chose and why. If an app is already running on that data dir, `dev` uses it rather than starting a second.

The build pipeline (`apack build`):

1. Validates `apack.json` and clears `dist/`
2. `apack generate` and `apack generate-entries` — resolve dependencies, write their EARS types and generate `src/__generated__/`
3. Checks each feature's settings file sets only its own plugin's settings
4. Resolves dependencies, warning when the generated dependency types are from a different version
5. Content compilation — compiles `content.sources` from `src/content/` to `dist/runtime/content/`, validating flows with the dependencies' step code
6. Facade types — bundles `dist/types/pack-types.d.ts`, the types packs that depend on yours import, and fails unless it type-checks on its own and imports only `@apack/*` packages, `@apack/sdk`'s peers and Node built-ins. Warns if your committed `etc/pack-types.api.md` has fallen behind it
7. Snapshot — writes `dist/types/snapshot.json` (types, facade types, flow helpers, manifest) for downstream packs
8. Build code for dependents — `dist/build/steps.build.mjs` (step build code), `dist/build/content-runtime.mjs` (your entity types, repositories and content writers, for their unit tests) and `dist/build/content-compilers.mjs` (your content formats' compiler modules). The build loads the content runtime the way their tests do, and fails if it can't: repositories and content writers can't use native modules or optional `@apack/sdk` peers such as `@tiptap/pm`
9. Backend bundling — `dist/runtime/index.cjs` (systems, services, steps, boot hooks, migrations)
10. FE bundling — bundles `src/__generated__/pack-entry-fe.ts` into `dist/runtime/fe.js` via Vite

See [CLI Reference](cli.md#building) for details.

## Build and distribute

```bash
# Compile the pack
apack build

# Pack into a verified .tgz archive (integrity.json lists a sha256 per file)
apack pack
# Creates my-pack-0.1.0.tgz and my-pack-0.1.0.tgz.sha256

# Install into apack
apack install ./my-pack-0.1.0.tgz
```

You can also install directly from a built pack directory, a `.zip` or `.tar.gz` archive, a URL to an archive, or a GitHub release:

```bash
apack install ../my-pack          # local directory
apack install my-pack.zip         # zip archive
apack install user/repo           # latest GitHub release (user/repo@v0.1.0 for a tag)
```

`apack install` targets the production app; add `-d` for the development data dir or `-b` for apack Beta.

After installing, **restart the app** for the pack to load.

To release a version, run `apack release [patch|minor|major] [--beta]`: it checks the repo, bumps the version, builds, typechecks, runs the unit and E2E tests, commits, tags and pushes; the scaffolded workflow publishes the GitHub release. `--dry-run` builds and verifies the pack without bumping, committing or publishing anything, `--local` publishes from your machine instead of CI, and `--skip-tests`/`--skip-e2e` skip the unit or E2E tests.

## Unit tests

```bash
npm test
```

Unit tests run your pack without the app, through `@apack/testing/harness`: content and repositories against an in-memory database, systems under the app's bus, services with others mocked, and flows on the brain with `services.inference` mocked, including your dependencies' behaviour. The scaffold wires it up in `vitest.config.ts` and `tests/setup.ts`; run `apack build` once first, so dependencies are fetched. See [Testing](testing.md).

## E2E tests

```bash
apack init-tests
npm install
apack test --build beta      # or --build ../apack for a local checkout
```

`apack init-tests` adds `playwright.config.ts` and a smoke test in `tests/e2e/`. `apack test` builds the pack, installs it into a throwaway data dir and runs the tests in the app: a checkout (`--build`, or `APACK_ROOT`), or the newest apack Beta satisfying your `hostVersion` (`--build beta`, or `APACK_BUILD=beta` in CI). With neither, it uses that newest Beta: `apack test` never reads the app you saved and never asks, so a test run means the same thing on any machine. See [Testing](testing.md).

## Verify it works

After restarting, your pack's feature should appear in the sidebar. Run `apack list` to see all installed packs.

## Useful commands

```bash
apack info       # Show pack summary (features, steps, content, etc.)
apack validate   # Check manifest and file references
apack doctor     # Run health checks
apack clean      # Remove dist/, .apack/, __generated__/
```

## Key concepts

- **Manifest (`apack.json`)** — declares everything: features, steps, services, content, entities. See [Manifest Reference](manifest.md).
- **Generated files (`__generated__/`)** — auto-generated from the manifest. Never edit these. They are regenerated on every build. The generated `pack-entry.ts` and `pack-entry-fe.ts` are your pack's registrations: everything it contributes (systems, services, repositories, steps, appliers, DSL types, …) reaches the app through them, never by writing to a registry when a module is imported.
- **Host dependencies** — packs share `vue`, `xstate`, tiptap, `lucide-vue-next` and other libraries, the SDK modules and `@apack/ui` with the host app. The build pipeline leaves those imports external and the app's document carries an import map naming its own copy of each, so your pack gets the app's instance.
- **Content** — actions, prompts, flows and entity rows are compiled at build time and written when the pack loads. See [Content](content.md) for what action code may import.
- **`pack://` protocol** — the host loads your pack's FE bundle at runtime via `pack://<id>/runtime/fe.js`. This is handled automatically.

## Constraints

- Some manifest fields are for built-in packs only: validation rejects `content.sources.settings` in an external pack, and the app ignores an external pack's `features.<id>.references`.
- Entity types, relation kinds and service keys must be unique across all installed packs, or the pack fails to load. Service keys also can't be the host's (`logger`, `emitter`, `repository`, `appData`, `traceStore`, `inference`, `secrets`).
- The app must be restarted after installing or uninstalling a pack.

## Next steps

- [Manifest Reference](manifest.md) — every field in `apack.json`
- [Features](features.md) — building systems and plugins
- [Content](content.md) — writing actions, prompts, and flows
- [Extensions](extensions.md) — steps, artifacts, and blocks
