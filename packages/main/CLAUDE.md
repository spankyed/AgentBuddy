# @app/main

The Electron main process. It decides the app environment, spawns the API server as a child process, owns every window, registers the custom protocols and answers the renderer's IPC calls. It holds no app logic: pack systems run in the API process (`packages/api`), plugins in the renderer. The root `CLAUDE.md` covers environment inference in brief, and `docs/public-facing/architecture.md` covers the data dir layout and the `pack://` protocol from a pack author's side.

## Entry

`packages/entry-point.mjs` (the app's `main`) imports `./main/dist/index.js` and calls `initApp({ renderer, preload })` (`src/index.ts`, typed by `src/AppInitConfig.ts`). Main never imports `@app/renderer` or `@app/preload` itself; the entry point passes their locations:

- `renderer`: `new URL(VITE_DEV_SERVER_URL)` when `MODE=development` and that variable is set (`npm start`), else `{ path: renderer/dist/index.html }`.
- `preload`: `preload/dist/exposed.mjs`.

The entry point also installs crash handling: `showAndExit` on uncaught errors in development, Playwright and CI, and `electron-log`'s `errorHandler` otherwise (EPIPE ignored). It still starts after the app context exists: `entry-point.mjs` imports `initApp` statically, and evaluating that bundle runs `logger.ts`, which asks for the context.

## Module runner

`initApp` runs `initAppContext()`, `initializeMainLogCapture()` and a `disable-features` Chromium switch (it stops the macOS Apple Music permission prompt), then chains modules on `createModuleRunner()` (`src/ModuleRunner.ts`):

- A module implements `AppModule.enable({ app })` (`src/AppModule.ts`, `src/ModuleContext.ts`).
- `init(module)` calls `enable` right away, in registration order. A returned promise is chained, and `await moduleRunner` waits for all of them. Async modules run concurrently from their first `await` (usually `app.whenReady()`), so whatever must happen before `ready`, like `protocol.registerSchemesAsPrivileged`, has to run synchronously in `enable`.
- `createApiServer()` and `createSplashScreen()` are created before the chain and passed to the window manager as well.

Modules, in order (`src/modules/`):

| Factory | File | Does |
|---|---|---|
| `disallowMultipleAppInstance` | `SingleInstanceApp.ts` | `requestSingleInstanceLock()`, scoped by the app name `initAppContext` set, so dev, beta, test and production run side by side; exits if the lock is taken |
| `createProtocolHandler` | `ProtocolHandler.ts` | Registers the app as handler for `urlScheme` (`abuddy`, or `abuddy-beta`); `open-url` / `second-instance` URLs go to the first window as `protocol-action` `{ action: hostname, params }` |
| `hardwareAccelerationMode` | `HardwareAccelerationModule.ts` | Currently `{ enable: true }`, so a no-op |
| `createMediaProtocol` | `media-protocol/` | `media://` and `local-file://` (see Protocols) |
| `createPackProtocol` | `pack-protocol/` | `pack://` (see Protocols) |
| `splashScreen` | `splash-screen/` | Frameless 400×400 splash, shown on `ready-to-show` with the version; fades out on `close()` |
| `apiServer` | `api-server/` | Spawns and supervises the API (see API server) |
| `createSpeechRecognition` | `speech-recognition/` | `speech:*` IPC; spawns the native helper (`native/speech/…`) on first `speech:start` |
| `createWindowManagerModule` | `window-manager/` | Main and popout windows, most IPC handlers (see Windows) |
| `terminateAppOnLastWindowClose` | `ApplicationTerminatorOnLastWindowClose.ts` | Quits on `window-all-closed` except on macOS |
| `createBrowserModule` | `browser/` | The browser plugin's tabs: `WebContentsView`s in the `persist:browser` session, driven by `browser:*` IPC (`BrowserTabManager.ts`) |
| `createMacOSAppMenu` | `MacOSAppMenu.ts` | macOS menu: Cmd+Q hides, Cmd+Shift+Q quits; packaged builds add "Install 'abuddy' command in PATH" (`cli-command.ts`, symlinks `Resources/cli/abuddy` into `/usr/local/bin`, `abuddy-beta` for beta, via `osascript` on EACCES) |
| `allowInternalOrigins` | `BlockNotAllowdOrigins.ts` | Blocks `will-navigate` to origins other than the dev server's |
| `allowExternalUrls` | `ExternalUrls.ts` | `setWindowOpenHandler` always denies; opens allowlisted origins (API provider consoles, docs) in the system browser |

The allowlists are populated only when `renderer` is a URL (dev server); from a file build both sets are empty. The last two skip `persist:browser` web contents. `AutoUpdater` is commented out in `src/index.ts`.

## App context (`src/app-context.ts`)

`initAppContext()` runs first and is the only place the environment is decided:

- `_inferElectronAppEnv` (`@abuddy/sdk/env`) gets `PLAYWRIGHT_TEST === 'true'`, `app.isPackaged`, the build-time `__ABUDDY_CHANNEL__` and `process.env.ABUDDY_ENV`. `__ABUDDY_CHANNEL__` is `ABUDDY_ENV` at build time (`vite.config.js` `define`), which `build/build.sh` exports as `production` or `beta`; a packaged build without a valid stamp throws.
- `resolveAppContext({ env })` gives the app name, data dir, `packsDir`, `urlScheme`, …. It then calls `app.setName` and `app.setPath('userData')` (so the single-instance lock and Electron's own storage follow it), and writes `ABUDDY_ENV` / `ABUDDY_USER_DATA_DIR` to `process.env`, which the API child inherits.
- Everything else reads it with `getAppContext()`, which throws if called first. Don't read `app.getPath('userData')`, `NODE_ENV` or `PLAYWRIGHT_TEST` to choose paths.

## API server (`src/modules/api-server/`)

- `ApiServer` creates the API token for this app run (`apiToken`, 32 random bytes). The API process gets it as `ABUDDY_API_TOKEN` (`getEnvironment`), the app's windows through the synchronous `api:token` IPC their preload sends. The in-app browser's tabs have no preload, so web pages never see it.
- `ApiServer.enable` registers IPC (`api:token`, `api:get-status`, `api:open-log-file`, `app:reload`, `app:relaunch`) and starts the server on `app.whenReady()`.
- `startApiServer` SIGKILLs orphaned API processes (`ps`, macOS/Linux: same `dist/server.js` path, `AgentBuddy` in the command, parent pid 1), then spawns it:
  - `getApiPaths()`: `<appPath>/packages/api` from source, `<resources>/app/packages/api` packaged (no ASAR).
  - `getNodeExecutable()`: `node` from source; packaged, Electron itself with `ELECTRON_RUN_AS_NODE=1`.
  - `getExecutionArgs()`: from source `--conditions=@abuddy/source dist/server.js`, so packs' `@abuddy/*` imports resolve to workspace source.
  - `getEnvironment()`: `API_PORT`, `ABUDDY_API_TOKEN` (the run's API token), `NODE_ENV`, `BUILT_IN_PACKS_DIR` (`packages/`), `AGENTBUDDY_STARTUP_ID`, `AGENTBUDDY_LOG_DIR`, `ABUDDY_ENV`, `ABUDDY_USER_DATA_DIR`; packaged builds append Homebrew, `/usr/local/bin` and nvm dirs to `PATH`.
  - Port: `getPort({ port: preferredPort })` (3001 first, then the last port that worked) after `clearLockedPorts()`, so a restart keeps the renderer's URL when it can.
- `ProcessManager` (`process-manager.ts`) pipes stdout/stderr to the log. The server counts as ready at the first stdout line containing `WebSocket Server listening` with `ws://localhost:<port>`. Stderr lines starting with `{"__fatal":` are collected and broadcast as `api:fatal`.
- On exit it broadcasts `api:stopped` (`{ error, restarting }`) and restarts after 2 s, up to 3 attempts (`API_CONFIG` in `config.ts`); the count resets once a launch has run for 5 s. After the last attempt it broadcasts `api:error` and rejects `waitForReady()`.
- `broadcastEvent` sends `api:starting`, `api:started` (`{ port, startupId }`), `api:restarting`, `api:log` (dev only) and the events above to every window. The renderer reconnects its tRPC client on `api:started` (see `packages/renderer/CLAUDE.md`).
- Shutdown: `before-quit` (and `window-all-closed` off macOS) sends SIGTERM, then SIGKILL after 5 s.
- `logger.ts` mirrors `console.*` into electron-log and writes `main.jsonl`, `renderer.jsonl`, `renderer.log` and `app-events.log` beside the main log. Those four go through `appendCappedLine` (`@abuddy/host/logs`), which rotates each at 10 MB: electron-log's own `maxSize` covers only `main.log`, and without a cap of their own they grew for as long as the app was ever run. All of them, electron-log included, are configured from `getAppContext().logsDir` — importing this module is what decides the context, so the module graph puts that before any log write.

## Windows (`src/modules/window-manager/`)

- `WindowManager.enable` waits for `apiServer.waitForReady()` (60 s). On failure it shows a Relaunch/Quit dialog and exits.
- `restoreOrCreateWindow` creates the main window (title `AgentBuddy-Main`, the key `isMainWindow` matches on) and waits for the renderer's `renderer:ready` IPC (15 s timeout) before showing it and closing the splash. `second-instance` and macOS `activate` restore or recreate it.
- Windows get `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, the preload script, and `additionalArguments` `--api-port=<port>` and `--startup-id=<id>`, which the preload reads. The port is read when the window is created; later moves reach the renderer through `api:started`.
- `plugin:popout` opens one popout per plugin id (`AgentBuddy-Popout-<id>`), loading the renderer with `?popout=plugin&pluginId=…&title=…`; Cmd/Ctrl+W closes it.
- Size: 1400×900 in a dev build, 1920×1200 otherwise (`constants.ts`, `import.meta.env.DEV`).
- Under Playwright, windows are never shown or focused unless `PLAYWRIGHT_VISIBLE=1`; the same check guards the splash and protocol handler.
- `attachRendererDiagnostics` logs console messages, crashes, hangs, load and preload failures to the renderer log. `getWindowIcon()` (`helpers.ts`) uses `build/resources/icon-dev.png` from source.
- The window manager also registers window controls, dialogs, file reads, `shell:*`, `media:*`, `zoom:changed` and `renderer-log:write`. The channel list is in `packages/preload/CLAUDE.md`.

## Protocols

- **`pack://<packId>/<path>`** (`pack-protocol/PackProtocol.ts`), privileged `secure` + `supportFetchAPI`:
  - Refuses a host that isn't a pack id (`/^[a-z][a-z0-9-]*$/`, so `pack://../x` can't reach the data dir), and any resolved path outside `packsDir/<packId>/` (403).
  - While `abuddy dev` runs, `devServerUrl(userDataDir, packId, path)` (`@abuddy/host/packs/dev-server`) names the pack's Vite server: a marker with an invalid port answers 502; a failed or non-OK fetch falls through to disk.
  - Serves from disk with a small MIME table.
- **`media://<entityId>/<file>`** (`media-protocol/`) serves `getMediaBasePath()/<entityId>/<file>`, which `media:upload` writes to (PNG/JPEG/GIF/WebP, 10 MB max). That is the folder the SDK's `_getMediaPath()` gives the API (`media-protocol/paths.ts`): `<data dir>/media` packaged, `<data dir>/.data/media` from source, following the `NODE_ENV` main passes the API.
- **`local-file://?path=<abs>`** serves any existing local file for video playback. It uses the deprecated `registerFileProtocol` and no `stream` privilege on purpose: `stream: true` breaks seeking (Electron #38749).

## Build and dev

- `vite build` (`vite.config.js`) produces a single SSR ES bundle `dist/index.js`. `@abuddy/sdk` and `@abuddy/host` are bundled in (`ssr.noExternal`), because packaged builds strip `.ts`. They resolve under `@abuddy/source`. Splash assets and `resources/logo.svg` are copied to `dist/assets`.
- `npm start` (`packages/dev-mode.js`) starts the renderer dev server, builds the API, then builds preload and main in watch mode with the `@app/renderer-watch-server-provider` plugin. Main's `handleHotReload` restarts Electron after each rebuild (`ELECTRON_INSPECT=true`, via `npm run start:inspect`, adds `--inspect`).
- `npm run typecheck -w @app/main` runs `tsc --noEmit`. Root `npm run typecheck` and CI don't run it.

## Tests

`npm test -w @app/main` (vitest, `tests/**/*.spec.ts`), in the root `test:unit` chain. `tests/electron-stub.ts` stands in for Electron's `app` and records what a module asked it to do; `vitest.config.ts` aliases `electron` to it and defines `__ABUDDY_CHANNEL__`, which the identity guard allows for the same reason it allows `vite.config.js`. A test must take the stub from the same fresh registry as the module under test (`load()` in `tests/app-context.spec.ts`), because `vi.resetModules()` gives the module a new one.
