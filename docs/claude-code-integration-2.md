# Claude Code Integration Plan

## Context

AgentBuddy needs a first-class integration with Anthropic's Claude Code. To stay safely inside the Claude Code TOS, and to keep the official CLI as the actual driver of agentic behavior, we **wrap the `claude` CLI as a subprocess**. No logic is reimplemented and no code is copied from the reference repo at `/Users/spankyed/Develop/Projects/claude-code` — that repo is used strictly as protocol documentation.

Goal: **replicate the interactive Claude Code chat experience inside AgentBuddy**, reusing the existing threads/chat/artifact UI as much as possible.

Design decisions confirmed with the user:
- **UI**: extend the `threads` plugin with a new "Claude Code" thread kind. No new frontend plugin.
- **Permissions**: tool-approval prompts are routed into the AgentBuddy chat as approval blocks, via Claude Code's `--permission-prompt-tool` MCP hook.
- **Process model**: spawn-per-turn with `claude --resume <sessionId>`. No long-running subprocess per thread.
- **Orchestration**: implemented as a **flow in `packages/default-setup`** (actions + a flow), not as a new backend system. The only backend additions are a thin service layer for the subprocess I/O and a minimal session entity. The flow is content; the system graph is not touched.

---

## Architecture at a glance

```
Thread kind='claude-code'  ──►  brain (existing)  ──►  "Claude Code Session" flow
                                                              │
                                                              ▼
                                               Run Claude Code Turn action
                                                              │
                                                              ▼
                                               services.claudeCode.runTurn(opts, cb)
                                                              │
                                                              ▼
                                         spawn `claude --resume <id> --print
                                                 --input-format stream-json
                                                 --output-format stream-json
                                                 --mcp-config <permission-mcp>`
                                                              │
                                 stream-json NDJSON ◄─────────┤────────► stdin: SDKUserMessage
                                           │                  │
                                           ▼                  ▼
                                 event-translator       permission MCP (in-proc)
                                           │                  │
                                           ▼                  ▼
                                services.chat.sendBlockMessage(threadId, …)
                                services.emitter.emit("UPDATE_MESSAGE_STATE", …)
```

Each user turn in a Claude Code thread is one discrete run of the `Run Claude Code Turn` action. The action owns the whole subprocess lifecycle for that turn: it spawns, streams events to the thread chat via `services.chat`, awaits any permission prompts via an in-memory deferred map, waits for the subprocess to exit, and returns. The flow then `keep_alive`s until the next event.

---

## Flow layer (`packages/default-setup`)

### 1. Flow: `src/flows/claude-code-session-flow.ts`

```ts
import type { FlowDSL } from '../types';
import { entryTrack, action } from './_patterns';

export default {
  'Claude Code Session': [
    entryTrack([
      action('Start Claude Code Session', {
        label: 'start',
        map: {
          threadId: '$.event.data.payload.threadId',
          cwd:      '$.event.data.payload.cwd',
          model:    '$.event.data.payload.model',
          permissionMode:     '$.event.data.payload.permissionMode',
          appendSystemPrompt: '$.event.data.payload.appendSystemPrompt',
          addDirs:  '$.event.data.payload.addDirs',
        },
      }),
      { type: 'keep_alive' },
    ]),
    {
      event: 'user.message',
      label: 'User turn',
      exits: [[
        action('Run Claude Code Turn', {
          label: 'turn',
          map: {
            threadId: '$.event.data.payload.threadId',
            text:     '$.event.data.payload.text',
            references: '$.event.data.payload.references',
          },
        }),
        { type: 'keep_alive' },
      ]],
    },
    {
      event: 'claude.code.permission.response',
      label: 'Permission response',
      exits: [[
        action('Resolve Claude Code Permission', {
          label: 'resolvePerm',
          map: {
            requestId: '$.event.data.payload.requestId',
            decision:  '$.event.data.payload.decision',
            scope:     '$.event.data.payload.scope',
          },
        }),
      ]],
    },
    {
      event: 'claude.code.cancel',
      label: 'Cancel turn',
      exits: [[
        action('Cancel Claude Code Turn', {
          label: 'cancel',
          map: { threadId: '$.event.data.payload.threadId' },
        }),
      ]],
    },
  ],
} satisfies FlowDSL;
```

