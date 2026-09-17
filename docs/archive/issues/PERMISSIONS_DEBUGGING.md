# Claude Code permissions — current state + path forward

Status snapshot for the ongoing investigation into why in-chat permission prompts don't fire when Claude Code tries to edit / write files. Lives next to the wrapper code (`query.ts`, `control.ts`, `args.ts`) because the next maintainer will want full context before touching any of these files.

## 1. Symptom (what the user reports)

When the session artifact's Permission row is set to "Ask" and Claude attempts a file-editing tool, the user sees:

- Claude narrates prose like _"I need file write permission for FileSystemBrowser.vue. You should see a permission prompt in your terminal — just accept it and I'll make the edit"_, OR
- _"The edit didn't go through (permission errors). Let me apply it now"_ with the tool-activity block showing tools (Read / Edit / ExitPlanMode) stuck in `running` state

In both cases: **no in-chat approval block ever appears**, and the user has no way to grant permission. The app behaves as if Claude has no hands.

## 2. What's shipped so far

### F1 — `args.push('--permission-prompt-tool', 'stdio')` in `args.ts`

From the leaked CLI source at `src/cli/print.ts:4267-4293`, the CLI's `getCanUseToolFn` only takes the stream-based stdio path (which emits `can_use_tool` control_requests our wrapper handles) when `permissionPromptToolName === 'stdio'`. That value comes from `options.permissionPromptToolName` at `print.ts:803-805`, which is populated by the hidden argv flag `--permission-prompt-tool` (parsed at `main.tsx:988`).

Without the flag, the CLI takes its internal `hasPermissionsToUseTool` fallback branch, and for `ask`-decisions in non-interactive `--print` mode there's no surface to ask through — Claude gets told "denied" and generates the prose fallback.

F1 adds the flag unconditionally in `argsFromOptions`. Locked in as an always-emitted default via a unit test in `claude-code-args.spec.ts`.

### F2 — Diagnostic logs in the pump + control router

In `query.ts:pump()`, the `case 'control_request'` branch logs:

```
[claude-code-query] control_request received { subtype, request_id }
```

In `control.ts:dispatch()`, the `can_use_tool` branch logs three points:

```
[claude-code-control] dispatching can_use_tool { tool_name, tool_use_id, hasHandler }
[claude-code-control] can_use_tool decision resolved { tool_name, behavior }
```

Plus a warn-level `[claude-code-control] unhandled control_request subtype { subtype }` for the fallback-with-no-handler path.

These logs are the next diagnostic's ground truth. They say exactly which link in the chain is doing what.

### F3 — Explicit `initialize` control_request as the first stdin write

In `query.ts:query()`, before `writeUserTurn`, the wrapper sends:

```json
{"type":"control_request","request_id":"wrapper-initialize-<ts>","request":{"subtype":"initialize","hooks":{}}}
```

The CLI auto-initializes on the first user message (leaked source `print.ts:4059-4060`), so this is technically redundant, but it aligns us with the canonical SDK host pattern and closes any subtle path we might be missing. Fire-and-forget — the CLI's reply is a `control_response` which our existing swallow branch drops silently.

Logs `[claude-code-query] initialize control_request sent` on every send.

### Phase 2 session work still intact

- Session artifact Ask / Auto / Plan segmented control in `claude-session-artifact.vue` writes `content.permissionMode` via `UPDATE_CLAUDE_PERMISSION_MODE` → `updateAndNotify` → `ARTIFACT_UPDATED`
- `chat.ts` reads `readSessionPermissionMode` at action entry and passes it to `services.cli.claudeCode.query`
- The `onPermissionRequest` closure at `chat.ts:117-175` has diagnostic logs at invoked / sent / received / timed-out
- `awaitMessageResponse` default timeout raised from 120 s to 600 s, and a note block is emitted on timeout
- Phase B session-artifact `awaiting-input` status transition still fires inside the same closure

None of that changed. If the closure never gets called, the whole UI surface is dead regardless of how polished it is.

## 3. What we proved with tests (and what this rules out)

`packages/api/tests/unit/claude-code-query.spec.ts` now has **six end-to-end permission round-trip tests** in addition to the existing finaliseNoResult + stdin-EOF coverage:

