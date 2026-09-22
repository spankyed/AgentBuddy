# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server (`node:http` + `ws`) using tRPC: transport, process boot and the composition of the app runtime (`@abuddy/host`: XState actor systems, packs, services) over LMDB persistence (`@abuddy/ears/lmdb`)
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — the built-in pack: features, steps, and seed sources (actions, prompts, flows, library, notes, FAQs, settings) that `abuddy build` compiles into `packages/default-setup/dist/` from `abuddy.json` `boot.seed` (see `packages/default-setup/CLAUDE.md` and `docs/public-facing/seeds.md`)

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Release metadata

Do not edit release/version metadata unless the user explicitly asks for a release or version bump. This includes `package.json` version fields, `package-lock.json` root package versions, app version constants, release notes, changelogs, and generated release artifacts. The release process owns those changes.

## What to run after a change

Run the narrowest thing that could fail, and stop. The full chain exists for the merge, not for the
edit — running it after every change costs minutes and finds nothing the narrow check wouldn't.

| You changed | Run |
|---|---|
| one package's source | that workspace's `npm test -w <pkg>`, plus its typecheck if the change is typed |
| a spec | that spec file: `npx vitest run <path> --root packages/<pkg>` |
| a build script, bundler or gate | `npm test -w @abuddy/cli`, plus the one command whose output changed |
| a comment, a doc, a CLAUDE.md | nothing, unless a spec asserts the text (the door table) |
| an npm script | the one path that runs it, end to end, once |
| the renderer, the app's boot, or a pack's FE | `npm test -- <spec>` for the affected E2E, not the whole suite |
| a public export of `@abuddy/ears`, `/sdk` or `/ui` | `npm run api:update`, and commit `etc/` — `typecheck` fails until you do |
| anything, before you ask for a merge | the full chain, once |

That last row is the whole gate: **CI does not run, on purpose.** `.github/workflows/ci.yml` has its `push`
and `pull_request` triggers commented out while this is a single-contributor repo, so `gh run list` is empty
and always will be. That is not a failure to report, and CI is not a check to cite — the local chain is the
check. The workflow's header says when it goes back on.

Things that waste the most time, in order:

- **Running `npm run build` to test a change no build output depends on.** The renderer and API build
  from source; a CLI or SDK change does not need them rebuilt to be tested.
- **Running an E2E suite to find a bug you have a stack trace for.** A minified frame with a line and
  column is a solved problem: build once with `sourcemap: true` in the renderer's Vite config, decode
  the mapping, read the source. Do that before you grep, not after.
- **Re-running the full chain after a fix to a thing the chain already covered.** If the CLI suite
  caught it, the CLI suite proves the fix.
- **Reading the source twice to explain a bug the running app would show you.** A hang or a dropped
  event in the real app is worth one instrumented E2E run — a `console.error` in the failing path,
  `npm run build:be`, `DEBUG_E2E=1 npm test -- <spec> --grep "<title>"`. Two carefully argued
  explanations have been wrong where one such run was decisive. `tests/e2e/CLAUDE.md` has the method,
  including what to rebuild first and how to put the instrumentation back.
- **Running suites concurrently.** They share the package build lock and the build stamps, so a
  background `test:unit` racing a foreground `test:external-pack` produces failures that are about the
  race, not the code.

Three rules that pay for themselves:

- **Measure before you optimise, and before you accept someone else's measurement.** Two proposals in
  this repo were rejected by one command each, and both had been argued for at length first.
- **A mutation check is worth more than a re-run.** Breaking the thing on purpose and watching the
  right test fail proves more than running the whole suite again.
- **A comment is for whoever opens the file cold, not for whoever reads the diff.** What changed, how many
  copies there used to be, what you measured to decide, why some other value would be worse — that is
  commit-message material, and the commit message is where someone looks when they ask why. The test: will
  this sentence still be true, and still worth reading, a year from now, to a reader who never saw the
  change? "Three modules did X" needs rewriting the first time a fourth one does, and usually goes stale
  before it lands. "This replaces the default rather than capping it" does not. Keep what the code cannot
  say: why a non-obvious choice was made, what breaks if you undo it, and the condition that would make a
  recorded tradeoff worth revisiting.

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
npm run typecheck:ears   # @abuddy/ears only
npm run typecheck:sdk    # @abuddy/sdk only
npm run typecheck:host   # @abuddy/host only
npm run typecheck:ui     # @abuddy/ui only
npm run typecheck:cli    # @abuddy/cli + @abuddy/testing
npm run typecheck:scripts # scripts/ and tests/
npm run typecheck:pack   # @app/default-setup only
npm run check:ui-entries # Fails on a stale @abuddy/ui exports map or a component without an entry

npm test                 # Playwright E2E tests
npm run test:unit        # Vitest, every suite CI calls a unit test: @app/api, @app/default-setup, @abuddy/sdk,
                         # @abuddy/ears, @abuddy/host, @app/main, @app/renderer, then @abuddy/cli (the slowest,
                         # last).
                         # The CLI suite rebuilds the published packages itself when its dist is stale