Dispatch: the existing root flow branches by `thread.forcedMode`. We add `'claude-code'` as a mode and route those threads to the `Claude Code Session` sub-flow (see §4 for the root-flow edit — small, DSL only).

### 2. Actions: `src/actions/claude-code/`

Four actions. Each follows the existing `ActionMeta` + `async function action(params, services, z, flowId)` contract (template: `src/actions/commands/gcmsg.ts`).

- **`start-claude-code-session.ts`** — takes `{ threadId, cwd, model?, permissionMode?, appendSystemPrompt?, addDirs? }`, validates with zod, calls `services.claudeCode.createSession(threadId, opts)`, emits a system message in the thread like "Claude Code session ready in /path/to/cwd". Returns `{ sessionRecordId }`.

- **`run-claude-code-turn.ts`** — the workhorse. Signature: `{ threadId, text, references? }`.
  1. Look up the session via `services.claudeCode.getSession(threadId)`. If it doesn't exist, error gracefully (system message).
  2. Add the user message to the thread via `services.chat.sendBlockMessage({ threadId, text, sender: 'user', blocks: [] })`.
  3. Create a placeholder assistant message (empty text, status=streaming) to receive partial deltas.
  4. Call `services.claudeCode.runTurn({ session, text, references }, callbacks)` where `callbacks` are:
     - `onEvent(streamJsonEvent)` — calls the shared `event-translator` (§7) which decides whether to patch the placeholder message, emit a new `tool_use` / `thinking` / `tool_result` block, or add an artifact via `services.artifact`.
     - `onPermissionRequest(req)` — creates a `permission_request` block message, registers a deferred in `services.claudeCode.pendingPermissions`, and returns the deferred's promise. The `Resolve Claude Code Permission` action is the other half of this handshake.
     - `onSessionIdCaptured(sessionId)` — first turn only: persists the CLI-assigned session id back to the session record so the next turn can `--resume` it.
  5. When `runTurn` resolves: finalize the placeholder message (mark `status=complete`, set usage/cost metadata). Return `{ ok: true, usage, totalCostUsd }`.
  6. On error: surface a system error message block, return `{ ok: false, error }`.

- **`resolve-claude-code-permission.ts`** — `{ requestId, decision: 'allow' | 'allow_session' | 'deny', scope? }`. Calls `services.claudeCode.resolvePendingPermission(requestId, decision, scope)`. Updates the corresponding permission block message to reflect the final decision (disabled buttons, chosen option highlighted).

- **`cancel-claude-code-turn.ts`** — `{ threadId }`. Calls `services.claudeCode.cancelActiveTurn(threadId)`. If there is no active turn, no-op.

All four are authored in TypeScript and compiled to `compiled-actions.json` by the existing `npm run compile` pipeline — no compiler changes needed.

### 3. Prompts

None. Claude Code owns the system prompt. The user's `appendSystemPrompt` flows through `--append-system-prompt` and never touches the prompts DSL.

### 4. Root flow edit

`packages/default-setup/src/flows/root-flow.ts` (or whichever flow currently branches by thread mode) gains one additional switch case: `thread.forcedMode === 'claude-code'` → spawn sub-flow `"Claude Code Session"` with the thread metadata as payload. This is a small DSL-only change; no runtime modifications.

---

## Backend services (thin)

### 5. `packages/api/src/services/claude-code.ts`

Mirrors the shape of `packages/api/src/services/cli.ts`. Exports a `claudeCodeService` object with:

```ts
interface ClaudeCodeService {
  resolveBinary(): string;                              // settings → which claude → error

  createSession(threadId, opts): { id: SessionId };     // persists metadata
  getSession(threadId): ClaudeCodeSession | null;
  attachSessionId(threadId, cliSessionId): void;        // first turn only

  runTurn(
    args: { session: ClaudeCodeSession; text: string; references?: Refs },
    cb: {
      onEvent(ev: StreamJsonEvent): void;
      onPermissionRequest(req: PermissionRequest): Promise<PermissionDecision>;
      onSessionIdCaptured(id: string): void;
    }
  ): Promise<{ usage?: Usage; totalCostUsd?: number }>;

  cancelActiveTurn(threadId): void;

  // permission handshake used across the action boundary
  pendingPermissions: {
    register(requestId, deferred): void;
    resolve(requestId, decision, scope?): void;
    rejectAllForTurn(turnId): void;
  };
}
```

Registered in `packages/api/src/services/index.ts` as `services.claudeCode`, so the auto-generated `Services` type in `packages/default-setup/defs/action-defs.d.ts` picks it up and actions can call it directly.

**Internal responsibilities:**

- **Binary resolution.** First `settings.claudeCode.binaryPath`, else `which claude`, else throw with a clear "Install Claude Code from https://docs.anthropic.com/…" message.
- **`runTurn`.**
  1. Writes a temporary `permission-mcp.json` (see §6) into a per-turn temp dir.
  2. Builds argv:
     ```
     claude
       --print
       --input-format stream-json
       --output-format stream-json
       --verbose
       --include-partial-messages
       --replay-user-messages
       [--resume <sessionId>]              # omitted on first turn
       [--model <model>]
       [--append-system-prompt <file>]
       [--permission-mode <mode>]
       --permission-prompt-tool mcp__agentbuddy__request_permission
       --mcp-config <permission-mcp.json>
       [--add-dir <dir> …]
     ```
  3. `child_process.spawn(bin, args, { cwd: session.cwd, stdio: ['pipe', 'pipe', 'pipe'] })`.
  4. Writes one `SDKUserMessage` NDJSON line to stdin then `end()`.
  5. Line-delimited NDJSON parser over stdout — emits each parsed object via `cb.onEvent`.
  6. First `system` init event captures `session_id` → `cb.onSessionIdCaptured`.
  7. Records `activeTurns[threadId] = { child, turnId }` so `cancelActiveTurn` can SIGINT then SIGTERM.
  8. When the child exits: rejects any still-pending permissions for the turn and resolves the promise with the final `result` event's `usage` and `total_cost_usd`.
- **`pendingPermissions`.** A `Map<string, Deferred<Decision>>` plus a parallel `Map<turnId, Set<requestId>>` so cancellation can drain.

### 6. Permission MCP bridge

Claude Code's `--permission-prompt-tool` dispatches tool-approval requests to an MCP tool we expose. Implementation:

- `packages/api/src/services/claude-code/permission-mcp.ts` — a tiny stdio MCP server script. A standalone JS file that the service **spawns itself as a child of the main API process** and registers in the per-turn `permission-mcp.json` as a `stdio` server. The CLI starts it; it talks JSON-RPC to the CLI over stdio; on each tool call it forwards the request to the parent API process via an IPC channel (named pipe / Unix socket whose path is injected via env var).
- The parent API process handles the forwarded request by calling `cb.onPermissionRequest(req)` from the active `runTurn` invocation (looked up by `turnId` also injected via env).
- `cb.onPermissionRequest` (defined inside `run-claude-code-turn.ts` action) posts the `permission_request` block to the thread, creates a deferred, and registers it in `pendingPermissions`.
- When the `Resolve Claude Code Permission` action later calls `pendingPermissions.resolve(requestId, decision)`, the deferred resolves, the callback returns, the MCP bridge responds to the CLI, and the CLI resumes.
- The MCP tool's response shape is the standard `{ behavior: 'allow' | 'deny', updatedInput?, message? }`. `'allow_session'` from our UI is translated to `'allow'` at the MCP boundary; the "remember for session" scope is persisted in AgentBuddy's own `pendingPermissions` layer so we don't re-ask on the same tool+input pattern in the same session.

If `@modelcontextprotocol/sdk` is already a backend dep, use it; if not, implement the one-tool stdio JSON-RPC server by hand (the surface is minimal: `initialize`, `tools/list`, `tools/call`).

### 7. Event translator

