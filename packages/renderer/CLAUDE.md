# @app/renderer

The Vue 3 app every AgentBuddy window runs. It hosts plugins; it doesn't implement them. Built-in plugins come from `packages/default-setup` (compiled in), and external packs' plugins load at runtime from `pack://`. The renderer owns the application actor, the tRPC client, the pack frontend loader, the shared-dependency globals packs import through, the layout shell and the Packs view. The root `CLAUDE.md` covers the plugin model; `docs/public-facing/architecture.md` ("Frontend boot", "Host dependency sharing") covers pack loading from a pack author's side, and `packages/abuddy-host/src/packs/runtime/CLAUDE.md` covers the backend half.

## Boot (`src/main.ts`)

Its static imports are evaluated first: `virtual:built-in-packs` loads every built-in pack's FE entry, and `virtual:host-deps` assigns `window.__abuddy`, so both are in place before pack code runs. The body then runs with a top-level `await`, in this order:

1. Installs `window.error` / `unhandledrejection` reporters (`electronAPI.rendererLog.write`, `fatal: true`). Reads `?popout=plugin&pluginId=…` (set by main's `plugin:popout`).
2. Sets `window.appVersion` (`__APP_VERSION__`, the root `package.json` version) and runs `runFrontendMigrations()` (`src/setup/migrations/index.ts`: localStorage migrations run before the actor reads its keys; the version is stored under `agentbuddy-fe-version`).
3. Built-in packs: calls each loader in `virtual:built-in-packs` and `fePacks.registerPackFE(mod.default)`, without a pack id, so they can't be unregistered. `fePacks` (`src/core/fe-host.ts`) is this window's registered pack frontends, `createFePackRegistry()` from `@abuddy/host/fe`: the pack loader registers external packs' in it, `App.vue` reads the `welcome` app extension from it, and the SDK's frontend registries (steps, designations, tiptap plugins, DSL types) read it once bound.
4. Creates the application actor with `systemId: 'host/application'` (its machine id stays `application`, which its `#application.…` targets name) and input `{ plugins: [...fePacks.getRegisteredPlugins(), packsPlugin], defaultPlugin: fePacks.getRegisteredDefaultPlugin(), initialPluginId, ownsLastActivePlugin: !popout }` (a main window opens on the plugin last open and records the one it opens; a popout does neither). It is exported as `applicationState`.
5. Binds the SDK's frontend port, `bindRendererHost(applicationState)` (`src/core/fe-host.ts`: `bindFeHost({ application, secrets, transport, packs: fePacks })`), then starts the actor, so the binding is in place before any plugin runs or any external pack frontend loads:
   - `application` backs `@abuddy/sdk/fe`'s `navigateToPlugin` and its neighbours;
   - `secrets` is `src/core/secrets-client.ts`, the API's secrets procedures behind `secretsClient` (the only ones pack frontends call directly);
   - `transport.sendIncoming` is how `@abuddy/sdk/events`' `sendToSystem` sends here: over the API client (`bus.send`), reporting a rejected send to the console, the app's log (`fe-host` source) and a toast, without the payload. Plugin sends and subscriptions throw (no backend app is bound in the renderer).
6. Sets the globals:
   - `window.applicationState` is the actor. The E2E fixture (`@abuddy/testing`) finds the main window by it and drives it.
   - `window.__disableOnboardingUI()` sends `ONBOARDING_COMPLETE`.
7. Subscribes to `protocolAction`: `abuddy://install?pack=…&source=…` → `requestPackInstall` (`src/packs/pack-install.ts`), which sends `INSTALL_PACK` to the `packs` system.
8. Mounts `App.vue` (it provides `actorSystem` and `applicationActor`), sets a Vue `errorHandler`, then calls `electronAPI.rendererReady()`, which tells main to show the window.

`App.vue` renders `PluginPopoutApp.vue` (one plugin, `PopoutTitlebar`) for popouts, else `WebApp.vue` (toolbar, canvas and chat areas, inspection panel), plus the `welcome` app extension while the actor has the `welcome` tag, and an overlay while it has `connecting`. `index.html` defines `window.__showErrorPage(title, detail)`, the static error page, whose buttons call `electronAPI.apiStatus.reload/relaunch/openLogFile`.

## Vite (`vite.config.ts`)

- **`builtInPacksPlugin`**, using packs from `discoverBuiltInPacksForBuild(packages/)` (`@abuddy/host/build/discover`):
  - `virtual:built-in-packs` statically imports `@<packId>/__generated__/pack-entry-fe` for each pack that has an entry and that file, and exports `{ [packId]: () => Promise.resolve({ default }) }`. `generate-entries` writes the file (`npm run compile` / `abuddy build`).
  - `@<packId>/…` aliases into that pack's `src/`.
  - `@/…` resolves into the importer's own pack `src/`, or into `renderer/src/` for renderer files. So `@/` inside default-setup means default-setup's `src`.
- **`hostDepsPlugin`** generates `virtual:host-deps`: `window.__abuddy = { … }`, holding namespace imports of:
  - `getSharedFeDeps()` (vue, xstate, `@xstate/vue`, tiptap, reka-ui, lucide, vue-flow, every `@tiptap/pm/*` and `@tiptap/vue-3/*` subpath, `prosemirror-*` aliases);
  - `getSdkFeModules()` (`sdkFe`, `sdkEvents`, `sdkRuntime`, …);
  - every `@abuddy/ui` export, keyed by specifier.

  All three lists live in `@abuddy/host/build/shared-deps`. The pack FE bundler proxies the same specifiers to these globals, so packs share the host's Vue, XState and SDK instance (with the frontend host it binds).
- **Resolution:** conditions include `@abuddy/source`. The API's router type comes from `@app/api` (a type-only import, a dev dependency).
- `base: './'` (loaded from `file://` in builds), `modulePreload: false`, and a long `optimizeDeps.include` list (Monaco, xterm, tiptap, vidstack, …) for the dev server.
- `tsconfig.app.json` includes `../abuddy-sdk/src/fe/**/*` (the `Window.electronAPI` declaration, see `packages/preload/CLAUDE.md`) and maps `@/*` → `src/*`.

## tRPC client (`src/core/trpc.ts`)

- Connects a `wsLink` to `ws://${API_HOST}:<electronAPI.apiPort>` (port default 3001) with `ApiSocket`, which offers the subprotocols `abuddy` and `abuddy-token.<electronAPI.apiToken>`; the API refuses connections without the token. The token isn't in the URL, which the browser prints on a failed connection. `AppRouter` is a type-only import from `@app/api`.
- `trpc` is a `Proxy` over the current connection, so importers keep one binding across reconnects.
- `reconnectApiClient(port)` closes the socket and reconnects only when the port changed, returning whether it did. A restart on the same port keeps the socket; the ws client reconnects on its own.

## Application actor (`src/core/actors/application.ts`)

`createApplicationState()` returns the root machine (`id: 'application'`).

- **States:**
  - `running.connecting` (tag `connecting`): after 30 s it goes to `error` and shows the error page with `apiStatus.getStatus()` details.
  - `running.connected`: re-entered on every `CLIENT_CONNECTED`.
  - `onboarding.letter` (tag `welcome`) → `wizard`: entered when `CLIENT_CONNECTED` has `hasOnboarded: false`; `ONBOARDING_COMPLETE` leaves it.
  - `error`: entered on `BACKEND_ERROR`.
  - `running.disconnected` is never entered.
- **Entry:** spawns every plugin's `state` with `id` and `systemId` equal to the plugin id (`spawnPluginActor`), sends the active plugin `PLUGIN_ACTIVATED`, and spawns `pluginTrailer`, `hotkeyListener`, `mouseListener` (mouse back/forward) and `backendListener`.
- **`backendListener`:**
  - Subscribes to `trpc.bus.sub`. `onStarted` → `BUS_SUBSCRIBED`; `onConnectionStateChange('connecting')` → `BUS_CONNECTION_LOST`; `onError` → `BACKEND_ERROR`.
  - Each event's `pluginId` routes it: `host/application` goes to this actor (`CLIENT_CONNECTED`, which carries the tabs' visibility and the plugin last open, `APPLICATION_HOTKEYS`, `PLUGIN_VISIBILITY_UPDATED`, `SYSTEM_ERROR`); anything else goes to `system.get(pluginId)`.
  - It listens to `electronAPI.apiStatus.onEvent`. On `api:started` with a new port it calls `reconnectApiClient` and re-subscribes. `api:fatal`, `api:error` and a non-restarting `api:stopped` raise `BACKEND_ERROR`. At start it checks `getStatus()` for a backend that already gave up.