npm run test:all         # test:unit, then the E2E tests
npm run bench -w @abuddy/ears    # EARS engine benchmark (baseline and tolerance: packages/abuddy-ears/CLAUDE.md)
npm run test:external-pack       # Build the fixture packs in tests/fixtures with the CLI and run their tests (needs npm run build)
npm run test:packaged-authoring  # Author, build, test and install a pack outside the monorepo from the packed @abuddy/* tarballs (needs npm run build)
npm run compile          # Build packages/default-setup (abuddy build: compiled seeds, snapshot, types; DSL defs; dist/runtime/index.cjs)

npm run db:query -- "<code>"   # abuddy db query on the dev app's data (also db:exec, db:repl, db:inspect,
                               # db:export, db:import, db:reset, db:clear-settings; the app closed for changes)

# Published API surface (from the root for all three, or inside one of the packages for just it)
npm run api:check        # CI: fails if a public entry's API changed without updating reports
npm run api:update       # Dev: regenerate etc/<entry>.api.md (and etc/<entry>.component.md for UI components),
                         # and record the declarations they came from in etc/declarations.sha256
                         # Both read an @abuddy dependency's built declarations: npm run packages:build first
                         # All three take ~46s (ui is 33s of it), which is why api:check is a before-merge
                         # and CI check rather than a per-edit one
npm run check:api-stamp  # The cheap half, run by npm run typecheck: compares the built declarations with
                         # etc/declarations.sha256 in ~0.6s and says "run npm run api:update" when they
                         # differ. The reports are a pure function of those declarations, so unchanged
                         # declarations mean unchanged reports. It hashes only dist/**/*.ts (.d.ts and
                         # UI's .d.vue.ts) — never the compiled .js, which changes when a function body
                         # does. api:check stays the authority; this only says when to run it

# Built-in pack facade types (after `abuddy build`; from packages/default-setup or with -w @app/default-setup)
npm run facade:check     # CI: fails if dist/types/pack-types.d.ts changed without updating etc/pack-types.api.md
npm run facade:update    # Dev: regenerate etc/pack-types.api.md

# Manifest JSON schema (-w @abuddy/sdk)
npm run generate:schema  # Regenerate packages/abuddy-sdk/abuddy.schema.json from manifest-schema.ts
npm run schema:check     # Fails if abuddy.schema.json is stale

npm run packages:build   # Build dist/ for @abuddy/ears, @abuddy/sdk and @abuddy/ui, bundle @abuddy/cli and @abuddy/testing
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

- **Backend → Frontend**: `sendToPlugin(name, event)`, in a system's actions or anywhere else; actions use `services.emitter.sendToPlugin`
- **Frontend or backend → System**: `sendToSystem(systemId, event)`, typed with the events each system declares (own systems by feature id, a dependency's as `<dependency>/<feature>`; actions name every system `<pack>/<feature>`)
- **System → System**: `sendToSystem(name, event)`, the same typed send a plugin uses; no pack code looks up another system's actor. `sendToSystem({ role }, event)` reaches whichever system plays a role (`{ role: 'brain' }` with `TRIGGER_BRAIN_EVENT` fires a flow event), and `host/bus` takes `PACK_CHANGED` (`HostSystemEvents`)
- **Child actors are private**: a feature spawns its children with an `id` and no `systemId`, and reaches them through its own snapshot's `children`; another feature sends the feature an event, which it routes to the child (the code plugin routes `<child>.*` events by prefix)
- **Frontend**: a component reaches its own plugin with `usePlugin()` (`@abuddy/sdk/fe`); the host renders each plugin's canvas, panel and chat in a `PluginScope` for it, and the settings plugin renders each plugin's settings in one. No pack code looks up another plugin's actor: a feature offers other features what they need (its state as composables, the events it takes) from its `fe/public.ts`, and `check:specifiers` (`findCrossFeatureImports`) rejects importing another feature's frontend anywhere else. `navigateToPlugin` (`#generated/fe`) takes only the names the pack can write (`PluginName`: its own features, its dependencies' `<pack>/<feature>`), so a misspelled target doesn't compile; a target that arrives as data (a link block's) opens through `openPlugin(ref, event?)` (`@abuddy/sdk/fe`), which refuses a string that isn't a ref and asks the shell to open the rest: the shell waits for a plugin whose pack's frontend is still loading, and tells the user about a ref no pack provides once loading has settled
- Pack code takes `sendToPlugin`/`sendToSystem` from `#generated/events`; `onConnected`/`onIncoming` come from `@abuddy/sdk/events`. `check:specifiers` rejects the host's raw event paths (its root event bus and API client) and the untyped sends in pack sources
- **Addressing is an envelope**: a send is a message, `{ to, event }`, and `event` arrives exactly as the sender wrote it, so an event may carry any field, `pluginId` or `systemId` included. The bus, the API's `bus.send` and its subscription, and the renderer route on `to`; messages sent in go to systems, messages sent out to plugins.

Systems define their incoming, internal and outgoing event unions (`defineSystem<Incoming | Internal, Outgoing>()`). System code lives in `packages/default-setup/src/features/<name>/be/system.ts`; its identity is its feature's, from `abuddy.json`, which codegen passes to `packSystem`; a feature's designation comes only from `abuddy.json` `features[].designation`, and is a role rather than a name: it need not equal the feature id. The bus machine is `createBusMachine` in `packages/abuddy-host/src/bus`; `createAppBus(registry)` there composes it with the app's root event bus (the api's tRPC event sources), and `packages/api/src/setup/backend.ts` starts it. Systems register through the app's registry (`createPackRegistry()` in `packages/abuddy-host/src/packs/pack-registration.ts`, its `registerPack()`). Every pack's systems and plugins run under `<packId>/<featureId>`, built-in packs included — the app itself is the pack `host` (`host/bus`, `host/application`, `host/packs`), so there is no namespace of bare ids and a pack can't take the id `host`. Pack code names features — its own by id, every other (the host's too) as `<packId>/<featureId>`; the ref it runs under is spelled the same, so a bare name is only short for the pack's own: the sends (`sendToPlugin`/`sendToSystem`) and `navigateToPlugin`, generated in `#generated/events` and `#generated/fe`, resolve the name (`resolveName`, `@abuddy/sdk/ids`, is the one rule; `splitRef` takes a ref apart). The registries resolve what registrations name: a pack registers its `features` keyed by feature id on both sides (`PackRegistration.features`: each one's system, plugin, role, services and settings; `PackFERegistration.plugins`), each registry runs every feature at its ref, and both refuse a key that isn't a feature id (`FEATURE_ID_PATTERN`, `@abuddy/sdk/ids`).

