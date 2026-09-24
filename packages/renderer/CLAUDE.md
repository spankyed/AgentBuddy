# @app/renderer

The Vue 3 app every AgentBuddy window runs. It hosts plugins; it doesn't implement them. Built-in plugins come from `packages/default-setup` (compiled in), and external packs' plugins load at runtime from `pack://`. The renderer owns the window: the tRPC client, the shared-dependency globals packs import through, the layout and Packs views, and the composition that ties them to the host's machines. What decides anything — the app shell, the Packs plugin's machine, pack-frontend loading, the install a deep link asks for — is `@abuddy/host/fe`, as the app runtime behind the API is `@abuddy/host`. The root `CLAUDE.md` covers the plugin model; `docs/public-facing/architecture.md` ("Frontend boot", "Host dependency sharing") covers pack loading from a pack author's side, and `packages/abuddy-host/src/packs/runtime/CLAUDE.md` covers the backend half.

## Layout

`src/` is one folder per job this package does, and `packages/api/src` is the same five minus the last, so a concept
found in one is looked for in the same place in the other (`tests/source-layout.spec.ts` says so on both sides):

| Folder | What belongs there | The API's counterpart |
|---|---|---|
| `boot/` | what runs before the app exists: error reporting, the window's environment | `boot/` |
| `runtime/` | this window's resources and the frontend port binding | `runtime/` |
| `transport/` | the wire to the API: the tRPC client, the `ShellClient`, the secrets client | `transport/` (the routers) |
| `adapters/` | this window's implementations of ports the host defines (`ShellStorage`, `ShellNotify`, `PackFrontendIO`) | `adapters/` |
| `views/` | Vue: the app's roots, the layout, the Packs and Settings views | — the API renders nothing |

`main.ts`, `types.ts` and the ambient declarations sit at the root. There is no `core/`, `shared/`, `lib/` or
`utils/`: a folder named for a layer rather than a job takes whatever nobody placed, and the guard rejects one.

Tests live in `tests/`, mirroring `src/`, as in every other package.

## Boot (`src/main.ts`)

Its static imports are evaluated first: `virtual:built-in-packs` loads every built-in pack's FE entry, and `virtual:host-deps` assigns `window.__abuddy`, so both are in place before pack code runs. The body then runs with a top-level `await`, in this order:

1. `installGlobalErrorHandling()` (`src/boot/errors.ts`): the Monaco error filter, then this window's `window.error` / `unhandledrejection` reporters (`electronAPI.rendererLog.write`, `fatal: true`). One call, because the filter only works when it is registered first. Reads `?popout=plugin&pluginId=…` (set by main's `plugin:popout`).
2. Sets `window.appVersion` (`__APP_VERSION__`, the root `package.json` version) and runs `runFrontendMigrations(localStorage, __APP_VERSION__)` (`@abuddy/host/fe`), which moves what this window keeps in its storage forward before the shell reads those keys. The migrations are the host's (`src/fe/migrations/`); the window only says where its storage is and which version it is.
3. Built-in packs: calls each loader in `virtual:built-in-packs` and `fePacks.registerPackFE(mod.default)`, without a pack id, so they can't be unregistered. `fePacks` (`src/runtime/packs.ts`) is this window's registered pack frontends, `createFePackRegistry()` from `@abuddy/host/fe`: the pack loader registers external packs' in it, `App.vue` reads the `welcome` app extension from it, and the SDK's frontend registries (steps, designations, tiptap plugins, DSL types) read it once bound.
4. Creates the app shell, `createAppShell()` (`src/runtime/shell.ts`), with `systemId: 'host/application'` (its machine id stays `application`, which its `#application.…` targets name) and input `{ initialPluginId, ownsLastActivePlugin: !popout }` (a main window opens on the plugin last open and records the one it opens; a popout does neither). It starts with the plugins registered in `fePacks` and the default a pack claims. It is exported as `applicationState`.
5. Binds the SDK's frontend port, `bindRendererHost(applicationState)` (`src/runtime/index.ts`: `bindFeHost({ application, secrets, client: feClient, packs: fePacks })`), then starts the actor, so the binding is in place before any plugin runs or any external pack frontend loads:
   - `application` backs `@abuddy/sdk/fe`'s `untypedOpenPlugin` and its neighbours;
   - `secrets` is `src/transport/secrets.ts`, the API's secrets procedures behind `secretsClient` (the only ones pack frontends call directly);
   - `settings` is `src/runtime/settings.ts`, the `SettingsPort` behind `@abuddy/sdk/fe`'s settings composables. It reads the running Settings view's actor, found by the `settings` role rather than by name, so what a feature reads of its own settings doesn't name the view that draws them;
   - `client` is `feClient` (`src/transport/client.ts`), the window's one client to the API: the `ShellClient` from `@abuddy/host/fe`. Its `send` is how `@abuddy/sdk/events`' `sendToSystem` sends here, over `bus.send`, reporting a rejected send to the console, the app's log (`fe-client` source) and a toast, without the payload. The shell (`createAppShell()`) subscribes through it, and reads the loaded packs and asks for packs' startup data through it; it follows the API across a restart on a new port (Electron's API status). No other renderer module calls `trpc.bus` or `trpc.packs`. Plugin sends and subscriptions throw (no backend app is bound in the renderer).
6. Sets the globals:
   - `window.applicationState` is the actor. The E2E fixture (`@abuddy/testing`) finds the main window by it and drives it.
   - `window.__disableOnboardingUI()` sends `ONBOARDING_COMPLETE`.
7. Subscribes to `protocolAction`: `abuddy://install?pack=…&source=…` → `installFromProtocol` (`@abuddy/host/fe`), which reads the parameters and sends `INSTALL_PACK` to the `packs` system.
8. Mounts `views/App.vue`, sets a Vue `errorHandler`, then calls `electronAPI.rendererReady()`, which tells main to show the window.

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

## tRPC client (`src/transport/index.ts`)

- Connects a `wsLink` to `ws://${API_HOST}:<electronAPI.apiPort>` (port default 3001) with `ApiSocket`, which offers the subprotocols `abuddy` and `abuddy-token.<electronAPI.apiToken>`; the API refuses connections without the token. The token isn't in the URL, which the browser prints on a failed connection. `AppRouter` is a type-only import from `@app/api`.
- `trpc` is a `Proxy` over the current connection, so importers keep one binding across reconnects.
- `reconnectApiClient(port)` closes the socket and reconnects only when the port changed, returning whether it did. A restart on the same port keeps the socket; the ws client reconnects on its own.

## App shell (`src/runtime/shell.ts`)

The shell's machine is the host's: `createShellMachine` in `@abuddy/host/fe` (`packages/abuddy-host/src/fe/shell/`, described in `packages/abuddy-host/CLAUDE.md`). This file only composes it with the window's I/O, as `createAppShell()`:

| Option | The renderer's |
|---|---|
| `packs` | `fePacks` (`src/runtime/packs.ts`): the plugins the shell starts with, and its default |
| `client` | `feClient` (`src/transport/client.ts`): the bus subscription, sends, the loaded packs, `packClientReady`, and the connection's description for the error page (Electron's `apiStatus`) |
| `packFrontends` | `createPackFrontends(packFrontendIO, fePacks)` (`@abuddy/host/fe`), over this window's `import()` and stylesheets (`src/adapters/pack-frontends.ts`) |
| `storage` | `windowStorage` (`src/adapters/storage.ts`): `localStorage`, under `agentbuddy-panel-sizes` |
| `notify` | `windowNotify` (`src/adapters/notify.ts`), over `globalToast` (`src/adapters/toast.ts`, which queues until `WebApp` registers the toast component) and `window.__showErrorPage` |
| `target` | `window`, which the hotkey and mouse listeners attach to |