- **Navigation:**
  - `SELECT_PLUGIN` sends `PLUGIN_DEACTIVATED`/`PLUGIN_ACTIVATED`, keeps the back/forward history, and sends it to the host's `application` system (`SET_LAST_ACTIVE_PLUGIN`), which records it in `AppState`; a main window opens on its first plugin and switches to the recorded one on `CLIENT_CONNECTED`. `SET_PLUGIN_VISIBILITY` (the toolbar, its context menu, Settings → Plugins) shows or hides a tab at once and sends the choice there too.
  - `route-trailer.ts` `computeCrumbs` builds breadcrumbs and the context menu from the active plugin's state `meta.breadcrumb` / `meta.contextMenu`. `router.vue` picks the canvas component by `targetView`.
  - Panel sizes persist under `agentbuddy-panel-sizes`.
- **Hotkeys:** `hotkeyListener` (modifier tracking ported from VueUse `useMagicKeys`) sends `PROCESS_GLOBAL_HOTKEY`. Application hotkeys map to `TOGGLE_INSPECTION_PANEL` and `SWITCH_PLUGIN_UP/DOWN`. Other keys are forwarded: every hotkey to the active plugin, and to other plugins only their `global` ones. Hotkeys are skipped while `HOTKEYS_RECORDING_START` is in effect, and plain keys are skipped inside ProseMirror or Monaco.
- `SYSTEM_ERROR` shows a toast (`src/core/toast.ts` queues until `WebApp` registers the toast component); `severity: 'fatal'` shows the error page instead.