1. **Basic can_use_tool → allow round-trip.** Mock stream emits `system/init` → `assistant` (tool_use block) → `control_request(can_use_tool)` → `result`. Spy handler asserts: invoked once with the right `tool_name` / `tool_use_id` / `input`; a `control_response` was written back to `stream.write` with matching `request_id` and `{behavior: 'allow'}` payload; the `result` promise resolved cleanly; consumer iterator saw only `system` / `assistant` / `result` (no `control_request` leak).
2. **Deny decision forwards through.** Same shape but the handler returns `{behavior: 'deny', message: 'user clicked deny'}`. The deny + message lands verbatim in the control_response.
3. **Default-deny when no handler.** No `onPermissionRequest` wired. The router returns `{behavior: 'deny', message: 'No permission handler configured'}` so the CLI never hangs waiting on a response.
4. **Passthrough of extra CLI fields.** Request includes `permission_suggestions`, `blocked_path`, `decision_reason`, `agent_id`, `title`, `display_name`, `description` — all fields the leaked CLI source at `structuredIO.ts:590-606` emits. The `.passthrough()` Zod schema preserves them through to the handler.
5. **Multiple concurrent `can_use_tool` requests.** Two distinct request_ids in one turn; each round-trips independently with the right `request_id` match on the response.
6. **`control_request` does not leak to the consumer iterator.** Regression guard for the `continue` in `pump()`'s switch case — if a future edit accidentally drops it, the line would leak.

Full suite: **237 passing** (231 previous + 6 new).

### What the passing tests definitively rule out

The bug is NOT in:

- **`pump()`'s switch-on-`line.type`.** If the CLI emits a `control_request` line, the pump routes it through the router correctly.
- **The control router's `can_use_tool` dispatch.** The router forwards to `onPermissionRequest` with the right shape, shapes the response correctly, and handles the no-handler fallback.
- **`stream.write` of the response.** The control_response object is shaped as `{type: 'control_response', response: {subtype: 'success', request_id, response}}` — exactly what the leaked CLI source expects at `structuredIO.ts:362-429` when matching against `pendingRequests`.
- **The Zod schema rejecting CLI-emitted fields.** `.passthrough()` preserves everything.
- **The `continue` in the pump case silently leaking control_request lines** into the consumer iterator.

Also verified by the passing debug logs during those tests:
- `initialize control_request sent` fires once per `query()` (F3 is live)
- `control_request received { subtype: 'can_use_tool' }` fires for each incoming permission line (F2 pump log is live)
- `dispatching can_use_tool { hasHandler: true }` fires (router sees the handler wired)
- `can_use_tool decision resolved { behavior: 'allow' }` fires (handler returned cleanly)

Every one of those is observable in the live logs the next time a work-mode turn triggers a permission request.

## 4. Remaining hypotheses (ranked)

### H1 — Running subprocess is stale, F1/F2/F3 not actually executing (HIGH)

Backend TypeScript changes in `args.ts`, `query.ts`, `control.ts` are **not HMR-reloaded**. Vite HMR only covers the renderer. The Electron main process spawns the API subprocess via `packages/main/src/modules/api-server/...` with the compiled `dist/server.js` of the api workspace.

If the user hit Vite reload / re-ran `npm run start:gen` but the existing Electron process was reused without restarting the API subprocess, the old build keeps running and none of F1/F2/F3 are live.

**Confirm/deny in one step**: on the next reproduction, look at the backend console (the one showing `[api]` / `[claude-code-query]` / `[claude-code-control]` prefixes). If F2/F3 logs (`initialize control_request sent`, `control_request received`, `dispatching can_use_tool`) are absent during a work-mode turn, the new code isn't running at all.

