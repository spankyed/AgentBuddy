# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server using Fastify + tRPC, with XState actor systems and LMDB persistence
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — the built-in pack: features, steps, and seed sources (actions, prompts, flows, library, notes, FAQs, settings) that `abuddy build` compiles into `packages/default-setup/dist/` from `abuddy.json` `boot.seed` (see `packages/default-setup/CLAUDE.md` and `docs/public-facing/seeds.md`)

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Release metadata

Do not edit release/version metadata unless the user explicitly asks for a release or version bump. This includes `package.json` version fields, `package-lock.json` root package versions, app version constants, release notes, changelogs, and generated release artifacts. The release process owns those changes.

## Commands

```bash
npm start                # Dev mode (builds the built-in pack without its FE bundle)
npm run start:gen        # Full built-in pack build (npm run compile), then dev mode
npm run build:be         # Build backend only
npm run build            # Build all workspaces
npm run build-prod       # Full production build (build/build.sh)

npm run typecheck        # Every check below, plus check:specifiers
npm run typecheck:fe     # Frontend only (vue-tsc)
npm run typecheck:be     # Backend only (tsc --noEmit, plus the api's scripts)
npm run typecheck:sdk    # @abuddy/sdk only
npm run typecheck:host   # @abuddy/host only
npm run typecheck:ui     # @abuddy/ui only
npm run typecheck:cli    # @abuddy/cli + @abuddy/testing
npm run typecheck:scripts # scripts/ and tests/
npm run typecheck:pack   # @app/default-setup only
npm run check:ui-entries # Fails on a stale @abuddy/ui exports map or a component without an entry

npm test                 # Playwright E2E tests
npm run test:unit        # Vitest: @app/api, @app/default-setup, @abuddy/host
npm run test:all         # test:unit, then the E2E tests
npm run test:external-pack       # Build the fixture packs in tests/fixtures with the CLI and run their tests (needs npm run build)
npm run test:packaged-authoring  # Author, build, test and install a pack outside the monorepo from the packed @abuddy/* tarballs (needs npm run build)
npm run compile          # Build packages/default-setup (abuddy build: compiled seeds, snapshot, types; DSL defs; dist/runtime/index.cjs)

npm run db:cli           # Database CLI
npm run db:reset         # Reset database

# Published API surface (run from packages/abuddy-sdk or packages/abuddy-ui)
npm run api:check        # CI: fails if a public entry's API changed without updating reports
npm run api:update       # Dev: regenerate etc/<entry>.api.md (and etc/<entry>.component.md for UI components)

# Built-in pack facade types (after `abuddy build`; from packages/default-setup or with -w @app/default-setup)
npm run facade:check     # CI: fails if dist/types/pack-types.d.ts changed without updating etc/pack-types.api.md
npm run facade:update    # Dev: regenerate etc/pack-types.api.md

# Manifest JSON schema (-w @abuddy/sdk)
npm run generate:schema  # Regenerate packages/abuddy-sdk/abuddy.schema.json from manifest-schema.ts
npm run schema:check     # Fails if abuddy.schema.json is stale

npm run packages:build   # Build dist/ for @abuddy/sdk and @abuddy/ui, bundle @abuddy/cli and @abuddy/testing
npm run packages:check   # publint + arethetypeswrong on the packed packages (after packages:build)
```

### E2E visual testing

Playwright tests launch the full Electron app and interact via `window.applicationState` (the XState actor). Use to visually verify UI changes.

```bash
npm test                              # Run all E2E tests
npm test -- smoke                    # Run just smoke tests
npm test -- tests/e2e/scratch        # Run ad-hoc scratch test (gitignored)
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

Systems define `IncomingSystemEvents`, `SystemInternalEvents`, and `OutgoingSystemEvents`. System code lives in `packages/default-setup/src/features/<name>/be/system.ts`, its identity from `defineSystem(id)`; a feature's designation comes only from `abuddy.json` `features[].designation`, which must equal the feature id. The bus machine is `createBusMachine` in `packages/abuddy-host/src/bus`; `packages/api/src/systems.ts` composes it with the tRPC event sources as `backendSystem`. Systems register through `registerPack()` (`packages/abuddy-host/src/packs/pack-registration.ts`); external packs' system ids are `<packId>.<featureId>` (use `busId` from `#generated/bus-ids`).