Not a service call site — just a pure module `packages/api/src/services/claude-code/event-translator.ts`. Stateless per-event, with a tiny per-turn accumulator held inside the action. The action calls `translate(event, ctx)` which returns zero or more `Effect` objects like `{ kind: 'patch_message', … }` / `{ kind: 'add_block', … }` / `{ kind: 'add_artifact', … }`, and the action then dispatches them through `services.chat` / `services.artifact`. Keeping the translator pure makes it unit-testable without spinning up XState.

Minimum events to translate (named per the public stream-json schema):

| stream-json event            | Effect on the thread                                              |
|------------------------------|-------------------------------------------------------------------|
| `system` init (`session_id`) | `onSessionIdCaptured(sessionId)`                                  |
| `user` (replay)              | ignored (we already persisted the user message)                   |
| partial text delta           | `patch_message(placeholderId, appendText=…)`                      |
| `assistant` full message     | `patch_message(placeholderId, status='complete')`                 |
| `tool_use` block             | `add_block(placeholderId, { type: 'tool_use', status: 'running' })`|
| `tool_result` block          | `patch_block(placeholderId, toolUseId, { status: 'done', output })`|
| `thinking` block             | `add_block(placeholderId, { type: 'thinking', text })`            |
| `result` (final)             | `patch_message(placeholderId, usage, totalCostUsd)`               |
| `error`                      | `add_block(placeholderId, { type: 'error', text })`               |

### 8. Minimal EARS entity: `ClaudeCodeSession`

Stores per-thread session metadata. Fields: `threadId`, `cliSessionId?` (populated after turn 1), `cwd`, `model?`, `permissionMode?`, `appendSystemPrompt?`, `addDirs?`, `createdAt`, `lastActivityAt`.

Register the entity type in the existing entity registry (look for where `EARS.Entity.Thread`, `.Message`, `.Artifact` are declared — `packages/api/src/core/ears/` or `packages/api/src/types`). This is the **only core backend code change** — a few lines to add the enum value and any registration hook. All reads/writes go through `services.claudeCode` using the existing `qx()` / `tx()` helpers.

---

## Threads system: minimal plumbing

Threads is the one existing system that must know Claude Code threads exist. Changes are surgical.

- **`packages/api/src/systems/threads/types.ts`**
  - Extend `BlockType` with `'tool_use' | 'tool_result' | 'thinking' | 'permission_request' | 'diff' | 'error'`.
  - Add `'claude-code'` to `ThreadEntity.forcedMode` (currently only `'birth'` at `types.ts:117`).
  - Extend `ThreadCreateData` to optionally carry CC options (`cwd`, `model`, `permissionMode`, `appendSystemPrompt`, `addDirs`).
- **`packages/api/src/systems/threads/system.ts`**
  - In the CREATE_THREAD path, if `forcedMode === 'claude-code'`, call `services.claudeCode.createSession(threadId, opts)` as a side-effect before emitting `THREAD_CONNECTED`.
  - In the existing user-message forwarding block (`system.ts:497-509`), the payload already ends up on brain; no change is needed there because brain will pick the right sub-flow by `forcedMode`. Verify this is the case; if brain uses a different selector, add the branch there instead.
- **`packages/api/src/systems/threads/repository/index.ts`** — thread creation accepts and persists the `forcedMode` flag (already supported) and passes CC options through to the action layer via the flow payload.
- **New event type on the threads api surface**: `CC_PERMISSION_RESPONSE` (from FE → BE). It re-emits as a brain event `claude.code.permission.response` that the Claude Code Session flow listens on. Same for `CC_CANCEL` → `claude.code.cancel`. These are tiny wrappers (a handful of lines each) and follow the existing pattern for `INTERACTIVE_MSG_RESPONSE`.

No new backend system files. No new root actors.

---

## Settings

Add a `claudeCode` settings group via the existing settings system (see `packages/api/src/systems/settings/`):

- `binaryPath?: string` — auto-detected; overridable.
- `defaultModel?: string`.
- `defaultPermissionMode?: 'default' | 'auto' | 'plan'`.
- `appendSystemPrompt?: string`.
- `defaultCwd?: string`.