**Force fix**: full cmd-Q Electron (or Activity Monitor kill if it doesn't die cleanly) → `npm run build:be` → `npm run start:gen` from a clean terminal.

### H2 — F1 is running, argv flag reaches the CLI, but the CLI still doesn't emit `can_use_tool` (MEDIUM)

A few sub-variants:
- The installed Claude CLI is old enough that `--permission-prompt-tool stdio` is parsed (no argv error) but doesn't fully wire up `structuredIO.createCanUseTool`. Unlikely but possible.
- `structuredIO.sendRequest` writes the control_request line to stdout, but something in our subprocess pipe drops it — broken pipe mid-turn, partial write, Node stream backpressure. We'd see the first 2–3 events (system/init, assistant) arrive correctly in our pump, then a gap where the control_request should be, then silence because the CLI is waiting forever for our response.
- The CLI treats `--permission-prompt-tool stdio` as requiring an MCP server named "stdio" (not the special keyword our interpretation assumes), and when that server doesn't exist it silently falls back. Worth checking by actually tee'ing the CLI's stdout to a file and inspecting what it emits.

**Confirm/deny**: after H1 is ruled out, tee the CLI's stdout to a file. Easy to add as a temporary diagnostic in `runner.ts:spawnStream`:

```ts
const debugTap = fs.createWriteStream('/tmp/claude-cli-stdout.log')
child.stdout.pipe(debugTap, { end: false })
```

Then grep the file for `"control_request"` and `"can_use_tool"` after a failing turn. If no match, the CLI really isn't emitting — H2 confirmed. If a match is present but F2's `control_request received` log didn't fire, we have a pump-level drop (H3).

### H3 — CLI emits `can_use_tool`, pump reads it, but the router doesn't dispatch (VERY LOW)

Covered by six passing tests. Would require the tests' simulation to disagree with the real CLI's output in a way the `.passthrough()` schema doesn't catch, which is hard to construct. Listed for completeness.

### H4 — Everything works, but the approval block renders somewhere the user isn't looking (LOW)

If F2 logs show `permission handler invoked { tool_name: 'Edit' }` during the failing turn, the handler is running and `sendApprovalBlock` is being called. At that point the bug is in the frontend — either the `MESSAGE_ADDED` event isn't reaching the renderer, or the message is being rendered but off-screen / obscured / styled invisibly.

Diagnostic: query the thread's message list directly via `npm run db:cli` and look for a recent message with an `approval` block type. If present, it's a render bug. If absent, the backend never created it despite the handler being called — weirder, but pinpointable.

## 5. Next-step decision tree (execute in order)

The goal: **after one more reproduction, we should know exactly which hypothesis is live.** Each branch has a clear next action.

### Step 0 — Force a clean restart

1. cmd-Q Electron. Verify it's gone via Activity Monitor; any stragglers get force-killed.
2. `cd packages/api && npm run build` (or `npm run build:be` from repo root) — compiles the new F1/F2/F3 TypeScript into `dist/`.
3. `npm run start:gen` from a clean terminal. Open the dev tools console BEFORE sending any message.

### Step 1 — Send a test message

In a work-mode thread with the session artifact Permission row on "Ask", send: _"Add a TODO comment at the top of `packages/api/src/server.ts`."_

Then watch the backend console for this exact log trail. Missing lines are the diagnostic signal.

| Log line | Origin | If missing |
|---|---|---|
| `chat action invoked` | prior task, `chat.ts:~70` | chat action isn't firing → Claude Code flow isn't routing; check the work-mode branch condition on the flow's switch node |
| `initialize control_request sent` | F3, `query.ts` | **F3 isn't running → H1 confirmed.** Backend subprocess is stale. Repeat Step 0 with Activity Monitor verification. |
| `stream event { type: 'system' }` | prior task, `chat.ts:~180` | CLI spawned but not producing output → `resolveCwd` failure or CLI auth failure; check the first `stream event` output and `ClaudeExitError` in the catch block |
| `stream event { type: 'assistant' }` | prior task | CLI responding but not reaching the tool_use phase → model issue, not a permission issue |
| **`control_request received { subtype: 'can_use_tool' }`** | **F2, `query.ts:pump`** | **CRITICAL: CLI isn't emitting. Move to H2 diagnosis (tee stdout).** |
| `dispatching can_use_tool { hasHandler: true }` | F2, `control.ts:dispatch` | CLI emitted, pump routed, but router isn't dispatching → H3 (very unlikely given test coverage). Check schema decoding in `ndjson.ts` |
| `dispatching can_use_tool { hasHandler: false }` | F2, `control.ts:dispatch` | Handler wasn't plumbed through — check `chat.ts:171` passes `onPermissionRequest` into `cli.claudeCode.query` |
| `permission handler invoked { tool_name: 'Edit' }` | prior task, `chat.ts:119` | Router dispatched but our closure threw before the log → check for an early exception in the closure body |
| `can_use_tool decision resolved { behavior: 'allow' }` | F2, `control.ts:dispatch` | Handler resolved cleanly — chain is done |
| `permission response received { decision: 'allow', durationMs: N }` | prior task, `chat.ts:~145` | Closure resolved and is about to return to the router |

### Step 2 — Act on the missing line

**If `control_request received` never logs** (H1 or H2):
- First rule out H1: add `console.log('[args-debug]', JSON.stringify(args))` inside `argsFromOptions` right before the return. On the next turn, confirm `--permission-prompt-tool stdio` is actually in the printed array. If it's missing, F1 isn't running → full Activity Monitor restart.
- If the flag IS in argv but `control_request received` still never logs → H2. Add the stdout tee at `runner.ts:spawnStream`:
  ```ts
  import * as fs from 'fs'
  const tap = fs.createWriteStream(`/tmp/claude-cli-${Date.now()}.log`)
  child.stdout.on('data', c => tap.write(c))
  ```
  Trigger another failing turn. Inspect the log. If `"can_use_tool"` never appears → the CLI really isn't emitting → check CLI version with `claude --version`, look for a `permission-prompt-tool` entry in `claude --help`, consider upgrading.

**If `control_request received` fires but `dispatching can_use_tool` doesn't**: the switch in `dispatch()` at `control.ts:88` isn't matching `'can_use_tool'`. Only way this happens is if the subtype string has unexpected characters. Log `JSON.stringify(line.request)` in `pump()` to inspect.

**If `dispatching can_use_tool { hasHandler: false }` fires**: `opts.onPermissionRequest` is undefined at the router layer. The wiring chain from `chat.ts` → `cli.ts` → `query.ts` → `createControlRouter` is broken. Check each hop.

**If `permission handler invoked` fires but `permission response received` never does AND `can_use_tool decision resolved` never fires**: the closure is running but throwing before the try/catch can log. Wrap the top of the closure in its own try/catch with a `log.error('permission handler threw before dispatch', …)`.

**If the full trail fires but the user still sees no approval block** (H4): the approval-block message IS being created in LMDB but isn't reaching the UI. `npm run db:cli` and query for recent messages in the thread with `blocks` containing an `approval` type. If the row exists, the `MESSAGE_ADDED` event isn't being emitted or routed correctly — check `services/chat.ts:sendApprovalBlock` and the threads plugin state handler for the event.

## 6. What NOT to do in the next pass

- **Don't add more unit tests of the wrapper chain.** Six scenarios cover it. The bug is now provably not in the part of the codebase we can unit-test.
- **Don't rewrite `control.ts` or `query.ts`.** They work. The tests prove it.
- **Don't add complex handshake retry logic.** The CLI's handshake is simple; F3 already matches the canonical SDK pattern. Complexity won't help.
- **Don't tee stdout permanently** if H2 ends up being the cause. Scope any diagnostic taps to the investigation window and remove them after.
- **Don't touch the frontend approval block components** unless the F2 logs show the chain completing and the bug is confirmed to be in the render path.

## 7. Files that will be relevant to the fix (wherever it lands)

| Layer | File | Current state |
|---|---|---|
| argv | `packages/api/src/services/claude-code/args.ts` | F1 applied; test locked in; no known bugs |
| spawn | `packages/api/src/services/claude-code/runner.ts` | No changes needed; potential site for temporary stdout tee diagnostic |
| stream | `packages/api/src/services/claude-code/ndjson.ts` | Pure JSON.parse per line; not a likely suspect |
| pump | `packages/api/src/services/claude-code/query.ts` | F2 pump log + F3 initialize send; test coverage is complete |
| router | `packages/api/src/services/claude-code/control.ts` | F2 dispatch/resolve logs; unit tests cover every branch |
| action | `packages/default-setup/src/actions/claude-code/chat.ts` | `onPermissionRequest` closure has prior-task logs at every state boundary |
| service facade | `packages/api/src/services/chat.ts` | `sendApprovalBlock` creates the message; not a suspect |
| message routing | `packages/api/src/systems/threads/system.ts` | `MESSAGE_ADDED` emission path |
| frontend state | `packages/renderer/src/plugins/threads/state.ts` | `MESSAGE_ADDED` handler merges into tab messages |
| frontend render | `packages/renderer/src/plugins/threads/chat/interactions/InteractionContainer.vue` + `ApprovalButtons.vue` | dispatcher + button component |

## 8. TL;DR

- **Shipped**: F1 (`--permission-prompt-tool stdio` argv), F2 (diagnostic logs in pump + router), F3 (explicit initialize handshake). **237 passing unit tests** including 6 new end-to-end permission round-trip scenarios.
- **Proven**: the entire wrapper-side chain from pump → router → handler → stream.write works correctly in isolation for every shape of `can_use_tool` request we can simulate (including all the optional fields the leaked CLI source emits).
- **Not proven**: that the installed CLI binary actually emits `can_use_tool` control_requests for the user's specific repro. That's what the next live reproduction will tell us.
- **Most likely cause**: H1 — user's API subprocess is running stale compiled code because backend TypeScript doesn't HMR. Force-restart cleanly and re-test.
- **Next action**: run through the Step 0 → Step 1 → Step 2 decision tree above during one more reproduction. The resulting log trail will immediately pinpoint which link is broken. Every possible broken-link scenario has a concrete next action documented.
- **If the whole trail fires and the user still sees no approval block**: the bug is in the frontend message routing / rendering, and the investigation moves to `services/chat.ts:sendApprovalBlock` → `threads/system.ts` MESSAGE_ADDED emission → `state.ts` handler → `InteractionContainer.vue` dispatcher.
- **Definitely NOT** in the pump, the control router, the Zod schema, or the control-response shape. Those are ruled out by the passing test suite.
