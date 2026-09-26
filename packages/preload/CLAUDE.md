# @app/preload

The preload script every AgentBuddy window loads (`packages/main`'s `WindowManager` passes it as `webPreferences.preload`). It is the only bridge between the renderer and the main process. Through `contextBridge` it exposes one object, `window.electronAPI`, to the renderer and to pack frontend code. Windows run with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: false`.

## Never run bare `tsc` here

`tsconfig.json` has no `outDir`. It sets `noEmit: true`, so `tsc` and `tsc -p .` only type-check. But `tsc src/index.ts`, or any call that passes files or overrides `noEmit`, ignores or bypasses that and writes `.js` next to the sources in `src/`. The root `.gitignore` ignores `packages/preload/src/**/*.js` as a safety net, so nothing flags such a file. A stray `src/index.js` would be the literal target of `exposed.ts`'s `import './index.js'`.

- Build: `npm run build -w @app/preload` (`vite build`), or `npm run build` / `npm start` at the root.
- Type-check: `npm run typecheck -w @app/preload` (`tsc --noEmit`). Root `npm run typecheck` and CI don't run it.

## Files

- `src/index.ts` — the whole surface: builds the API objects and calls `contextBridge.exposeInMainWorld('electronAPI', …)`.
- `src/exposed.ts` — the build entry. It imports `./index.js` for that side effect and re-exports it "for tests" (the package has none).
- `vite.config.js` — SSR library build of `src/exposed.ts` to `dist/exposed.mjs` (Electron requires `.mjs` for ESM preloads), targeting the Chrome version from `@app/electron-versions`. Inline sourcemaps in development. In `npm start` it builds in watch mode and sends the renderer dev server a `full-reload` after each rebuild.
- `package.json` exports only `./exposed.mjs` → `dist/exposed.mjs`. `packages/entry-point.mjs` resolves that path and hands it to `initApp`.

## Values read at load

- `apiPort` — from the `--api-port=<n>` argument main appends when it creates the window (default `3001`). It is fixed for the window's life; the renderer follows later port changes through `apiStatus.onEvent` (`api:started`).
- `apiToken` — the token the API requires for this app run, read from main with `ipcRenderer.sendSync('api:token')` as the preload loads (never on the command line, where other processes could read it). The renderer's tRPC client sends it when connecting. The SDK's `Window.electronAPI` type leaves it out on purpose, so pack authors aren't pointed at it; the renderer reads it through its own type (`core/trpc.ts`). Leaving it out of the type only stops advertising it: external pack frontends run in the app window (loaded with `import()` from `pack://`), so they can still read `electronAPI.apiToken`, and the rest of `electronAPI`, at runtime. Closing that means isolating pack frontends from the app window, for example in a sandboxed iframe or a `WebContentsView` per pack with only an SDK message bridge and no preload. That isn't built yet; the plan is [`docs/goals/goal-pack-frontend-isolation.md`](../../docs/goals/deferred/goal-pack-frontend-isolation.md).
- `startupId` — from `--startup-id=<id>`: the id main generates per launch and also passes to the API as `AGENTBUDDY_STARTUP_ID`.

## IPC surface

`invoke` calls a main `ipcMain.handle`; `send` is fire-and-forget to `ipcMain.on`; `on` listens for main's `webContents.send`. Handlers live in `packages/main/src/modules/`.

| `electronAPI.` | Channel(s) | Kind | Main handler |
|---|---|---|---|
| `windowControls.minimize/maximize/close` | `window:minimize` / `window:maximize` / `window:close` | send | `window-manager` (acts on the focused window) |
| `plugins.popout(pluginId, title?)` | `plugin:popout` | invoke | `window-manager` |
| `fileUtils.selectDirectory()` / `selectPath(opts)` | `dialog:select-directory` / `dialog:select-path` | invoke | `window-manager` |
| `fileUtils.readFile` / `readFileBase64` | `file:read` / `file:read-base64` | invoke | `window-manager` (reads any path) |
| `fileUtils.getPathForFile(file)` | — | local | `webUtils.getPathForFile` |
| `shell.openExternal` / `showItemInFolder` / `openPath` / `openImageExternal` | `shell:*` | invoke | `window-manager` (`openExternal` only for `http(s)`) |
| `media.upload` / `delete` / `deleteAll` | `media:upload` / `media:delete` / `media:delete-all` | invoke | `window-manager`; `upload` returns `media://<entityId>/<file>` |
| `speechRecognition.start` / `stop` / `isAvailable` | `speech:start` / `speech:stop` / `speech:isAvailable` | invoke | `speech-recognition` |
| `speechRecognition.onEvent(cb)` | `speech:event` | on | `speech-recognition` (to the window that started) |
| `zoom.getZoomFactor()` | — | local | `webFrame.getZoomFactor` |
| `zoom.notifyZoomChanged(f)` | `zoom:changed` | send | `window-manager` (moves the macOS traffic lights) |
| `apiStatus.getStatus()` | `api:get-status` | invoke | `api-server` |
| `apiStatus.relaunch` / `reload` / `openLogFile` | `app:relaunch` / `app:reload` / `api:open-log-file` | invoke | `api-server` |
| `apiStatus.onEvent(cb)` | `api:stopped`, `api:error`, `api:restarting`, `api:started`, `api:fatal` | on | `api-server` `broadcastEvent`; `cb` gets `{ type: channel, ...data }` |
| `rendererLog.write(entry)` | `renderer-log:write` | invoke | `window-manager` → `renderer.log` |
| `browser.createTab` / `loadTab` / `duplicateTab` / `setTabMuted` / `clearCache` / `getTabs` / `getActiveTab` | `browser:*` | invoke | `browser` |
| `browser.closeTab` / `selectTab` / `navigate` / `goBack` / `goForward` / `reload` / `stop` / `setBounds` / `show` / `hide` / `toggleDevTools` | `browser:*` | send | `browser` |
| `browser.onTabCreated` / `onTabRemoved` / `onTabUpdated` / `onActiveTabChanged` / `onFocusAddressBar` | `browser:tab-created` / `-removed` / `-updated` / `active-tab-changed` / `focus-address-bar` | on | `BrowserTabManager` |
| `protocolAction.onAction(cb)` | `protocol-action` | on | `ProtocolHandler` (`abuddy://<action>?…` deep links) |
| `rendererReady()` | `renderer:ready` | send | `window-manager`: shows the main window and closes the splash (15 s fallback) |

Every `on*` subscription returns an unsubscribe function. Main also broadcasts `api:starting` and `api:log` (dev stdout/stderr), which nothing here subscribes to.

## The type contract lives in the SDK

The renderer and packs don't import this package's types. `Window.electronAPI` is declared in `packages/abuddy-sdk/src/fe/electron-api.ts`, a published contract re-exported by `@abuddy/sdk/fe`, so pack authors see it too (`packages/renderer/src/electron.d.ts` only points there). `SpeechEvent` comes from `abuddy-sdk/src/fe/speech-event.d.ts`, through the root `types/speech.d.ts`. When you change the surface here:

1. Add the main handler (`ipcMain.handle` for `invoke`, `ipcMain.on` for `send`).
2. Expose it in `src/index.ts`.
3. Update `electron-api.ts` and run `npm run api:update` in `packages/abuddy-sdk` (see the root `CLAUDE.md`, "SDK packages").

The declaration marks `electronAPI` optional, because it is missing outside Electron (vitest/jsdom). Callers use `window.electronAPI?.…`.

Not every member is declared: the SDK type lacks `apiToken` (on purpose, above), `fileUtils.getPathForFile`, `shell.openImageExternal`, `apiStatus.reload` and `apiStatus.openLogFile`. default-setup reaches `getPathForFile` through `(window as any)`. The renderer's error page, plain script in `packages/renderer/index.html`, calls `reload`, `relaunch` and `openLogFile`. Nothing calls `openImageExternal`.