It re-exports nothing: `WebApp.vue` takes `visiblePluginsOf` from `@abuddy/host/fe`. Saved panel sizes that aren't JSON fall back to the defaults rather than failing the window's shell (`tests/runtime/shell.spec.ts`).

## External pack frontends

The shell owns loading (see the host doc), and the rules are the host's too (`@abuddy/host/fe`, `fe/packs/frontends.ts`):
a pack's file URLs, what counts as a registration, and what unloading undoes. This window supplies the two things only
a browser can do, as `PackFrontendIO` (`src/adapters/pack-frontends.ts`):

- `importModule(url)` is the dynamic `import()` of `pack://<id>/<feEntry>`.
- `styles.add(packId, href)` adds a `<link data-pack-id>` once per href and resolves when it has loaded or failed;
  `styles.remove(packId)` takes that pack's stylesheets out.

On `PACK_DEACTIVATED` the Packs machine tells the shell `PACK_PLUGINS_UNLOADED`, and the shell unloads the pack's
frontend and drops its plugins — it loads them, so it takes them out.

## Packs view (`src/views/packs/`)

The Packs tab's components, and the one module that composes them: `plugin.ts` pairs the host's `packsMachine`
(`@abuddy/host/fe`) with the view (`index.vue`, the list, and `PackDetail.vue`) and registers it as the `host` pack's frontend.
Nothing here decides anything about packs: what would is the host's, and `tests/source-layout.spec.ts` keeps the
view and its one composition module the only things here. `plugin.ts` is where `hostFrontend` lives, so the Settings
view registers there too.

## Settings view (`src/views/settings/`)

The Settings tab, laid out as the Packs view is: the canvas, its three tabs (General, Plugins, Help) and the General
components, over the host's `createSettingsMachine` (`@abuddy/host/fe`). The settings themselves are the app's
(`packages/abuddy-host/src/features/settings/`) — this is only what draws them. Two sections a pack contributes,
`general` and `assistant`, are default-setup's content; the components read them as data and the host stores them
opaquely. `plugin-settings.ts` reads a slice by name from settings in hand, `save.ts` is the composable the forms
use for a change and whether the store stored it, and the Plugins tab renders each plugin's own `settings` component
in a `PluginScope` for that plugin, so a form's `usePlugin()` reaches the plugin it configures.

## Tests and checks

- `npm run test:unit -w @app/renderer -- --run` runs vitest in jsdom over `tests/` (`vitest.config.ts` merges `vite.config.ts`); without `--run` it starts watch mode. Root `npm run test:unit` runs it too, as CI does.
  - `tests/source-layout.spec.ts` keeps each folder to its job; `tests/views/packs/pack-detail.spec.ts` covers the Packs detail component.
  - The shell's specs, the Packs machine's and the pack-frontend loader's live with them, in `packages/abuddy-host/tests/fe/`.
- `npm run typecheck:fe` (root) runs `vue-tsc --build`. `npm run build -w @app/renderer` type-checks and runs `vite build` in parallel. `lint:check` runs oxlint and then eslint; `lint:fix` runs both with `--fix`. The bare-named one is the safe one, so nothing rewrites the tree unless you asked it to.
