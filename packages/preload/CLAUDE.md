# @app/preload

The preload script every AgentBuddy window loads (`packages/main`'s `WindowManager` passes it as `webPreferences.preload`). It is the only bridge between the renderer and the main process. Through `contextBridge` it exposes one object, `window.electronAPI`, to the renderer and to pack frontend code. Windows run with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: false`.

## Never run bare `tsc` here

`tsconfig.json` has no `outDir`. It sets `noEmit: true`, so `tsc` and `tsc -p .` only type-check. But `tsc src/index.ts`, or any call that passes files or overrides `noEmit`, ignores or bypasses that and writes `.js` next to the sources in `src/`. The root `.gitignore` ignores `packages/preload/src/**/*.js` as a safety net, so nothing flags such a file. A stray `src/index.js` would be the literal target of `exposed.ts`'s `import './index.js'`.

- Build: `npm run build -w @app/preload` (`vite build`), or `npm run build` / `npm start` at the root.
- Type-check: `npm run typecheck -w @app/preload` (`tsc --noEmit`). Root `npm run typecheck` runs it as `typecheck:preload`.
- Test: `npm test -w @app/preload` (vitest, `tests/**/*.spec.ts`), in the root `test:unit` pool.

## What the suite holds, and what it deliberately doesn't

**This is the narrowest layer in the repo and the only one a renderer can reach directly** — every pack's
frontend runs in the same window, so what is exposed here is reachable by code the app did not write. The
suite is four claims nothing else makes, and the IPC table below is deliberately not one of them: a case
per channel would restate this file rather than test it.

- **The API token comes from main over `api:token`, never from an argument.** `process.argv` is readable by
  any process on the machine, so a token passed that way is one every process has. The firing case offers it
  on the command line and expects it to be ignored.
- **A port argument is a port or the default.** `parseInt` answered `NaN` for an empty or non-numeric value,
  and a window then connected to `ws://localhost:NaN` and failed about the URL rather than the argument. An
  assertion rather than a gate — main builds the argument from a number it holds — so the case names the
  edit that makes it fire: dropping the `Number.isInteger` guard.
- **Every `on*` unsubscribe leaves no listener behind**, counted across all eight, which is where a partial
  unsubscribe would hide: `apiStatus.onEvent` registers five listeners for one subscription.
- **One global and no second one**, since a second name is a second surface every pack frontend can reach.

`tests/electron-stub.ts` stands in for `contextBridge` and `ipcRenderer` and records what the bridge asked
for, as `@app/main`'s does for `app`. **A case must take the stub from the same fresh registry as the module
under test** (`load()` in `tests/bridge.spec.ts`): the bridge runs on import, so each case re-imports it
after `vi.resetModules()`, and a stub imported at the top of the file is then a different object from the one
the bridge just called — every assertion reads an empty map.

## Files

- `src/index.ts` — the whole surface: builds the API objects and calls `contextBridge.exposeInMainWorld('electronAPI', …)`.
- `src/exposed.ts` — the build entry. It imports `./index.js` for that side effect; the re-export beside it carries nothing, since the surface reaches a window through `contextBridge`.
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

The renderer and packs don't import this package's types. `Window.electronAPI` is declared in `packages/abuddy-sdk/src/fe/electron-api.ts`, a published contract re-exported by `@abuddy/sdk/fe`, so pack authors see it too (`packages/renderer/src/electron.d.ts` only points there). `SpeechEvent`, the event type that global's `speech.onEvent` hands back, is published from `@abuddy/sdk/fe` beside it, which is what this package and `@app/main` both import. When you change the surface here:

1. Add the main handler (`ipcMain.handle` for `invoke`, `ipcMain.on` for `send`).
2. Expose it in `src/index.ts`.
3. Update `electron-api.ts` and run `npm run api:update` in `packages/abuddy-sdk` (see the root `CLAUDE.md`, "SDK packages").

The declaration marks `electronAPI` optional, because it is missing outside Electron (vitest/jsdom). Callers use `window.electronAPI?.…`.

Not every member is declared, and **nothing checks the two lists against each other** — which is why this paragraph had gone stale by one entry before anyone noticed. As of 2026-10-10 the SDK type lacks `apiToken` (on purpose, above), `fileUtils.getPathForFile`, `shell.openImageExternal` and `apiStatus.openLogFile`. default-setup reaches `getPathForFile` through `(window as any)`, and the renderer's error page — plain script in `packages/renderer/index.html`, so outside the type anyway — calls `openLogFile` beside `reload` and `relaunch`. Nothing calls `openImageExternal` at all.

**Closing that for good means making the surface and the type one declaration**, the way this repo does elsewhere: a list of member paths that the type is derived from, which a spec then holds the exposed object to. It is not done, because the type is published (`api:update` territory) and the four divergences above are each a separate decision — one deliberate, one dead, two reached through an escape hatch.