No dedicated settings UI in v0.1 — the generic settings editor is enough. A polished panel is a follow-up.

---

## Frontend (`packages/renderer`)

All frontend changes stay inside the `threads` plugin. No new plugins.

### 9. New block components
Under `packages/renderer/src/plugins/threads/chat/blocks/`:
- `tool-use-block.vue` — tool name, collapsible JSON input, status pill (running / done / denied / errored), output preview.
- `tool-result-block.vue` — rendered inline or as an update to the matching `tool_use` block; typically we patch the existing block instead of creating a new one.
- `thinking-block.vue` — collapsible "Thinking…" drawer with streamed text.
- `permission-request-block.vue` — tool name, reason, Allow / Allow for session / Deny buttons; on click dispatches `CC_PERMISSION_RESPONSE` through `trpc.bus.send.mutate`.
- `diff-block.vue` — Monaco diff viewer for Edit/Write tool results (Monaco is already in the stack).
- `error-block.vue` — red system-error block.

Wire them into `InteractionContainer` (the existing block dispatcher referenced by `message.vue`).

### 10. Streaming
In `packages/renderer/src/plugins/threads/state.ts`, implement the existing `TOKEN_STREAM` event stub:
- Append incoming text to the message identified by `messageId` (creating it locally on the first delta if it does not exist yet).
- Implement `UPDATE_MESSAGE_STATE` to patch arbitrary block fields — needed so a `tool_use` block can flip from `running` to `done`.