### SDK packages

`@abuddy/sdk` is the pack-facing API; host-only modules live in the private `@abuddy/host` (`packages/abuddy-host`). Packs, built-in or external, import only `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/ui`; host code (api, renderer, CLI and testing) also uses `@abuddy/host`; default-setup, tests included, does not depend on it. `npm run check:specifiers` rejects `@abuddy/host` in pack sources and CLI templates, and `abuddy build` fails a pack bundle that imports it. Pack code reads relations with `findRelations`/`getRelationStats` and queries untyped with `untypedQx` (`@abuddy/ears`), reaches host-implemented data operations through `services.appData` (reset, backup export/import, whether the user finished onboarding), `services.traceStore` (the volatile trace store), `services.secrets` (the user's API keys as metadata: list, select, rename, delete; never values) and `services.filesystem` (files and folders on disk, as text), and calls models through `services.inference` (AI SDK 7's `generateText`/`streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe` and `rerank`, with `provider:model` ids checked against `providerCapabilities`, `output` as an `Output` or plain data like `{ type: 'object', schema }`, and the key the user selected per provider, never the environment; packs import pure pieces like `tool` from `ai`).

Layers, each importing only the ones above it (`check:specifiers`, `findUpwardImports`, and each `package.json`'s `@abuddy` dependencies):

| Layer | Holds |
|---|---|
| `@abuddy/ears` | the engine, the EARS types, the persistence port (`/lmdb`: the LMDB store) |
| `@abuddy/sdk` | the pack contract and pack runtime: registries of what packs registered, the services' contracts, event sends, logging and error reports over the bound bus, the SDK entities and their repositories, the `HostRuntime` port |
| `@abuddy/host` | the app runtime: the five app services (`/services`), app state (`/app-state`), what the app runs (`/packs` and `/packs/runtime`, `/bus`, `/migrations`, `/secrets`), the app shell and the frontend's registered packs (`/fe`), and its database opened outside it (`/database`) |
| `packages/api` | transport (`node:http`, `ws`, the tRPC routers, the log stream), process boot and composition (`setup/backend.ts`) |
| `packages/renderer` | the frontend composition: binds the frontend port, and composes the host's shell with the window's I/O (the API client, the pack loader, storage, the toast and error page) |

What crosses to the app follows one rule, **bind resources, derive behaviour**. A resource has identity per running app (the event bus, the engine and its data, the registered packs, services doing I/O on user data or keys) and is a `HostRuntime` member; behaviour over a resource is SDK code, written once for the app, tests and tooling. So event sends, logging and error reports are SDK code over the bound bus, not host implementations. `services` holds seven host services (`HostServices`, reserved names in host's `pack-registration.ts`): the SDK implements `logger` and `emitter` over the bound bus and `repository` from the bound engine, and the app implements four, `appData`, `traceStore`, `inference` and `secrets`: contract types in `@abuddy/sdk/services/<name>.ts`, implementation in `@abuddy/host/services/<name>.ts`, test doubles in `@abuddy/sdk/testing`'s in-memory runtime (`fakeInference`, `addTestSecret`). Host-only modules (`/app-state`, `/migrations`, `/packs/runtime`, `/bus`, `/secrets`) aren't reachable from the SDK.

- `@abuddy/ears` (`packages/abuddy-ears`, see its CLAUDE.md) — the EARS engine, published like the SDK and imported by no other `@abuddy` package: `tx`, `defineEars`, `grantRole`, `repository`/`registerRepository`, the core `EARS` namespace (`Entity = { Relation }`), `BaseEntity`/`EntityShapes`/`ShapeOf`/`EntityNameArg`, etc. The engine is an instance: `createEarsEngine({ persistence?, isEntityType })` returns a new, empty engine that owns its stores, indexes and caches (no `@abuddy/ears` module keeps data at module scope, `tests/no-module-state.spec.ts`), with two faces: `query` (`qx`, `tx`, the finders, relation reads, graph walks, the repository registry) and `admin` (`clear`, `bulkLoadAttr`, direct attribute and relation writes, `edgeStore`, the relation index, the entity-type checker), which only its creator holds. The free functions (`untypedQx`, `tx`, `repository`, the `defineEars` facades…) act on the engine installed with `installEngine(query)` and throw, naming the fix, when none is: `bindHost` installs the app's (`HostRuntime.ears`), `startTestRuntime` a test engine (`resetTestData` replaces it, keeping repositories), and tooling installs or passes its own (`exportFlowsToDSL(dir, { engine })`). A pack's repositories arrive in its registration (`PackRegistration.repositories`), and the host registry's `registerPack` registers them with the installed engine. It's a shared-instance package with the SDK: `SHARED_INSTANCE_PACKAGES` in `@abuddy/host/build/shared-deps` is the one list the bundler externals, the pack loader's bridge (generated `packs/runtime/shared-modules.ts`, `npm run shared-modules:update -w @abuddy/host`), the harness bridge and `bundle-package` derive from; `check:specifiers` rejects those consumers naming the packages themselves, and upward imports (`@abuddy/ears` imports no `@abuddy/*`, `@abuddy/sdk` only `@abuddy/ears`, `@abuddy/host` only those two and never the API).
- What the SDK adds to the engine: its `EARS` (the engine's types plus `SDK_ENTITIES`/`SDK_REL_KINDS`) and the SDK entity shapes, from `@abuddy/sdk/types` (and the root), and the SDK entities' repositories from `@abuddy/sdk/repositories` (`flowRepository`, `tnodeRepository`, `actionRepository`, `promptRepository`; default-setup's flows, actions and prompts repositories build their views over them). Packs get typed `qx`/`tx`/`find*`/`createEntityWithDefaults`/`updateEntity`/`getAttr` from `#generated/ears` (a literal entity name must be one the pack or its dependencies declare, its `EntityName`; a name typed `string` passes unchecked; ids from typed queries carry their entity type, a plain `EARS.EntityId` is accepted anywhere; `tx` checks declared fields' values when it knows the entity; the SDK owns Relation and the flow model (Flow, Node, TNode, Action, Prompt), defined in `abuddy-sdk/src/types/sdk-entities.ts`, and no pack declares them; Settings is default-setup's, and the host declares `AppState`, which packs never see), `repository` (typed with the repositories declared in `abuddy.json` `features[].repositories`) from `#generated/repository`, and `sendToPlugin` (keyed by receiving plugin; `features[].system.sendsTo` adds cross-plugin sends) and `sendToSystem` (keyed by receiving system; a pack without systems sends to its dependencies') from `#generated/events`. Systems default-export their entry with `satisfies SystemEntry`, which keeps the spec's events for the generated types. `abuddy build` bundles a pack's facade types into `dist/types/pack-types.d.ts` (and its snapshot), so dependents' facades include them. `check:specifiers` rejects raw `sendToPlugin`/`sendToSystem` imports and `registerRepository` from `@abuddy/ears` in pack sources.
- `@abuddy/ears` also holds the persistence port (`PersistenceSink`, `Partition`/`PartitionPolicy`/`makePolicy`, `makeShardedPersistence`). `@abuddy/ears/lmdb` is the LMDB store: `openLmdbStore({ paths, policy })` returns the store (`sink`, `envs`, `hydrate`, `query`, `close`, `reopen`, `reset`); nothing opens on import. `lmdb` is an optional peer of `@abuddy/ears` that the app installs (`packages/api` keeps it as a dependency for the packaged app). Only `/lmdb` imports `lmdb`: the api's composition (`openAppStore()` in `setup/backend.ts`) opens the store with the app registry's `partitionPolicy` (and `engine: () => engine.admin`, which the store hydrates into and reads relation details from), creates the engine with `store.sink` as its persistence, and binds `createHostRuntime({ store, engine, packs, … })`; host code (`@abuddy/host/services`, `/backup`) takes the store, and the engine's `admin` face, as arguments; packs, pack tests and the pack bridges never load it (`APP_ONLY_EXPORTS`); `check:specifiers` (`findLmdbImports`) enforces it. No code reaches engine state except through an engine's `admin`, and no source imports an admin write from `@abuddy/ears` (`abuddy-ears/tests/no-engine-state-access.spec.ts`).
- `@abuddy/sdk/events` — messaging: `sendToPlugin`, `sendToSystem` (a system by ref, or `{ role }`), `onConnected`, `onIncoming`, `defineEvents` and the event map types (`HostPluginEvents`, `HostSystemEvents`). Frontend-safe; shared with pack frontends as the `sdkEvents` global. It sends over the bound app's bus (`HostRuntime.transport`), or in the renderer over the frontend port's `client`. `sendToPlugin` (and `services.emitter.sendToPlugin`) goes through the bus actor, so it's dropped until a client connects.
- `@abuddy/sdk/logger` — `createLogger(source, { debug? })` (debug gated per source by `setDebugEnabled`), `reportError` (a system error, sent to the app as `SYSTEM_ERROR`, or with `step` a flow step's error recorded on its TNode) and `onLog`. SDK code over the bound bus: a logger emits redacted log events there (the api prints each once), and with no app bound (the CLI, tooling) writes to the console. Backend pack code doesn't call `console.*` (`check:specifiers`).
- `@abuddy/sdk/templates` — `executeTemplate`, `createTemplateResolver`. `@abuddy/sdk/env` — `resolveAppContext`, `getAppVersion`. `@abuddy/sdk/runtime` — the one port to the app: `HostRuntime` (`transport.rootEvents`, `ears`, `packs`, `appVersion`, `services`: `appData`, `traceStore`, `inference`, `secrets`, `filesystem`, and the optional `redaction`, which tells log redaction which runs of characters are key values this process used — absent in a runtime with no secrets of its own), bound once per process with `bindHost` (the api binds `createHostRuntime(...)`, `startTestRuntime` an in-memory one), and the renderer's `bindFeHost({ application, secrets, client, packs })`; an unbound use throws naming them. The registered packs are an instance too: the program that assembles an app creates one (the api's composition root `createPackRegistry()`, the renderer `createFePackRegistry()`, the harness one per test file, the CLI one per build) and binds its read face (`PackRegistryView`, `FePackRegistryView`); the SDK's registries of what packs registered (designations, steps, artifacts, blocks, seed hooks, seeders, feature settings defaults, commands, pack services, and in the renderer tiptap plugins and DSL types) read the bound one, and no SDK or host module keeps them at module scope. Everything a pack contributes arrives in its `PackRegistration`/`PackFERegistration` (seeders and DSL types included); there's no registry for pack code to write to. Contexts without an app (SDK specs, a pack test filling a registry directly) use `testPacks` from `@abuddy/sdk/testing`. Also the `@internal` `_rootEvents` (the bound bus). `secretsClient` (`@abuddy/sdk/fe`) reads the frontend port's `secrets`; no general API client reaches the SDK.
- `@abuddy/sdk/fe` — pack-facing: `Plugin`, `PackFERegistration`, `safeEvents`, `usePlugin`/`PluginScope` (`fe/actor-system.ts`), `useShell` (`fe/shell.ts`: the app shell's state and commands, typed by `HostShell`; no pack code holds the shell's actor), `openPlugin` (`fe/navigation.ts`), `secretsClient`, etc.
- `@abuddy/host/fe` — host-only: `createFePackRegistry()`, the renderer's registered pack frontends (`registerPackFE`, `getRegisteredPlugins`, app extensions); `createShellMachine`, the app shell over the I/O it's given (`ShellClient`, pack frontends, storage, notify, the event target), which the renderer composes with the window's and a test with fakes.
- `@abuddy/host/packs`, `/packs/runtime`, `/packs/dev-server`, `/backup`, `/build/discover`, `/build/shared-deps`, `/build/source-resolution` — pack registration (`createPackRegistry()`: the registered packs as an instance, with their partition policy and shutdown hooks), discovery, registry, installer, updater, pack layout and module bridge (the CLI imports this barrel, which never imports `/packs/runtime`); the pack runtime the app runs, on the registry it's given (loader, SDK bridge, lifecycle, reload, seeding, the host `packs` system); the `abuddy dev` server marker the `pack://` handler proxies to; backups of the LMDB store; build-time pack discovery and host-shared dependency lists; the `@abuddy/source` condition helpers and the check that a process resolves workspace source, not `dist`.
- `@abuddy/host/process-liveness` — what a running process left on disk and whether it is still there: `lockIsHeld`, `recordIsStale`, and `readApiEndpoint` for the port file a running API publishes. The app's own plumbing, so packs never reach it.
- `@abuddy/host/bus` — `createBusMachine`, the backend bus (spawns registered systems, routes events, pack activate/teardown/reload), `createAppBus()`, the app's composition of it, and `receiveClientEvent()`, the check, log and send behind the API's `bus.send`. It never imports the pack loader; the pack test harness runs the same machine.
- `@abuddy/host/migrations` — the app's migrations runners (`runAppMigrations`, `runPackMigrations`; see Migrations below). Host-only, never bridged to packs.
- `@abuddy/host/services` — the host's implementations of the services packs reach through `services` (`app-data.ts`, `trace-store.ts`, `inference.ts`, `secrets.ts`, `filesystem.ts`, each named after its contract and delegate in `@abuddy/sdk/services`). `createHostRuntime({ store, engine, transport, appVersion, packs })` (`services/index.ts`) is the only place the app's `HostRuntime` is assembled, over the LMDB store (`appData` and `traceStore` use it); the API's composition binds it. `appData.reset()` resets the whole app: stores and keys, each pack's `onInit` and boot seed, then the host's `runAppMigrations(registry)`. `src/services` holds only those five services and the index (`tests/boundaries.spec.ts`). A service's implementation never lives in the API, which keeps only transport, process boot and composition (`packages/api/tests/unit/source-layout.spec.ts` lists its files); the API's tRPC procedures delegate to host (`receiveClientEvent`, `secretsStore`/`secretsSnapshot`, `getLoadedPackEntries`).
- `@abuddy/host/app-state` — host-only: the app's own state, one `AppState` row (`hasOnboarded`, `version`, `packVersions`, `packSeedHashes`, `seedHashes`, `seedStatFingerprints`) that only host code reads and writes (`appState`); the host registers the entity type next to the SDK's (`HOST_ENTITY_TYPES`). Packs learn whether the user onboarded through `services.appData.hasOnboarded()`/`completeOnboarding()`, the renderer through the application plugin's `CLIENT_CONNECTED`. Resetting settings doesn't touch it; `appData.reset()` empties it with the rest.
- `@abuddy/host/secrets` — host-only, never bridged to packs: the store of the user's API keys (metadata plain, values AES-256-GCM encrypted in `secrets.json`, the data key in a `KeyVault`: the OS credential store via `@napi-rs/keyring`, or a file in the test environment or after the user allows unprotected storage). Values reach it only through the API's `secrets.*` tRPC procedures, off the event bus (`forwardSecretsChanges()` tells the settings system that keys changed, never their values); inference reads them with `secretsStore.keyFor(provider)`. The API logger and error reports redact key-shaped strings.
- `@abuddy/ui` (`packages/abuddy-ui`) — Vue components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`). Published as compiled JS (tsdown, with vue-tsc declarations). Packs use the host's copy at runtime: the renderer exposes every export on `window.__abuddy` and the pack FE bundler proxies `@abuddy/ui` imports, unless `abuddy.json` sets `fe.bundleUi`. Contracts and host-shared state (`useShell`, menu state, the tiptap plugin and DSL type lookups) stay in `@abuddy/sdk/fe`; `@abuddy/sdk` must not import `@abuddy/ui`.
- `@abuddy/sdk/utils` — **Node-only**: re-exports everything (pure + Node-dependent). Backend code imports from here.
- `@abuddy/sdk/utils/pure` — **environment-agnostic**: pure utilities only (`compareVersions`, `detectChanges`, `BinaryOperator`, `toMap`, `randomId`, etc.). Frontend/renderer code must import from this path (or a specific sub-path like `@abuddy/sdk/utils/compare-versions`), never from `@abuddy/sdk/utils`.

The freshness rule itself lives in `@abuddy/host/build/packages-built`, and everything that needs it imports it by that name: a relative import of a repo-root script would put the repo root into `@abuddy/testing`'s declaration emit and move every declaration its bundle publishes. `scripts/ensure-packages-built.ts` is only the command over it. The packages' build scripts live in the repo's `scripts/` for the same reason — `build-package.ts` (`@abuddy/ears` and `@abuddy/sdk`, which build alike) and `build-ui-package.ts` — so that no package's own `scripts/` imports a package above its layer, and the layer rule holds as written rather than through a re-export.

Relative imports in `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/host`, `@abuddy/ui` and `@abuddy/testing` name the `.ts` source (`./query.ts`); tsc (`rewriteRelativeImportExtensions`) and tsdown write `.js` into the output. `npm run check:specifiers` (part of `npm run typecheck`) rejects relative `.js` specifiers there. Workspace tsconfigs that compile this source need `allowImportingTsExtensions`. Generated pack code (`generate-entries`) keeps `.js`.

When adding new utils, put pure functions in the appropriate file under `utils/` and re-export from `pure.ts`. Node-dependent code stays in the existing Node modules and is re-exported only from `index.ts`.

`@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` publish their workspace `package.json`. Each export resolves source under the `@abuddy/source` condition and `dist/` otherwise. **A host config declares that condition outright; a pack's config declares none.** The host configs name it — tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, esbuild/tsup `conditions`, `node --conditions` (the CLI bin's resolve hooks in source mode, the API process the app spawns from source) — and nothing infers it from an install. `npm run check:specifiers` fails a host config that omits it and a pack config that declares it. Two tables in `scripts/check-import-specifiers.ts` record the configs that do the opposite on purpose, each with its reason, and report an entry that has stopped applying: `RESOLVES_DIST_BY_DESIGN` (host configs resolving `dist`, such as the API Extractor tsconfigs) and `DECLARES_SOURCE_BY_DESIGN` (pack configs declaring the condition). The second is empty and meant to stay much the smaller of the two: it is for a host-side config that physically sits in a pack's tree, which is usually better moved out, and never for making a pack's own build work — that pack would then build unlike every pack author's, which is the failure the rule exists to prevent. Its doc comment has the full rule.

A pack — built-in (`packages/default-setup`), fixture (`tests/fixtures/*`) or external — is built and tested by `abuddy build` and `abuddy test`, which resolve the `@abuddy` packages' published `dist`: the one layout a pack author ever has. The app's own builds are host builds and compile that same pack's sources with the condition (`renderer/vite.config.ts`, `api/tsup.config.ts`), so in a checkout that `dist` has to exist and match the source beside it: `npm run packages:ensure` (`scripts/ensure-packages-built.ts` over `@abuddy/host/build/packages-built`) rebuilds it when `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/ui`, `@abuddy/testing` or `@abuddy/cli` is stale, and `npm run typecheck`, `npm test`, `npm run build`, `npm run compile`, `npm run typecheck:pack` and `npm run test:external-pack` all run it first, as `abuddy test` and `abuddy dev` do for a pack linked to a checkout. `@abuddy/testing` resolves its built bundle whoever loads it, the repo's own E2E included, so the fixture a pack runs is the one this repo runs. While `npm start` is running, the renderer and the API follow your `@abuddy` source edits live (both declare the condition), but everything `abuddy build` produced for the built-in pack — its compiled seeds, facade types, step build and seed runtime — was made against `dist` as it stood when the command ran, and default-setup's own tsconfig declares no condition, so your editor type-checks it against that `dist` until something rebuilds it. `packages/abuddy-testing/CLAUDE.md` lists every entry point that does. Node commands that load workspace source run through `node scripts/with-source.mjs <command>`, which appends the condition to `NODE_OPTIONS` (`npm test`, the api's `db:*` scripts); run Playwright through `npm test -- <args>`, which carries the condition. The CLI and the API's dev boot fail when they would resolve a checkout's `dist` instead of its source. `npm run packages:build` writes `dist/`; `npm run exports:update -w @abuddy/ui` regenerates the UI exports map after adding or removing a module. To publish a `@abuddy/ui` component, add a `.ts` entry module next to it (`design/button.ts`: `export { default } from './button.vue'; export * from './button.vue';`) and run `exports:update`. TypeScript can't resolve an exports target that is a `.vue` file, so the entry is what consumers import. SFCs without an entry are internal: other `@abuddy/ui` files import them by relative path, and `exports:update` fails if code outside `@abuddy/ui` imports one.

When adding new EARS or FE exports, put them in the correct barrel. Tag exports only the host uses `@internal` and name them `_x`: the underscore is what makes the boundary checkable, so pack code importing one fails `check:specifiers` (and `abuddy build`, for an external pack). A pack that needs one needs it promoted to public API instead. After changing public exports, run `npm run api:update` in `packages/abuddy-sdk` (or `packages/abuddy-ears`, `packages/abuddy-ui`) and commit the updated `etc/*.api.md` reports. A UI component's props, emits, slots and exposed members are reported in `etc/<entry>.component.md`, so changing them needs `api:update` too. The pack-facing SDK exposes no `any` (`published-sdk-any.spec.ts` fails when an export does; use `unknown` or a generic); `@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` support TypeScript 5.7 and later (`packages/typescript-floor`; `ai` 7's declarations need it).

**Typed EARS types are change-controlled.** `abuddy-ears/src/{entities,runtime,typed}.ts`, `abuddy-sdk/src/types/{entities,sdk-entities}.ts` and the generated `PackShapes`/`EntityName` are a specified contract that editor completions depend on. Don't widen or rewrap them to make a call site compile; fix the call site (explicit shape, `EntityName` constraint, `untypedQx` from `@abuddy/ears`). Read `packages/abuddy-sdk/TYPED-EARS.md` and follow its checklist, including checking completions, before any change.

### Data layer (EARS)

Custom entity-attribute-relation graph database (`@abuddy/ears`) backed by LMDB (`@abuddy/ears/lmdb`). All data lives in memory; the store persists writes and hydrates them at boot.

- `createEarsEngine()` — an engine instance (the app creates one at boot; tests and tooling create their own)
- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: a feature's `be/repository/index.ts` exports `<name>Queries`/`<name>Commands` objects (usually from `queries.ts`/`commands.ts`), declared in `abuddy.json` `features[].repositories` as `"path#export"`; code reaches them through `repository` from `#generated/repository`
- A pack's repository can expose another package's repository methods (default-setup's `actionQueries.byId` is the SDK's `actionRepository.byId`), so its code reaches its data through `repository` alone. It takes them by reference (`byId: actionRepository.byId`), never wrapped in a function that re-declares the signature, and adds its own views beside them
- Each entity's repository lives with the package that declares it: the SDK's entities' in `@abuddy/sdk/repositories`, a pack's in its features, the host's `AppState` in `@abuddy/host/app-state`. No package reads another's repositories through a cast of the registry (`repository as unknown as` fails `check:specifiers`, `findRepositoryCasts`)

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. Plugin code lives in `packages/default-setup/src/features/<name>/fe/`. Plugins come from `abuddy.json` `features[].plugin`: `generate-entries` writes them into `src/__generated__/pack-entry-fe.ts`, which the renderer imports through `virtual:built-in-packs` (external packs' load at runtime from `pack://<id>/runtime/fe.js`).

### Key patterns

- Every backend system must handle `CLIENT_CONNECTED` to send its plugin's startup data. The bus sends it to every system when a client connects, except systems of external packs with frontend code: those get it once the renderer has loaded the pack's frontend (`bus.packClientReady`), and again when its subscription reconnects
- The bus sends every running system `PACK_CHANGED { packId }` once a pack is activated, reloaded or torn down, or its seeds are imported; systems listing what packs register or seed send their data again
- When a feature's settings change (any way: a setting, the settings replaced or reset, a pack's defaults), default-setup's settings system sends its system `FEATURE_SETTINGS_UPDATED { settings, changes }` and its plugin `FEATURE_SETTINGS_UPDATED { settings }`. The SDK declares it for every system (`SystemEvents`) and plugin (`PLUGIN_EVENT_TYPES`), so no pack does, and the bus drops one to a feature running no such actor without a warning
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### App environment

Environment identity and data paths come from one resolver, `@abuddy/sdk/env` (`resolveAppContext()`). Don't read `NODE_ENV`, `PLAYWRIGHT_TEST` or platform paths to decide which data dir to use.

- The log directory is the one app path the resolver doesn't give you: only the Electron process can ask the platform for it. `packages/main/src/app-context.ts` resolves it once — `app.getPath('logs')`, or `<userDataDir>/logs` when the run was given its own data dir — and hands it to electron-log, to the API (`AGENTBUDDY_LOG_DIR`) and to the IPC that opens the log file, so none of them decides it for itself.
- The Electron main process infers the environment once at startup (`packages/main/src/app-context.ts`): Playwright → `test`; packaged builds → the channel stamped by `build/build.sh` (`production` | `beta`; an unstamped packaged build refuses to start); source runs → `ABUDDY_ENV` if set, else `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process.
- Anything started without them throws instead of falling back to production. Manual API boots must pass both, pointing at a copy of user data: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`. Such an API makes up its own token and writes it to `<copy>/api-token`; send that to call it.
- The API takes calls only with a token. Electron main creates one per app run and passes it to the API (`ABUDDY_API_TOKEN`); an API started without one makes up its own; the app's windows read it through the preload (`api:token`) and send it when connecting, and in development (or when it made up its own) the API writes it to `apiTokenFile` for local tools (`abuddy dev`, default-setup's watcher), which send it in `API_TOKEN_HEADER`. That header and the address the API listens on (`API_HOST`, `127.0.0.1` only) are defined once, in `@abuddy/sdk/utils/pure`, so the renderer's client uses the same ones.
- CLI commands pass `{ env }` explicitly (`install`/`uninstall`/`list`/`open` default to production; `-d`/`-b` select dev/beta).

### Migrations

Migrations live with their pack; the host's own (the app's state) live in `packages/abuddy-host/src/migrations/app/`. default-setup's are in `packages/default-setup/src/migrations/`: each file exports a `PackMigration` (`@abuddy/sdk/framework`) with `target`, `description` and `up()`, listed in that folder's `index.ts` and registered with the pack. `@abuddy/host/migrations` (`packages/abuddy-host/src/migrations/index.ts`) holds only the runners, which the API's boot and host's `services.appData.reset()` call through `startPacks()` (after the packs' `onInit`, before the seeds), and a backup import after reloading the data:

- `runAppMigrations(registry)` — the host's own app migrations (moving the app's state, and every pack's stored plugin settings onto their plugins' refs), then the built-in packs' in the app's registry, run when `stored app version < target <= app version` (`getAppVersion()`, the bound runtime's); records `AppState.version`. A prerelease counts as its release (`0.3.15-beta.2` runs the `0.3.15` migrations, again on each new beta), and a development build (`ABUDDY_ENV=development`) runs every pending migration on every boot. A failed migration stops the rest and records nothing, and `startPacks()` then runs no pack migration or seed; the next boot retries. Data with no recorded version is new and at the app version (after the host's migrations moved any older one).
- `runPackMigrations(externalPacks)` — each external pack's migrations, against that pack's own version (`stored < target <= manifest version`); records `AppState.packVersions[packId]`. External migrations never run in `runAppMigrations()`.

Rules for default-setup migrations (details in `packages/abuddy-host/src/migrations/CLAUDE.md`):

- **Target the next release version** — name the file after the version it targets (e.g. `0.2.4.ts` runs when the app is released as 0.2.4+). Several changes for one release go in the same file.
- **Never bump `package.json` version manually** — the release process handles version bumps. Migrations are written ahead of time to target the upcoming release.
- **List it in `packages/default-setup/src/migrations/index.ts`** — import and append to the `migrations` array in version order.
- **Idempotent guards** — always check if the change is needed before applying (e.g. `if (!value) set(value)`), since migrations run again on every development boot, on each beta of their release, and after a reset.

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK 7 (model calls through `services.inference`: Anthropic, OpenAI, Google, Groq, Mistral, Cohere), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
