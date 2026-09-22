# @app/renderer

The Vue 3 app every AgentBuddy window runs. It hosts plugins; it doesn't implement them. Built-in plugins come from `packages/default-setup` (compiled in), and external packs' plugins load at runtime from `pack://`. The renderer owns the application actor, the tRPC client, the pack frontend loader, the shared-dependency globals packs import through, the layout shell and the Packs view. The root `CLAUDE.md` covers the plugin model; `docs/public-facing/architecture.md` ("Frontend boot", "Host dependency sharing") covers pack loading from a pack author's side, and `packages/abuddy-host/src/packs/runtime/CLAUDE.md` covers the backend half.

## Boot (`src/main.ts`)

Its static imports are evaluated first: `virtual:built-in-packs` loads every built-in pack's FE entry, and `virtual:host-deps` assigns `window.__abuddy`, so both are in place before pack code runs. The body then runs with a top-level `await`, in this order:

1. Installs `window.error` / `unhandledrejection` reporters (`electronAPI.rendererLog.write`, `fatal: true`). Reads `?popout=plugin&pluginId=…` (set by main's `plugin:popout`).
2. Sets `window.appVersion` (`__APP_VERSION__`, the root `package.json` version) and runs `runFrontendMigrations()` (`src/setup/migrations/index.ts`: localStorage migrations run before the actor reads its keys; the version is stored under `agentbuddy-fe-version`).
3. Built-in packs: calls each loader in `virtual:built-in-packs` and `fePacks.registerPackFE(mod.default)`, without a pack id, so they can't be unregistered. `fePacks` (`src/core/fe-packs.ts`) is this window's registered pack frontends, `createFePackRegistry()` from `@abuddy/host/fe`: the pack loader registers external packs' in it, `App.vue` reads the `welcome` app extension from it, and the SDK's frontend registries (steps, designations, tiptap plugins, DSL types) read it once bound.
4. Creates the app shell, `createAppShell()` (`src/core/app-shell.ts`), with `systemId: 'host/application'` (its machine id stays `application`, which its `#application.…` targets name) and input `{ initialPluginId, ownsLastActivePlugin: !popout }` (a main window opens on the plugin last open and records the one it opens; a popout does neither). It starts with the plugins registered in `fePacks` and the default a pack claims. It is exported as `applicationState`.
5. Binds the SDK's frontend port, `bindRendererHost(applicationState)` (`src/core/fe-host.ts`: `bindFeHost({ application, secrets, client: feClient, packs: fePacks })`), then starts the actor, so the binding is in place before any plugin runs or any external pack frontend loads:
   - `application` backs `@abuddy/sdk/fe`'s `navigateToPlugin` and its neighbours;
   - `secrets` is `src/core/secrets-client.ts`, the API's secrets procedures behind `secretsClient` (the only ones pack frontends call directly);
   - `client` is `feClient` (`src/core/fe-client.ts`), the window's one client to the API: the `ShellClient` from `@abuddy/host/fe`. Its `send` is how `@abuddy/sdk/events`' `sendToSystem` sends here, over `bus.send`, reporting a rejected send to the console, the app's log (`fe-client` source) and a toast, without the payload. The shell (`createAppShell()`) subscribes through it, and reads the loaded packs and asks for packs' startup data through it; it follows the API across a restart on a new port (Electron's API status). No other renderer module calls `trpc.bus` or `trpc.packs`. Plugin sends and subscriptions throw (no backend app is bound in the renderer).
6. Sets the globals:
   - `window.applicationState` is the actor. The E2E fixture (`@abuddy/testing`) finds the main window by it and drives it.
   - `window.__disableOnboardingUI()` sends `ONBOARDING_COMPLETE`.
7. Subscribes to `protocolAction`: `abuddy://install?pack=…&source=…` → `requestPackInstall` (`src/packs/pack-install.ts`), which sends `INSTALL_PACK` to the `packs` system.
8. Mounts `App.vue`, sets a Vue `errorHandler`, then calls `electronAPI.rendererReady()`, which tells main to show the window.

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

## App shell (`src/core/app-shell.ts`)

The shell's machine is the host's: `createShellMachine` in `@abuddy/host/fe` (`packages/abuddy-host/src/fe/shell/`, described in `packages/abuddy-host/CLAUDE.md`). This file only composes it with the window's I/O, as `createAppShell()`:

| Option | The renderer's |
|---|---|
| `packs` | `fePacks` (`src/core/fe-packs.ts`): the plugins the shell starts with, and its default |
| `client` | `feClient` (`src/core/fe-client.ts`): the bus subscription, sends, the loaded packs, `packClientReady`, and the connection's description for the error page (Electron's `apiStatus`) |
| `packFrontends` | `loadPackFrontend` / `unloadPackFrontend` (`src/packs/pack-loader.ts`) |
| `storage` | `localStorage`, under `agentbuddy-panel-sizes` |
| `notify` | `globalToast` (`src/core/toast.ts`, which queues until `WebApp` registers the toast component) and `window.__showErrorPage` |
| `target` | `window`, which the hotkey and mouse listeners attach to |

It re-exports `visiblePluginsOf` (for `WebApp.vue`) and `withHostLast`. Saved panel sizes that aren't JSON fall back to the defaults rather than failing the window's shell (`src/core/__tests__/app-shell.spec.ts`).

## External pack frontends

The shell owns loading (see the host doc); `src/packs/pack-loader.ts` does the work for one pack:

- `loadPackStyles` adds a `<link data-pack-id>` for `pack://<id>/<feStyles>`, once per href.
- `loadPackFrontend` then `import()`s `pack://<id>/<feEntry>` and calls `fePacks.registerPackFE(registration)`. It returns the plugins, or `null` when the pack has no `feEntry`. It throws when the entry fails to import or register, so the shell lists the pack as failed (a toast).
- `loadPackFEEntry` warns when the module has no default export or declares none of `features/steps/artifacts/blocks/tiptapPlugins/appExtensions/dslTypes`. On an import failure it logs `[pack-loader] Failed to load FE entry pack://…:` with the error (the E2E fixture matches the prefix) and rethrows it.
- On `PACK_DEACTIVATED` the Packs plugin (`src/packs/state.ts`) calls `unloadPackFrontend` (`fePacks.unregisterPackFE` and removing the stylesheets) and sends the shell `PACK_PLUGINS_UNLOADED`; on `PACK_ACTIVATED` it sends `LOAD_PACK_FRONTENDS`.

## Packs plugin (`src/packs/`)

The one plugin the renderer defines (`plugin.ts`: id `packs`, `isPinned`). Its machine (`state.ts`) mirrors the `packs` backend system's events (`PACKS_LIST`, `PACK_INSTALL_*`, `PACK_UPDATE_*`, …) and sends `INSTALL_PACK`, `UNINSTALL_PACK`, `TOGGLE_PACK_ENABLED`, `UPDATE_PACK`, `CHECK_FOR_UPDATES` and `GET_INSTALLED_PACKS` with `sendToSystem`, over the window's client. `canvas/` holds the list and `PackDetail.vue`.

## Tests and checks

- `npm run test:unit -w @app/renderer -- --run` runs vitest in jsdom (`vitest.config.ts` merges `vite.config.ts`); without `--run` it starts watch mode. Root `npm run test:unit` runs it too, as CI does.
  - `src/packs/__tests__/pack-loader.spec.ts` covers entry validation, a failed or missing entry, and stylesheet de-duplication.
  - The shell's own specs live with it, in `packages/abuddy-host/tests/fe/shell/`.
- `npm run typecheck:fe` (root) runs `vue-tsc --build`. `npm run build -w @app/renderer` type-checks and runs `vite build` in parallel. `lint` runs oxlint and then eslint, both with `--fix`.
