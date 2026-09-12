# PR Summary: Pack Modularization (`AS/pack-modularization`)

**Branch:** `AS/pack-modularization` → `master`
**Scope:** 382 commits, 1319 files changed, +30,100 / -33,109 lines

## What This PR Does

This PR transforms AgentBuddy from a monolithic Electron app into a **pack-based modular architecture**. All domain features (threads, code editor, brain, flows, library, notes, etc.) are extracted from the host packages (`packages/api/` and `packages/renderer/`) into self-contained **packs** — modular bundles that can be developed, built, tested, and distributed independently.

Three architectural layers emerge:

1. **Host packages** (`api/`, `renderer/`, `main/`) — thin runtime shells providing the framework: event bus, persistence engine, pack loading, window management
2. **SDK** (`abuddy-sdk/`) — the public API contract for pack development: CLI toolchain, build system, reusable UI components, EARS database helpers, system definition framework
3. **Default-setup** (the built-in pack) — all 13 domain features with colocated frontend + backend code, extension points (steps, blocks, artifacts, tiptap plugins, services), seeds, and migrations

## Major Workstreams

### 1. Code Extraction & Relocation (~140 commits)

**Renderer** went from ~510 files to 33. All plugin UIs (371 files across 14 plugins), shared design system components (74 files), tiptap editor subsystem (~30 files), and composables/utilities (~16 files) were extracted.

**API** went from ~350 files to 45. All backend systems (180+ files across 13 systems), services (~50 files), shared EARS modules, migrations, and seeds were extracted.

**Destinations:**
- Feature code (systems + plugins) → `default-setup/src/features/<name>/` with colocated `be/` + `fe/` directories
- Reusable framework APIs → `abuddy-sdk/src/` (design components, composables, EARS engine, step/block/artifact registries)
- Cross-cutting extensions → `default-setup/src/extensions/` (steps, blocks, artifacts, tiptap plugins, services)
- Seeds (DSL source) → `default-setup/src/seeds/`
- Migrations → `default-setup/src/migrations/`

### 2. SDK Creation (`@abuddy/sdk`) (~110 commits)

Entirely new package (248 files, +29,111 lines). Provides:

- **CLI** (`abuddy`): 17 commands — `init`, `build`, `dev`, `pack`, `install`, `test`, scaffolding (`add feature/step/action/...`), diagnostics (`doctor`, `validate`, `info`)
- **Build system**: Vite-based FE bundler with Vue SFC compilation, shared dependency externalization via window globals, tsconfig path alias support, generated entry files from `abuddy.json` manifest
- **FE component library**: 100 files extracted from renderer — design system (25 components), composables (10+), tiptap editor core, breadcrumb/navigation, hotkeys, tab groups, pack store
- **EARS database**: Complete entity-attribute-relation engine (15 files) — graph, queries, transactions, repository pattern, blueprints
- **Pack lifecycle**: Registration, discovery, installation (local/URL/GitHub), unregistration, hot-reload support
- **Testing**: Reusable Playwright E2E fixture (`AppHelper`) for internal and external pack tests
- **Runtime**: System definition framework (`defineSystem`, `safeEvents`, `emit`), template engine, service abstractions

### 3. Default-Setup Restructuring (~45 commits)

Transformed from a DSL-only seed data repo into a fully self-contained pack:

```
src/
  __generated__/      # Codegen output from abuddy.json manifest
  defs/               # DSL type definitions for Monaco intellisense
  features/           # 13 features with colocated be/ + fe/
    threads/  code/  notes/  calendar/  browser/  library/
    flows/  actions/  prompts/  brain/  database/  logs/  settings/
  extensions/          # Cross-cutting: artifacts, blocks, steps, services, tiptap
  seeds/               # DSL source (actions, prompts, flows, library, notes, faqs)
  migrations/          # Pack-owned migrations
```

Each feature has a `feature.config.ts` for build-time config consumed by codegen. The `abuddy.json` manifest declares all features, entities, services, steps, artifacts, blocks, tiptap plugins, boot hooks, and DSL definitions.

### 4. Pack Build & Loading System (~55 commits)

**Frontend loading:**
- Custom Vite plugins: `builtInPacksPlugin()` (auto-discovers packs, scoped `@/` aliases) and `hostDepsPlugin()` (shared deps via `window.__abuddy` global)
- `pack://` Electron custom protocol with dev-server proxy and path traversal protection
- Lazy loading with `defineAsyncComponent`, reactive plugin registration

