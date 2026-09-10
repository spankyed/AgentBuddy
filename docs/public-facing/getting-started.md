# Getting Started

A **pack** is a self-contained extension for AgentBuddy. It can contribute backend systems, frontend plugins, flow steps, seeds (actions, prompts, flows), artifact viewers, message blocks, services, and data migrations. Packs are declared via an `abuddy.json` manifest and compiled into a distributable bundle.

## Prerequisites

- Node.js >= 23.0.0
- AgentBuddy installed and running
- The `abuddy` CLI (ships with `@abuddy/sdk`)

## Create a pack

```bash
abuddy init my-pack
cd my-pack
npm install
```

This scaffolds:

```
my-pack/
  abuddy.json              # Pack manifest — the single source of truth
  package.json             # Node package with #generated/* subpath import
  tsconfig.json
  vitest.config.ts
  .gitignore
  src/
    features/
      my-pack/             # Default feature
        feature.config.ts
        settings.ts
        be/
          system.ts         # Backend XState machine (via `abuddy add feature`)
        fe/
          plugin.ts         # Frontend plugin definition
          state.ts          # Frontend XState machine
          canvas/
            list.vue
    extensions/
      steps/
        register.ts         # Step registration barrel
    seeds/
      actions/
      flows/
        example-flow.ts     # Starter flow using DSL helpers
    __generated__/          # Auto-generated from manifest — never edit
      pack-entry.ts
      pack-entry-fe.ts
      ears.ts
      services.ts
      flow-helpers.ts
      ...
  .abuddy/
    generated/              # EARS types from deps
    deps/                   # Cached dependency snapshots
  tests/
    unit/
      my-pack.spec.ts
```

The generated manifest declares `"default-setup": "*"` as a dependency — this gives your pack access to the built-in entity types, relation kinds, and step definitions. The init command resolves dependencies then runs `abuddy generate` and `abuddy generate-entries` to bootstrap the generated files.

## The dev loop

```bash
abuddy dev
```

This runs an initial build, then watches `src/` and `abuddy.json` for changes. On any change it re-runs the full build with a 300ms debounce.

The build pipeline:

1. `abuddy generate` — resolves dependencies and generates EARS type definitions
2. `abuddy generate-entries` — reads `abuddy.json` and generates all files in `src/__generated__/`
3. Seed compilation — compiles actions, prompts, and flows from `src/seeds/` to JSON in `dist/`
4. Snapshot — writes `dist/snapshot.json` (types, defs, manifest) for downstream packs
5. FE bundling — bundles `src/__generated__/pack-entry-fe.ts` into `dist/fe.js` via Vite

## Build and distribute

```bash
# Compile the pack
abuddy build

# Bundle into a .tgz archive
abuddy pack
# Creates my-pack-0.1.0.tgz

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
- **`pack://` protocol** — the host loads your pack's FE bundle at runtime via `pack://<id>/fe.js`. This is handled automatically.

## Constraints

- External packs cannot use `earlySystem` or `partitionPolicy` (reserved for built-in packs).
- Entity types, relation kinds, step types, and service keys must be unique across all installed packs.
- The app must be restarted after installing or uninstalling a pack.

## Next steps

- [Manifest Reference](manifest.md) — every field in `abuddy.json`
- [Features](features.md) — building systems and plugins
- [Seeds](seeds.md) — writing actions, prompts, and flows
- [Extensions](extensions.md) — steps, artifacts, and blocks
