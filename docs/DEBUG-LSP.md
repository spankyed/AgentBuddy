# Debug: LSP Features Not Working

Act as a senior software engineer debugging an LSP integration in an Electron app (XState + Vue 3 + Monaco Editor). The LSP subsystem was recently added but **intellisense, hover, and jump-to-definition are not working**. Three issues have already been fixed but the problem persists. Your job is to find what's still broken.

## What's Already Been Fixed

1. **Server killed on startup (race condition)** — A guard (`isNewBaseDirectory`) was added to `packages/api/src/systems/code/lsp/system.ts` so `updateBaseDirectory` skips killing servers when the path hasn't changed. Confirmed working in logs.

2. **Monaco bridge never created (timing)** — The default plugin is `Agent`, not `Code`. Monaco only loads when the user navigates to the Code plugin. Bridge creation was decoupled from the handshake: `handleInitialized` sets `handshakeComplete: true`, and `FileEditor.vue` sends `lsp.MONACO_READY` on editor mount. `attemptBridgeCreation` runs on both events and creates the bridge when both conditions are met.

3. **`typescript-language-server` not installed** — Was missing globally. Now installed and on PATH.

## Last Known Log Output

```
[bus-router] → Incoming: "lsp.START_SERVER" { type: 'lsp.START_SERVER', languageId: 'typescript', systemId: 'code' }
[LspService] Spawning language server: typescript-language-server --stdio (id: 143d5161-...)
[bus-router] → Incoming: "SET_BASE_DIRECTORY" { type: 'SET_BASE_DIRECTORY', path: '/Users/spankyed/Develop/Projects/AgentBuddy', systemId: 'code' }
[LspService] Language server typescript error: spawn typescript-language-server ENOENT
[bus-router] → Incoming: "lsp.TO_SERVER" { ... initialize request ... }
[LspService] Cannot send to server 143d5161-...: not available
```

These logs were captured **before** `typescript-language-server` was installed. It has since been installed globally. The app has not been retested yet.

## Architecture

### Backend (`packages/api/`)

- **`systems/code/system.ts`** — Parent code system. Spawns LSP child with `systemId: 'lsp'`. Routes events via wildcard `'*'` → `routeEvent` (splits event type on `.`, sends to `system.get(prefix)`).
- **`systems/code/lsp/system.ts`** — LSP child system. Handles `lsp.START_SERVER` (spawns process via `lspService`), `lsp.TO_SERVER` (forwards to process stdin), `lsp.UPDATE_BASE_DIRECTORY` (guarded: skips if same path). Emits `lsp.FROM_SERVER`, `lsp.SERVER_STARTED`, `lsp.SERVER_STOPPED`, `lsp.SERVER_ERROR` via `rootEvents.emitOutgoing()`.
- **`systems/code/lsp/process-manager.ts`** — Manages language server child processes. Buffer-based stdout parsing with Content-Length framing. `messageCallback` fires for each complete JSON-RPC message.

### Frontend (`packages/renderer/`)

- **`plugins/code/state.ts`** — Code plugin state machine. Wildcard `'*'` handler calls `routeEvent` to forward `lsp.*` events to LSP child actor. `initializeLsp` action sends `lsp.INIT` to LSP child on `CODE_CONNECTED`.
- **`plugins/code/lsp/state.ts`** — LSP child actor (`systemId: 'lsp'`). States: `idle` → `active`. On `lsp.INIT`: creates `LspClient`, sends `lsp.START_SERVER` to backend. On `lsp.SERVER_STARTED`: starts initialize handshake via `client.initialize(rootUri)`. On `lsp.INITIALIZED`: sets `handshakeComplete`. On `lsp.MONACO_READY`: `attemptBridgeCreation` creates `MonacoLspBridge` if both handshake complete and Monaco available.
- **`plugins/code/lsp/lsp-client.ts`** — Sends JSON-RPC requests via `trpc.bus.send.mutate()` with `systemId: 'code'`, `type: 'lsp.TO_SERVER'`. Handles responses by matching request `id` to pending requests map. 30s timeout per request with cleanup on resolve/reject.
- **`plugins/code/lsp/monaco-lsp-bridge.ts`** — Registers Monaco completion/hover/definition/signature providers for supported languages. Tracks models with `file://` URI scheme only. Sends `didOpen`/`didChange`/`didClose` to LSP client.
- **`plugins/code/canvas/FileEditor.vue`** — Sends `lsp.MONACO_READY` to LSP actor via `applicationState.system.get('lsp')` on editor `@mount`.

### Event Flow: Backend → Frontend

Backend action calls `rootEvents.emitOutgoing(wrapped.event)` → tRPC WebSocket subscription → frontend application actor strips `pluginId` and sends to code plugin actor → code plugin wildcard `'*'` handler calls `routeEvent` → routes to LSP child actor by prefix.

### Event Flow: Frontend → Backend

`trpc.bus.send.mutate({ systemId: 'code', type: 'lsp.TO_SERVER', ... })` → backend bus router validates and routes to code system → code system wildcard `'*'` calls `routeEvent` → routes to LSP child system by prefix → `forwardToServer` action calls `lspService.send()` which writes Content-Length framed message to process stdin.

## What to Investigate

1. **Add `console.log` breadcrumbs** at every critical point to trace where the chain breaks:
   - Frontend LSP state machine: `initializeLsp`, `handleServerStarted`, `handleInitialized`, `attemptBridgeCreation`, `forwardServerMessage`
   - Backend LSP system: `startServer`, `forwardToServer`, stdout `messageCallback`
   - Specifically verify: Does `lsp.SERVER_STARTED` reach the frontend LSP actor? Does the `initialize` handshake response (`lsp.FROM_SERVER`) come back? Does `attemptBridgeCreation` actually fire and create the bridge?

2. **Verify the language server responds**: Does `typescript-language-server --stdio` start and respond to the `initialize` request? Check stderr output for errors (the `onError` callback logs stderr).

3. **Verify bridge creation conditions**: When the user navigates to Code plugin and opens a file, does `lsp.MONACO_READY` fire? At that point, is `handshakeComplete` true and `window.monaco` available? Check that the bridge's `start()` is called and providers are registered.

4. **Verify Monaco model tracking**: Models are created with `monaco.Uri.file(filePath)` in `UnifiedMonacoEditor.vue`. The bridge's `isFileUri` check requires `uri.scheme === 'file'`. The bridge's `isSupportedModel` also checks `model.getLanguageId()` against `['typescript', 'javascript', 'typescriptreact', 'javascriptreact']`. Verify both return true for open files.

## Key Files

| File | Purpose |
|------|---------|
| `packages/renderer/src/plugins/code/lsp/state.ts` | Frontend LSP state machine |
| `packages/renderer/src/plugins/code/lsp/lsp-client.ts` | JSON-RPC client |
| `packages/renderer/src/plugins/code/lsp/monaco-lsp-bridge.ts` | Monaco provider registration & model tracking |
| `packages/renderer/src/plugins/code/canvas/FileEditor.vue` | Sends `lsp.MONACO_READY` on mount |
| `packages/renderer/src/plugins/code/state.ts` | Code plugin event routing (wildcard handler) |
| `packages/renderer/src/core/components/UnifiedMonacoEditor.vue` | Creates Monaco models with `monaco.Uri.file()` |
| `packages/api/src/systems/code/lsp/system.ts` | Backend LSP system (spawn, forward, events) |
| `packages/api/src/systems/code/lsp/process-manager.ts` | Process spawn & stdout Buffer parsing |
| `packages/api/src/systems/code/system.ts` | Backend code system (event routing) |