### 11. Thread creation
In `packages/renderer/src/plugins/threads/canvas/create/` (create-thread canvas) add a "Claude Code session" option alongside the existing thread types. Selecting it reveals:
- Working directory picker (prefilled from the `code` plugin's last directory, falling back to `claudeCode.defaultCwd`).
- Model dropdown.
- Permission mode dropdown.
- Optional "append system prompt" textarea.
- Optional `--add-dir` entries.

On submit, dispatches a single `CREATE_THREAD` with `forcedMode: 'claude-code'` and the options attached.

### 12. Stop-generating affordance
If `chat.vue` already has a stop button (per existing streaming UI hooks), reuse it for CC turns. Otherwise add a Stop button visible while a CC turn is in flight; it dispatches `CC_CANCEL`.

---

## Critical files

**New (DSL, `packages/default-setup`):**
- `src/flows/claude-code-session-flow.ts`
- `src/actions/claude-code/start-claude-code-session.ts`
- `src/actions/claude-code/run-claude-code-turn.ts`
- `src/actions/claude-code/resolve-claude-code-permission.ts`
- `src/actions/claude-code/cancel-claude-code-turn.ts`

**Modified (DSL):**
- `src/flows/root-flow.ts` (or equivalent dispatcher) — route `forcedMode='claude-code'` threads to the new sub-flow.

**New (backend):**
- `packages/api/src/services/claude-code.ts` — service entry point.
- `packages/api/src/services/claude-code/runner.ts` — subprocess I/O.
- `packages/api/src/services/claude-code/event-translator.ts` — pure mapper.
- `packages/api/src/services/claude-code/permission-mcp.ts` — stdio MCP bridge.
- `packages/api/src/services/claude-code/repository.ts` — `ClaudeCodeSession` CRUD via `qx/tx`.

**Modified (backend, minimal):**
- `packages/api/src/services/index.ts` — register `services.claudeCode`.
- `packages/api/src/systems/threads/types.ts` — `BlockType` additions, `forcedMode: 'claude-code'`, CC options on create data.
- `packages/api/src/systems/threads/system.ts` — new thread creation side-effect; new incoming events `CC_PERMISSION_RESPONSE` / `CC_CANCEL` that re-emit as brain events `claude.code.permission.response` / `claude.code.cancel`.
- `packages/api/src/systems/threads/repository/index.ts` — accept CC options on create.
- `packages/api/src/core/ears/…` — one-line entity registration for `ClaudeCodeSession`.
- `packages/api/src/systems/settings/…` — new `claudeCode` settings group.

**New (frontend):**
- `packages/renderer/src/plugins/threads/chat/blocks/tool-use-block.vue`
- `packages/renderer/src/plugins/threads/chat/blocks/thinking-block.vue`
- `packages/renderer/src/plugins/threads/chat/blocks/permission-request-block.vue`
- `packages/renderer/src/plugins/threads/chat/blocks/diff-block.vue`
- `packages/renderer/src/plugins/threads/chat/blocks/error-block.vue`

**Modified (frontend):**
- `packages/renderer/src/plugins/threads/state.ts` — `TOKEN_STREAM` + `UPDATE_MESSAGE_STATE` implementation; `CC_PERMISSION_RESPONSE` / `CC_CANCEL` dispatchers.
- `packages/renderer/src/plugins/threads/chat/message.vue` + `InteractionContainer` — recognize new block types.
- `packages/renderer/src/plugins/threads/canvas/create/*` — "Claude Code session" option and its form.
- `packages/renderer/src/plugins/threads/chat/chat.vue` — Stop button hook for CC turns.

**Reused as-is:**
- `services/chat.ts` `sendBlockMessage` (template: `packages/default-setup/src/actions/commands/gcmsg.ts`).
- `services/artifact` for rendering file diffs / outputs as thread artifacts.
- `services/event-emitter.ts` for `emit()`.
- Thread fork/revert/recent behavior.
- Existing brain flow dispatcher.
- LLM settings / API keys (CC has its own auth; we never touch Anthropic keys for it).
- `cliService` shape in `packages/api/src/services/cli.ts` as the template for `claudeCodeService`.

---

## Open items to resolve during implementation

- Confirm whether `@modelcontextprotocol/sdk` is already a backend dep. If not, either add it or hand-roll the one-tool stdio JSON-RPC server (the surface is tiny).
- Validate the exact `--permission-prompt-tool` return contract against a real `claude --help` / live invocation; the plan assumes `{ behavior: 'allow' | 'deny', updatedInput?, message? }`.
- First-turn handling: `--resume` cannot be used on turn 1. Turn 1 spawns without it and captures `session_id` from the first `system` init event.
- Confirm where brain actually branches flows by thread mode; if it's in a TypeScript runtime helper rather than the root flow DSL, the dispatch addition moves into that helper (still small).
- Decide whether partial text streaming is gated by a toggle; default on.

---

## Verification

End-to-end manual test:

1. `npm install` (pick up any new deps) → `npm run typecheck` → `npm run test-build`.
2. `npm run compile` to rebuild the actions/flows JSON.
3. `npm start` with a workspace that has `claude` on PATH.
4. Create a new thread → "Claude Code session" → pick the AgentBuddy repo as cwd → submit.
5. In the chat, type: `List the top-level directories in this repo and then read package.json and summarize it.` Expect:
   - Assistant text streams token-by-token into a single assistant message.
   - A `tool_use` block appears for the `Bash ls` call (running → done with output).
   - A `permission_request` block appears before `Read`; click Allow once.
   - A second `tool_use` block appears for `Read` and completes.
   - A final summary streams in; the message turns `complete`; usage/cost is attached.
6. Send a second message: `Now write that summary to notes/summary.md`. Confirm:
   - The same `cliSessionId` is reused (check via `npm run db:cli` that `ClaudeCodeSession.cliSessionId` is unchanged).
   - The `Write` tool triggers another permission prompt.
   - On allow, the file is created on disk; a `diff` / `code` artifact appears in the thread's artifact tab.
7. Start a long-running task and click Stop mid-turn. Confirm the subprocess is killed and the thread returns to idle.
8. Fork the thread; confirm a fresh Claude Code session is started on the next turn in the fork (the forked thread should either get a new `ClaudeCodeSession` row or explicitly null its `cliSessionId`).
9. `npm run typecheck:be && npm run typecheck:fe` — must be clean.
10. `npm run db:cli` — spot-check that `ClaudeCodeSession` rows look right.

No Playwright automation in v0.1 — an external subprocess would need fixtures. Manual verification above is the acceptance criterion.