## External pack frontends

The application actor owns loading; `src/packs/pack-loader.ts` does the work. The steps:

1. **`BUS_SUBSCRIBED`**, handled in every state: it sets `busSubscribed`, runs `announceLoadedPacks` (`trpc.bus.packClientReady` for each pack in `packPluginIds`), then `loadPackFrontends`. `LOAD_PACK_FRONTENDS` (sent by the Packs plugin on `PACK_ACTIVATED`) also runs `loadPackFrontends`.
2. **`loadPackFrontends`** spawns `packFrontendLoader` with `packFrontendsLoaded`, one run at a time. A request made during a run sets `packLoadQueued`, and the loader runs again when that run settles.
3. **`packFrontendLoader`** queries `trpc.packs.loaded` and, for each non-built-in pack not yet loaded, calls `loadPackFrontend(pack)`, reporting `PACK_FRONTEND_LOADED { packId, plugins }` after each pack. A pack that throws is reported with `plugins: []` and listed in `failedPacks`. At the end it sends `PACK_FRONTENDS_SETTLED { loadedPacksError?, failedPacks? }`.
4. **`loadPackFrontend`** (`pack-loader.ts`):
   - `loadPackStyles` adds a `<link data-pack-id>` for `pack://<id>/<feStyles>`, once per href.
   - It then `import()`s `pack://<id>/<feEntry>` and calls `fePacks.registerPackFE(registration, packId)`.
   - It returns the plugins, or `null` when the pack has no `feEntry`. It throws when the entry fails to import or register, so the loader lists the pack in `failedPacks` (a toast).
   - `loadPackFEEntry` warns when the module has no default export or declares none of `features/steps/artifacts/blocks/tiptapPlugins/appExtensions/dslTypes`. On an import failure it logs `[pack-loader] Failed to load FE entry pack://…:` with the error (the E2E fixture matches the prefix) and rethrows it.
5. **`mergePackPlugins`:**
   - `null` records the pack as loaded and asks nothing, because the connection's `CLIENT_CONNECTED` already reached its systems.
   - Otherwise it skips plugin ids already present, keeps the host's plugins (the Packs tab) last (`withHostLast`), spawns their actors, records them in `packPluginIds`, and, if `busSubscribed`, calls `packClientReady` so the pack's systems send their startup data.
   - A pack that was unloaded while its load ran (`packsUnloadedWhileLoading`) is instead unloaded again and dropped.
6. **`onPackFrontendsSettled`:** a failed read is shown as a toast only until one read has succeeded; the next connection retries. Failed packs are shown as a toast and not retried.
7. **Teardown:** on `PACK_DEACTIVATED` the Packs plugin (`src/packs/state.ts`) calls `unloadPackFrontend` (`fePacks.unregisterPackFE` and removing the stylesheets) and sends `PACK_PLUGINS_UNLOADED`. `removePackPlugins` stops those plugin actors, navigates away if one was active, and clears the pack from `packFrontendsLoaded` so it loads again if it comes back.

## Packs plugin (`src/packs/`)

The one plugin the renderer defines (`plugin.ts`: id `packs`, `isPinned`). Its machine (`state.ts`) mirrors the `packs` backend system's events (`PACKS_LIST`, `PACK_INSTALL_*`, `PACK_UPDATE_*`, …) and sends `INSTALL_PACK`, `UNINSTALL_PACK`, `TOGGLE_PACK_ENABLED`, `UPDATE_PACK`, `CHECK_FOR_UPDATES` and `GET_INSTALLED_PACKS` over `trpc.bus.send`. `canvas/` holds the list and `PackDetail.vue`.

## Tests and checks

- `npm run test:unit -w @app/renderer -- --run` runs vitest in jsdom (`vitest.config.ts` merges `vite.config.ts`); without `--run` it starts watch mode. Root `npm run test:unit` runs it too, as CI does.
  - `src/packs/__tests__/pack-loader.spec.ts` covers entry validation, a failed or missing entry, and stylesheet de-duplication.
  - `src/core/actors/__tests__/application-pack-loading.spec.ts` and `application-pack-plugins.spec.ts` drive the actor with `@/core/trpc`, `@/packs/pack-loader` and `@/core/toast` mocked: retry after a failed read of the loaded packs, queued loads, unload during load, and when `packClientReady` is called.
- `npm run typecheck:fe` (root) runs `vue-tsc --build`. `npm run build -w @app/renderer` type-checks and runs `vite build` in parallel. `lint` runs oxlint and then eslint, both with `--fix`.
