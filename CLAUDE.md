# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server using Fastify + tRPC, with XState actor systems and LMDB persistence
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — Action/prompt/flow/library DSL source + compiler (see `packages/default-setup/CLAUDE.md`). Compiles output to `packages/api/src/setup/seed/data/`

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Release metadata

Do not edit release/version metadata unless the user explicitly asks for a release or version bump. This includes `package.json` version fields, `package-lock.json` root package versions, app version constants, release notes, changelogs, and generated release artifacts. The release process owns those changes.

## Commands

```bash
npm start                # Dev mode (skips DSL generation)
npm run start:gen        # Dev mode with DSL generation
npm run build:be         # Build backend only
npm run build            # Build all workspaces
npm run build-prod       # Full production build (build/build.sh)

npm run typecheck        # Type check everything (FE + BE + SDK + default-setup pack)
npm run typecheck:fe     # Frontend only (vue-tsc)
npm run typecheck:be     # Backend only (tsc --noEmit)
npm run typecheck:sdk    # @abuddy/sdk only
npm run typecheck:pack   # @app/default-setup only
npm run test-build       # Verify FE + BE compile

npm test                 # Playwright E2E tests
npm run compile          # Compile all DSLs (actions, prompts, flows, library) from packages/default-setup

npm run db:cli           # Database CLI
npm run db:reset         # Reset database

# Published API surface (run from packages/abuddy-sdk or packages/abuddy-ui)
npm run api:check        # CI: fails if a public entry's API changed without updating reports
npm run api:update       # Dev: regenerate etc/<entry>.api.md for every public entry

npm run packages:build   # Build dist/ for @abuddy/sdk and @abuddy/ui, bundle @abuddy/cli and @abuddy/testing
npm run packages:check   # publint + arethetypeswrong on the packed packages (after packages:build)
```

### E2E visual testing

Playwright tests launch the full Electron app and interact via `window.applicationState` (the XState actor). Use to visually verify UI changes.

```bash
npm test                              # Run all E2E tests
npx playwright test smoke             # Run just smoke tests
npx playwright test tests/e2e/scratch # Run ad-hoc scratch test (gitignored)
DEBUG_E2E=1 npm test                  # With Electron stdout/stderr logging
```

Screenshots save to `tests/screenshots/` (gitignored). The `app` fixture provides `navigate(pluginId)`, `screenshot(name)`, `sendEvent(event)`, `getState()`, `getContext()`, `waitForState(check)`, and `waitForPlugin(pluginId)`.

The fixture source is `@abuddy/testing` (`packages/abuddy-testing/src/index.ts`), re-exported by `tests/e2e/fixtures/app.ts`. It launches Electron, finds the main window via `window.applicationState`, bypasses onboarding, and provides the `AppHelper` API. External packs share the same fixture — `abuddy init-tests` scaffolds tests in a pack repo, then `abuddy test` runs them in a local checkout (`--app-root`) or a downloaded AgentBuddy Beta (`--app beta`). Set `PACK_DIR=/path/to/pack` to sync/build a pack and wait for its plugins.

For full fixture lifecycle, API reference, and ad-hoc testing pattern, see `tests/e2e/CLAUDE.md`. For external pack testing details, see `packages/abuddy-testing/CLAUDE.md`.

## Architecture

### Event-driven actor system

Every backend **system** and frontend **plugin** is an XState state machine. They communicate via a central event bus:

- **Backend → Frontend**: `system.get(bus).send(emit(pluginName, { type, data }))`
- **Frontend → Backend**: `trpc.bus.send.mutate({ systemId, type, data })`
- **System → System**: `system.get(otherSystemId).send({ type })`
- **⚠️ `sendToPlugin` wraps events with `pluginId`** — never use `pluginId` as a field name inside event payloads sent via `sendToPlugin()`, it gets overwritten by the transport layer. Use `targetId` or similar instead.

Systems define `IncomingSystemEvents`, `SystemInternalEvents`, and `OutgoingSystemEvents`. System code lives in `packages/default-setup/src/features/<name>/be/system.ts`. The bus actor and systems registry live in `packages/api/src/systems.ts`.

### SDK packages

`@abuddy/sdk` is the pack-facing API; host-only modules live in the private `@abuddy/host` (`packages/abuddy-host`). External packs import `@abuddy/sdk` and `@abuddy/ui`; host code (api, renderer, CLI, testing, default-setup) also uses `@abuddy/host`.