**Backend loading:**
- `tsup.config.ts` with esbuild plugins for pack discovery, virtual module generation, per-pack alias resolution
- Pack registry with atomic writes, service collision detection
- Per-pack EARS entities, boot hooks, migrations, seeds
- Hash-based seed lifecycle for external packs

**Dev mode:**
- Parallelized startup (API build, default-setup dev-watch, renderer Vite server concurrent)
- Backend HMR via SDK bridge with orphaned actor cleanup
- Frontend HMR via Vite dev server with debounced reload notifications
- Dynamic port resolution, IPC subprocess management

### 5. Step Registry Decoupling (~20 commits)

Made the step/flow system pluggable: step definitions as structured types with trigger facets, delegated validation/decompilation/component management to registry, `NodeEntityRegistry` for pack-level step type registration, flow → subflow rename.

### 6. E2E Testing & CI (~25 commits)

- Restructured tests with shared Playwright fixtures and config
- External pack testing via `PACK_DIR` env var
- `abuddy init-tests` + `abuddy test` CLI commands for pack authors
- GitHub Actions CI workflow (manual dispatch: typecheck + unit tests)
- Smoke tests, navigation tests, comprehensive fixture documentation

### 7. Bug Fixes (scattered, ~25 commits)

Thread submit handler argument, stale birth thread after db reset, white flash on window load, tiptap suggestion popup guard, negative menu count, duplicate plugin ID warnings, locale-based version comparison, proxy binding fixes, import path corrections.

## What Was Intentionally Not Done

1. **CI triggers are manual-only** — push/PR triggers are commented out in `.github/workflows/ci.yml`. E2E tests require Electron/display and aren't in CI yet.
2. **External pack runtime is scaffolded but not production-hardened** — the `install`/`uninstall`/`list` CLI commands exist, GitHub release resolution works, but external pack sandboxing, permissions, and update mechanisms are not implemented.
3. **No pack marketplace or registry service** — packs install from local path, URL, or GitHub release. No central discovery/distribution.
4. **`discoverBuiltInPacks` is duplicated** across renderer Vite config, API tsup config, and Tailwind config (three separate implementations scanning `abuddy.json`). This is a known maintenance risk, not yet unified.
5. **Pack-level settings UI** — pack settings are defined but the per-pack settings management UI in the host is minimal.
6. **No backwards-compatibility migration** — this is a clean break. Existing builds on `master` cannot incrementally adopt; the entire pack system ships together.

## Architecture After This PR

```
packages/
  main/             # Electron main process (8 files changed)
                    #   New: PackProtocol (pack:// custom protocol)
                    #   Changed: WindowManager (renderer:ready IPC, white-flash fix)
  preload/          # IPC bridge (1 file: rendererReady + protocolAction)
  renderer/         # FE host shell (~33 files)
                    #   App shells, core actors, layout, pack loader, trpc, migrations
  api/              # BE host runtime (~45 files)
                    #   Server bootstrap, event bus, EARS persistence, pack loader/registry
  abuddy-sdk/       # Pack SDK (~248 files, NEW)
                    #   CLI, build system, FE components, EARS engine, pack lifecycle, testing
  default-setup/    # Built-in pack (~818 files changed)
                    #   13 features (be/ + fe/), extensions, seeds, migrations, manifest
```

## Key Files for Navigation

| Purpose | File |
|---------|------|
| Pack manifest | `packages/default-setup/abuddy.json` |
| SDK entry point | `packages/abuddy-sdk/src/index.ts` |
| FE pack loading | `packages/renderer/vite.config.ts` (`builtInPacksPlugin`) |
| BE pack loading | `packages/api/tsup.config.ts` (`built-in-pack-loaders`) |
| Pack registry | `packages/abuddy-sdk/src/packs/registry.ts` |
| FE pack store | `packages/abuddy-sdk/src/fe/pack-store.ts` |
| Dev mode | `packages/dev-mode.js` |
| Pack protocol | `packages/main/src/modules/pack-protocol/PackProtocol.ts` |
| Shared deps | `packages/abuddy-sdk/src/build/shared-deps.ts` |
| Generated entries | `packages/default-setup/src/__generated__/` |
| CI workflow | `.github/workflows/ci.yml` |