### SDK packages

`@abuddy/sdk` is the pack-facing API; host-only modules live in the private `@abuddy/host` (`packages/abuddy-host`). Packs, built-in or external, import only `@abuddy/sdk` and `@abuddy/ui`; host code (api, renderer, CLI, testing, and default-setup's tests) also uses `@abuddy/host`. `npm run check:specifiers` rejects `@abuddy/host` in pack sources and CLI templates, and `abuddy build` fails a pack bundle that imports it. Pack code reads relations with `findRelations`/`getRelationStats` and queries untyped with `untypedQx` (`@abuddy/sdk/ears`), reaches host-implemented data operations through `services.appData` (reset, backup export/import), `services.traceStore` (the volatile trace store) and `services.secrets` (the user's API keys as metadata: list, select, rename, delete; never values), and calls models through `services.inference` (AI SDK 7's `generateText`/`streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe` and `rerank`, with `provider:model` ids checked against `providerCapabilities`, `output` as an `Output` or plain data like `{ type: 'object', schema }`, and the key the user selected per provider, never the environment; packs import pure pieces like `tool` from `ai`).

- `@abuddy/sdk/ears` — pack-facing: `tx`, `defineEars`, `grantRole`, etc. Packs get typed `qx`/`tx`/`find*`/`createEntityWithDefaults`/`updateEntity`/`getAttr` from `#generated/ears` (a literal entity name must be one the pack or its dependencies declare, its `EntityName`; a name typed `string` passes unchecked; ids from typed queries carry their entity type, a plain `EARS.EntityId` is accepted anywhere; `tx` checks declared fields' values when it knows the entity; the SDK owns Relation, the flow model, and the settings data its seeders and services use, defined in `abuddy-sdk/src/types/sdk-entities.ts`, and no pack declares them), `repository` (typed with the repositories declared in `abuddy.json` `features[].repositories`) from `#generated/repository`, and `emit`/`sendToPlugin` (keyed by receiving plugin; `features[].system.sendsTo` adds cross-plugin sends) from `#generated/events`. `abuddy build` bundles a pack's facade types into `dist/types/pack-types.d.ts` (and its snapshot), so dependents' facades include them. `check:specifiers` rejects raw `emit`/`sendToPlugin`/`registerRepository` imports in pack sources.
- `@abuddy/host/ears` — host-only: `initEARSRuntime`, `edgeStore`, `relationIndex`, `clearMemory`, untyped `qx`/`find*`, LMDB delegates. The engine itself stays in the SDK; `@abuddy/sdk/ears/internals` is its host hook, exported only under the `@abuddy/source` condition.
- `@abuddy/sdk/fe` — pack-facing: `Plugin`, `PackFERegistration`, `safeEvents`, `useActorSystem`, `navigateToPlugin`, etc.
- `@abuddy/host/fe` — host-only: `registerPackFE`, `getRegisteredPlugins`, app extensions.
- `@abuddy/host/packs`, `/packs/dev-server`, `/persistence`, `/backup`, `/build/discover`, `/build/shared-deps`, `/build/source-resolution` — pack registration, discovery, registry, installer, updater, bundle layout and module bridge; the `abuddy dev` server marker the `pack://` handler proxies to; persistence partitioning; backups; build-time pack discovery and host-shared dependency lists; the `@abuddy/source` condition helpers and the check that a process resolves workspace source, not `dist`.
- `@abuddy/host/bus` — `createBusMachine`, the backend bus (spawns registered systems, routes events, pack activate/teardown/reload). The app wires it in `api/src/systems.ts`; the pack test harness runs the same machine.
- `@abuddy/host/services` — the host's implementations of the services packs reach through `services` (`app-data.ts`, `trace-store.ts`, `inference.ts`, `secrets.ts`, each named after its contract and delegate in `@abuddy/sdk/services`). The API's boot registers them all with `registerHostServices()`; a service's implementation never lives in the API. `@abuddy/host/settings` is the host's typed view of default-setup's settings.
- `@abuddy/host/secrets` — host-only, never bridged to packs: the store of the user's API keys (metadata plain, values AES-256-GCM encrypted in `secrets.json`, the data key in a `KeyVault`: the OS credential store via `@napi-rs/keyring`, or a file in the test environment or after the user allows unprotected storage). Values reach it only through the API's `secrets.*` tRPC procedures, off the event bus; inference reads them with `secretsStore.keyFor(provider)`. The API logger and error reports redact key-shaped strings.
- `@abuddy/ui` (`packages/abuddy-ui`) — Vue components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`). Published as compiled JS (tsdown, with vue-tsc declarations). Packs use the host's copy at runtime: the renderer exposes every export on `window.__abuddy` and the pack FE bundler proxies `@abuddy/ui` imports, unless `abuddy.json` sets `fe.bundleUi`. Contracts and host-shared state (`useActorSystem`, menu state, tiptap plugin and DSL registries) stay in `@abuddy/sdk/fe`; `@abuddy/sdk` must not import `@abuddy/ui`.
- `@abuddy/sdk/utils` — **Node-only**: re-exports everything (pure + Node-dependent). Backend code imports from here.
- `@abuddy/sdk/utils/pure` — **environment-agnostic**: pure utilities only (`compareVersions`, `detectChanges`, `BinaryOperator`, `toMap`, `randomId`, etc.). Frontend/renderer code must import from this path (or a specific sub-path like `@abuddy/sdk/utils/compare-versions`), never from `@abuddy/sdk/utils`.

Relative imports in `@abuddy/sdk`, `@abuddy/host` and `@abuddy/ui` name the `.ts` source (`./query.ts`); tsc (`rewriteRelativeImportExtensions`) and tsdown write `.js` into the output. `npm run check:specifiers` (part of `npm run typecheck`) rejects relative `.js` specifiers there. Workspace tsconfigs that compile this source need `allowImportingTsExtensions`. Generated pack code (`generate-entries`) keeps `.js`.

When adding new utils, put pure functions in the appropriate file under `utils/` and re-export from `pure.ts`. Node-dependent code stays in the existing Node modules and is re-exported only from `index.ts`.

`@abuddy/sdk` and `@abuddy/ui` publish their workspace `package.json`. Each export resolves source under the `@abuddy/source` condition and `dist/` otherwise, so monorepo tooling sets that condition: tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, esbuild/tsup `conditions`, `node --conditions` (the CLI bin's resolve hooks in source mode, the API process the app spawns from source). Node commands that load workspace source run through `node scripts/with-source.mjs <command>`, which appends the condition to `NODE_OPTIONS` (`npm test`, the api's `db:*` scripts); run Playwright through `npm test -- <args>`, which carries the condition. `@abuddy/testing`, the CLI and the API's dev boot fail when they would resolve a checkout's `dist` instead of its source. `npm run packages:build` writes `dist/`; `npm run exports:update -w @abuddy/ui` regenerates the UI exports map after adding or removing a module. To publish a `@abuddy/ui` component, add a `.ts` entry module next to it (`design/button.ts`: `export { default } from './button.vue'; export * from './button.vue';`) and run `exports:update`. TypeScript can't resolve an exports target that is a `.vue` file, so the entry is what consumers import. SFCs without an entry are internal: other `@abuddy/ui` files import them by relative path, and `exports:update` fails if code outside `@abuddy/ui` imports one.

When adding new EARS or FE exports, put them in the correct barrel. Tag exports only the host uses `@internal`. After changing public exports, run `npm run api:update` in `packages/abuddy-sdk` (or `packages/abuddy-ui`) and commit the updated `etc/*.api.md` reports. A UI component's props, emits, slots and exposed members are reported in `etc/<entry>.component.md`, so changing them needs `api:update` too. The pack-facing SDK exposes no `any` (`published-sdk-any.spec.ts` fails when an export does; use `unknown` or a generic); `@abuddy/sdk` and `@abuddy/ui` support TypeScript 5.7 and later (`packages/typescript-floor`; `ai` 7's declarations need it).

**Typed EARS types are change-controlled.** `types/entities.ts`, `ears/runtime.ts`, `ears/typed.ts`, `types/sdk-entities.ts` and the generated `PackShapes`/`EntityName` are a specified contract that editor completions depend on. Don't widen or rewrap them to make a call site compile; fix the call site (explicit shape, `EntityName` constraint, `untypedQx` from `@abuddy/sdk/ears`). Read `packages/abuddy-sdk/TYPED-EARS.md` and follow its checklist, including checking completions, before any change.

### Data layer (EARS)

Custom entity-attribute-relation graph database backed by LMDB. All data lives in memory.

- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: a feature's `be/repository/index.ts` exports `<name>Queries`/`<name>Commands` objects (usually from `queries.ts`/`commands.ts`), declared in `abuddy.json` `features[].repositories` as `"path#export"`; code reaches them through `repository` from `#generated/repository`

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. Plugin code lives in `packages/default-setup/src/features/<name>/fe/`. Plugins come from `abuddy.json` `features[].plugin`: `generate-entries` writes them into `src/__generated__/pack-entry-fe.ts`, which the renderer imports through `virtual:built-in-packs` (external packs' load at runtime from `pack://<id>/runtime/fe.js`).

### Key patterns

- Every backend system must handle `CLIENT_CONNECTED` to send its plugin's startup data. The bus sends it to every system when a client connects, except systems of external packs with frontend code: those get it once the renderer has loaded the pack's frontend (`bus.packClientReady`), and again when its subscription reconnects
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### App environment

Environment identity and data paths come from one resolver, `@abuddy/sdk/env` (`resolveAppContext()`). Don't read `NODE_ENV`, `PLAYWRIGHT_TEST` or platform paths to decide which data dir to use.

- The Electron main process infers the environment once at startup (`packages/main/src/app-context.ts`): Playwright → `test`; packaged builds → the channel stamped by `build/build.sh` (`production` | `beta`; an unstamped packaged build refuses to start); source runs → `ABUDDY_ENV` if set, else `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process.
- Anything started without them throws instead of falling back to production. Manual API boots must pass both, pointing at a copy of user data: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`
- CLI commands pass `{ env }` explicitly (`install`/`uninstall`/`list`/`open` default to production; `-d`/`-b` select dev/beta).

### Migrations

Migrations live with their pack. default-setup's are in `packages/default-setup/src/migrations/`: each file exports a `PackMigration` (`@abuddy/sdk/framework`) with `target`, `description` and `up()`, listed in that folder's `index.ts` and registered with the pack. `packages/api/src/setup/migrations/index.ts` holds only the runners, called at boot after `onInit`:

- `runMigrations()` — built-in packs' migrations, run when `stored app version < target <= APP_VERSION`; records internal settings `version`.
- `runPackMigrations(externalPacks)` — each external pack's migrations, against that pack's own version (`stored < target <= manifest version`); records `packVersions[packId]`. External migrations never run in `runMigrations()`.

Rules for default-setup migrations (details in `packages/api/src/setup/migrations/CLAUDE.md`):

- **Target the next release version** — name the file after the version it targets (e.g. `0.2.4.ts` runs when the app is released as 0.2.4+). Several changes for one release go in the same file.
- **Never bump `package.json` version manually** — the release process handles version bumps. Migrations are written ahead of time to target the upcoming release.
- **List it in `packages/default-setup/src/migrations/index.ts`** — import and append to the `migrations` array in version order.
- **Idempotent guards** — always check if the change is needed before applying (e.g. `if (!value) set(value)`), since migrations may re-run after a reset.

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK 7 (model calls through `services.inference`: Anthropic, OpenAI, Google, Groq, Mistral, Cohere), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