- `@abuddy/sdk/ears` — pack-facing: `tx`, `repository`, `defineEars`, `grantRole`, etc. Packs get typed `qx`/`find*` from their generated `#generated/ears`.
- `@abuddy/host/ears` — host-only: `initEARSRuntime`, `edgeStore`, `relationIndex`, `clearMemory`, untyped `qx`/`find*`, LMDB delegates. The engine itself stays in the SDK; `@abuddy/sdk/ears/internals` is its host hook, exported only under the `@abuddy/source` condition.
- `@abuddy/sdk/fe` — pack-facing: `Plugin`, `PackFERegistration`, `safeEvents`, `useActorSystem`, `navigateToPlugin`, etc.
- `@abuddy/host/fe` — host-only: `registerPackFE`, `getRegisteredPlugins`, app extensions.
- `@abuddy/host/packs`, `/persistence`, `/backup`, `/build/discover`, `/build/shared-deps` — pack registry, discovery, installer and updater; persistence partitioning; backups; build-time pack discovery and host-shared dependency lists.
- `@abuddy/ui` (`packages/abuddy-ui`) — Vue components, editors and UI composables (`@abuddy/ui/design/*.vue`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`). Contracts and host-shared state (`useActorSystem`, menu state, tiptap plugin and DSL registries) stay in `@abuddy/sdk/fe`; `@abuddy/sdk` must not import `@abuddy/ui`.
- `@abuddy/sdk/utils` — **Node-only**: re-exports everything (pure + Node-dependent). Backend code imports from here.
- `@abuddy/sdk/utils/pure` — **environment-agnostic**: pure utilities only (`compareVersions`, `detectChanges`, `BinaryOperator`, `toMap`, `randomId`, etc.). Frontend/renderer code must import from this path (or a specific sub-path like `@abuddy/sdk/utils/compare-versions`), never from `@abuddy/sdk/utils`.

When adding new utils, put pure functions in the appropriate file under `utils/` and re-export from `pure.ts`. Node-dependent code stays in the existing Node modules and is re-exported only from `index.ts`.

`@abuddy/sdk` and `@abuddy/ui` publish their workspace `package.json`. Each export resolves source under the `@abuddy/source` condition and `dist/` otherwise, so monorepo tooling sets that condition: tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, esbuild/tsup `conditions`, `node --conditions` (root `.npmrc` `node-options` for npm scripts and `npx`, the CLI bin in source mode, the API process the app spawns from source). `npm run packages:build` writes `dist/`; `npm run exports:update -w @abuddy/ui` regenerates the UI exports map after adding or removing a module.

When adding new EARS or FE exports, put them in the correct barrel. Tag exports only the host uses `@internal`. After changing public exports, run `npm run api:update` in `packages/abuddy-sdk` (or `packages/abuddy-ui`) and commit the updated `etc/*.api.md` reports.

### Data layer (EARS)

Custom entity-attribute-relation graph database backed by LMDB. All data lives in memory.

- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: each system has `repository/` with `startup.ts`, `read.ts`, `create.ts`, `update.ts`

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. Plugin code lives in `packages/default-setup/src/features/<name>/fe/`. The plugin registry is at `packages/default-setup/src/registries/plugins.ts`.

### Key patterns

- Every system/plugin must handle `CLIENT_CONNECTED` to send startup data
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### App environment

Environment identity and data paths come from one resolver, `@abuddy/sdk/env` (`resolveAppContext()`). Don't read `NODE_ENV`, `PLAYWRIGHT_TEST` or platform paths to decide which data dir to use.

- The Electron main process infers the environment once at startup (`packages/main/src/app-context.ts`): Playwright → `test`; packaged builds → the channel stamped by `build/build.sh` (`production` | `beta`; an unstamped packaged build refuses to start); source runs → `ABUDDY_ENV` if set, else `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process.
- Anything started without them throws instead of falling back to production. Manual API boots must pass both, pointing at a copy of user data: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node --conditions=@abuddy/source dist/server.js`
- CLI commands pass `{ env }` explicitly (`install`/`uninstall`/`list`/`open` default to production; `-d`/`-b` select dev/beta).

### Migrations

Settings migrations live in `packages/api/src/setup/migrations/`. Each file exports a `Migration` with a `target` version and an `up()` function.

- **Target the next release version** — migrations run when `stored_version < target <= app_version`. Name the file after the version it targets (e.g. `0.2.4.ts` runs when the app is released as 0.2.4+).
- **Never bump `package.json` version manually** — the release process handles version bumps. Migrations are written ahead of time to target the upcoming release.
- **Register in `index.ts`** — import and append to the `migrations` array in version order.
- **Idempotent guards** — always check if the change is needed before applying (e.g. `if (!value) set(value)`), since migrations may re-run after a reset.

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK (LLM integration with Anthropic/OpenAI/Google), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
