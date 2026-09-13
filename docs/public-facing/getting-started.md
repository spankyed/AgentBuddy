# Getting Started

A **pack** is a self-contained extension for AgentBuddy. It can contribute backend systems, frontend plugins, flow steps, seeds (actions, prompts, flows), artifact viewers, message blocks, services, and data migrations. Packs are declared via an `abuddy.json` manifest and compiled into a distributable bundle.

## Prerequisites

- Node.js >= 20.6
- AgentBuddy installed
- The `abuddy` CLI, from any of:
  - the app: **AgentBuddy → Install 'abuddy' command in PATH** (macOS; AgentBuddy Beta installs `abuddy-beta`)
  - npm: `npm i -g @abuddy/cli`
  - Homebrew: the formula in `build/homebrew/abuddy.rb`

Whichever `abuddy` you run, inside a pack it hands off to the `@abuddy/cli` version the pack pins in its `devDependencies`, so every pack builds with the CLI it was written against.

## Packages

| Package | What it is |
|---|---|
| `@abuddy/sdk` | Pack-facing API and types (`@abuddy/sdk/ears`, `/fe`, `/steps`, …). A dependency of every pack. Libraries shared with the host (vue, xstate, zod) are peer dependencies. |
| `@abuddy/ui` | Vue components, tiptap and Monaco editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`). Add it when your pack's UI uses them; it brings the editor libraries, so backend-only packs leave it out. Packs use the app's copy at runtime (see `fe.bundleUi` in the manifest docs). |
| `@abuddy/cli` | The `abuddy` command and build toolchain. A devDependency of every pack. |
| `@abuddy/testing` | The Playwright fixture for pack E2E tests (`@playwright/test` is a peer). |

The four are released together with the same version.

## Create a pack

```bash
abuddy init my-pack
cd my-pack
npm install
abuddy add feature notes --label Notes
abuddy build
```

This scaffolds:

```
my-pack/
  abuddy.json              # Pack manifest — the single source of truth
  package.json             # depends on @abuddy/sdk, pins @abuddy/cli
  tsconfig.json
  vitest.config.ts
  .gitignore
  .github/workflows/
    release.yml            # Publishes a GitHub release when `abuddy release` pushes a tag
  src/
    env.d.ts
    features/              # `abuddy add feature <id>` adds features/<id>/{be,fe}
    extensions/
      steps/
        register.ts         # Step registration barrel
    seeds/
      actions/
      flows/
    __generated__/          # Auto-generated from manifest — never edit
  .abuddy/
    generated/              # EARS types from deps
    deps/                   # Cached dependency snapshots and step build code
  tests/
    unit/
      my-pack.spec.ts
```

The scaffold has no dependencies, so it builds as generated. To use another pack's entity types or flow steps (for example `keepAlive` from the built-in `default-setup` pack), add it to `dependencies` in `abuddy.json`. `abuddy build` resolves each dependency from a local path, the workspace, the app you configured for `abuddy test` (a checkout or the downloaded beta; `ABUDDY_APP=beta` in CI), the installed AgentBuddy app, or a GitHub release. The resolved version must satisfy the range you declare, and your flows are validated with the dependency's real step code. The scaffolded release workflow runs on macOS with `ABUDDY_APP=beta`, so built-in dependencies resolve in CI.

## The dev loop

```bash
abuddy dev
```

This runs an initial build, then watches `src/` and `abuddy.json` for changes. On any change it re-runs the full build with a 300ms debounce.

The build pipeline:

1. `abuddy generate` — resolves dependencies and generates EARS type definitions
2. `abuddy generate-entries` — reads `abuddy.json` and generates all files in `src/__generated__/`
3. Backend bundling — `dist/runtime/index.cjs` (systems, services, steps, boot, migrations) and `dist/build/steps.build.mjs` (step build code for packs that depend on yours)
4. Seed compilation — compiles actions, prompts, and flows from `src/seeds/` to `dist/runtime/seeds/`
5. Snapshot — writes `dist/types/snapshot.json` (types, defs, manifest) for downstream packs
6. FE bundling — bundles `src/__generated__/pack-entry-fe.ts` into `dist/runtime/fe.js` via Vite

## Build and distribute

```bash
# Compile the pack
abuddy build

# Bundle into a verified .tgz archive (bundle.json lists a sha256 per file)
abuddy pack
# Creates my-pack-0.1.0.tgz and my-pack-0.1.0.tgz.sha256

# Install into AgentBuddy
abuddy install ./my-pack-0.1.0.tgz
```

You can also install directly from a local directory, a `.zip` file, a URL, or a GitHub slug:

```bash
abuddy install ../my-pack          # local directory
abuddy install my-pack.zip         # zip archive
abuddy install github:user/repo    # GitHub release
```

After installing, **restart the app** for the pack to load.

To release a version, run `abuddy release [patch|minor|major] [--beta]`: it checks the repo, bumps the version, builds, tests, commits, tags and pushes; the scaffolded workflow publishes the GitHub release. `--dry-run` builds and verifies the bundle without bumping, committing or publishing anything, and `--local` publishes from your machine instead of CI.

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
- **Generated files (`__generated__/`)** — auto-generated from the manifest. Never edit these. They are regenerated on every build.
- **Host dependencies** — packs share `vue`, `xstate`, `lucide-vue-next`, and SDK modules with the host app via `window.__abuddy` globals. The build pipeline externalizes these automatically.
- **Seeds** — actions, prompts, and flows are compiled to JSON and executed in a sandboxed runtime. No bare Node.js imports allowed.
- **`pack://` protocol** — the host loads your pack's FE bundle at runtime via `pack://<id>/runtime/fe.js`. This is handled automatically.

## Constraints

- External packs cannot use `earlySystem` or `partitionPolicy` (reserved for built-in packs).
- Entity types, relation kinds, step types, and service keys must be unique across all installed packs.
- The app must be restarted after installing or uninstalling a pack.

## Next steps

- [Manifest Reference](manifest.md) — every field in `abuddy.json`
- [Features](features.md) — building systems and plugins
- [Seeds](seeds.md) — writing actions, prompts, and flows
- [Extensions](extensions.md) — steps, artifacts, and blocks
