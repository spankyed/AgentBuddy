# Issue: Terminal integration — review findings and path forward

**Date:** 2026-10-01
**Status:** Open
**Severity:** High — the feature is unreliable in normal use; two defects can lose work
**Component:** `packages/default-setup/src/features/code` — terminal (xterm.js front end, node-pty back end)

## Symptom

The terminal is reported as "super buggy in general, especially in the FE UX", without a reproducible
bug list behind it. This document is the list: four review passes over the whole integration
(2,743 lines across eight files), grouped by cause rather than by symptom.

## What was reviewed

| File | Lines |
|---|---|
| `be/services/terminal.ts` | 430 |
| `be/features/terminal.ts` | 330 |
| `fe/utils/terminal-pool.ts` | 362 |
| `fe/utils/terminal-events.ts` | 218 |
| `fe/features/terminal/state.ts` | 457 |
| `fe/canvas/TerminalView.vue` | 272 |
| `fe/features/terminal/PanelTerminalSection.vue` | 604 |
| `fe/composables/useTerminalActions.ts` | 70 |

Passes: (1) ownership and lifecycle, (2) the output hot path, (3) process safety, (4) completeness
against a baseline terminal.

## Findings

| | Severity | Finding | Where |
|---|---|---|---|
| F1 | **High** | One xterm wrapper, two components claiming it | `terminal-pool.ts:240`, `TerminalView.vue:149`, `PanelTerminalSection.vue:282` |
| F2 | Medium | The panel scroll-jacks during output | `PanelTerminalSection.vue:296` |
| F3 | **High** | O(n²) string accumulation per terminal, on the main thread | `terminal-events.ts:106` |
| F4 | **High** | One bus event per pty chunk; no coalescing, no backpressure | `be/features/terminal.ts:76` |
| F5 | **High** | Resize storm, amplified into an EARS write per resize | `be/services/terminal.ts:153`, `TerminalView.vue:159,190,195` |
| F6 | Medium | Up to 1 MB of synchronous `localStorage` per terminal per burst | `terminal-events.ts:47` |
| F7 | **High** | `restoreAll` SIGKILLs a stored pid and its process group, unbounded | `be/services/terminal.ts:366` |
| F8 | Medium | First pty output can be lost before `onData` is registered | `be/features/terminal.ts:131` |
| F9 | **High** | Every terminal error is silently swallowed | `fe/features/terminal/state.ts:250` |
| F10 | Medium | No WebGL context-loss recovery | `terminal-pool.ts` (absent) |
| F11 | Medium | Clear doesn't survive a restart | `TerminalView.vue:133` |
| F12 | Medium | Paste bypasses bracketed paste in two of three paths | `TerminalView.vue:125`, `terminal-pool.ts:201` |
| F13 | Low | The shell allow-list is inert on the default path | `be/services/terminal.ts:276` |
| F14 | Low | `enableShellIntegration` defaults to `false` | `settings.ts:18` |
| F15 | Low | Focus is stolen on every attach | `TerminalView.vue:202`, `PanelTerminalSection.vue:316` |
| F16 | Low | Unhandled clipboard promise rejections | `terminal-pool.ts:194,200`, `TerminalView.vue:118` |
| F17 | Low | Module-scope `document` listener is never removed | `terminal-pool.ts:355` |

### F1 — One DOM node, two owners

The pool holds a single `wrapper` per terminal id. Both `TerminalView.vue` (a canvas tab) and
`PanelTerminalSection.vue` call `ensure` + `attach` for the same id. `attach` re-parents that one node;
`detach` calls `wrapper.remove()`. So the same terminal open in a tab *and* the panel leaves one of them
blank, and unmounting either empties the other.

Both then register handlers on the **shared** `term` — `onWriteParsed`, `onResize`,
`onSelectionChange` — so with both mounted there are two RESIZE sends per fit and two competing scroll
policies. This is the highest-value defect: it accounts for "the terminal randomly goes blank" and much
of the erratic feel.

### F2 — The panel scroll-jacks

`PanelTerminalSection.vue:296` calls `term.scrollToBottom()` on every parsed write with no pin check;
`TerminalView.vue:186` guards the same call with `isPinnedToBottom`. Scrolling up in the panel during
output yanks the view back down.

### F3 — O(n²) accumulation

`terminal-events.ts:106`: `currentOutput = existingOutput + data`, retained up to
`MAX_OUTPUT_LENGTH = 1 MB`. Every pty chunk (~2 KB) copies the whole retained buffer — roughly 500 MB of
memcpy per MB of output, per terminal, on the renderer's main thread. The comment immediately above says
*"Use array join for better performance with large strings"* and then concatenates; the comment describes
code that is not there.

### F4 — One event per chunk

`be/features/terminal.ts:76` emits `terminal.OUTPUT` for each `onData`. node-pty emits many small chunks
and each becomes an envelope through the bus, tRPC and the websocket. There is no batching anywhere, and
`pty.spawn` is called without `flowControl`, so a runaway producer has nothing throttling it. VS Code
coalesces pty data on a ~5–15 ms timer for this reason.

### F5 — Resize storm, amplified into the database

`be/services/terminal.ts:153` writes to EARS on **every** resize, with no change-guard and no debounce.
On the front end:

- `TerminalView.vue:159-163` calls `fit()` — which fires `onResize` and sends — and then calls
  `sendResize()` explicitly. Two sends per fit.
- `TerminalView.vue:195` runs `fit()` synchronously inside a `ResizeObserver` with no rAF.
  `PanelTerminalSection.vue:308` *does* rAF-debounce, so the two views disagree.

Dragging a panel divider therefore produces a flood of pty resizes and EARS writes. **This is also a
lead for the open LMDB write-discard issue** (`docs/archive/issues/postmortem-pattern-kill-note-loss.md`):
it is the most write-heavy path in the app, writing short rows at high frequency.

### F6 — Synchronous 1 MB localStorage writes

`terminal-events.ts:47`. The 500 ms debounce does reset correctly during continuous output, so it fires
after a pause rather than repeatedly during a build — but it is still a synchronous main-thread write of
up to 1 MB per terminal. With the default `maxTerminals: 25` it also exceeds a typical ~5 MB origin quota,
after which every save throws and `reclaimQuota` rescans all of `localStorage` on each attempt.
`localStorage` is shared across windows, so two windows interleave writes to the same keys.

### F7 — Unbounded pid kill

`be/services/terminal.ts:364-370`: `process.kill(oldPid, 0)`, then `killProcessGroup(oldPid)`
(`kill(-pid, 'SIGHUP')`), then `SIGKILL`. Pids are recycled, so after a crash or a reboot that number can
name an unrelated process, and the group kill widens the blast radius.

The repo already owns the right predicate: `recordIsStale` (`@abuddy/host/process-liveness`) bounds a pid
by the record's mtime against this machine's boot, and its header documents exactly why a bare pid cannot
answer this question. This code uses neither predicate.

### F8 — Lost first output

`create()` spawns the pty and injects shell integration; the caller registers `onData` afterwards
(`be/features/terminal.ts:131`). Output produced in that window has no listener. `restoreAll` has the same
shape. This is the intermittently missing first prompt or shell banner.

### F9 — Errors are written and never read

`terminal.ERROR` reaches `assignTerminalError`, which writes `context.terminalError`
(`fe/features/terminal/state.ts:250`). **Nothing reads it** — a grep for `terminalError` returns only the
type declaration, the assign, and the initial value. So `Maximum number of terminals (25) reached`,
`Failed to create terminal`, and every "not found" is invisible: the user clicks New Terminal, nothing
happens, and no message is produced anywhere.

### F10 — No WebGL context-loss recovery

`onContextLoss` appears nowhere in the tree. xterm's WebGL addon requires disposing on context loss to
fall back to the DOM renderer; without it a GPU reset — common in Electron with several canvases — leaves
a permanently blank terminal. The pool's own `dispose` comment records that lost GL contexts have already
been seen crashing the addon teardown, so this is observed, not hypothetical.

### F11 — Clear doesn't stick

`clearTerminal` (`TerminalView.vue:133`) calls `term.clear()` only; the persisted byte log in
`terminalEventBus` is untouched, so the cleared content returns on the next app start when the buffer is
replayed. `term.clear()` also keeps scrollback, where `reset()` is what users mean by Clear.

### F12 — Bracketed paste bypassed

The `abuddy:paste` handler correctly uses `term.paste()` (`terminal-pool.ts:361`), but the context-menu
Paste sends raw text to the pty (`TerminalView.vue:125`) and Ctrl+Shift+V does `sendInput(text)`
(`terminal-pool.ts:201`). A multi-line paste then executes line by line instead of arriving as one block,
which is actively dangerous with a half-finished command on the prompt.

### F13 — The shell allow-list is inert

`validateShell` rejects anything outside `ALLOWED_SHELLS` and returns `this.defaultShell` — which is
`process.env.SHELL`, the value it just rejected. A fish or nushell user gets their shell regardless, plus
an `Invalid shell requested` warning on every terminal creation. `fish` is absent from the list even
though `injectShellIntegration` has a fish branch. Either the list is a control, and the fallback must be
a known-good shell, or it is not, and it should go.

### F14 — Shell integration off by default

`settings.ts:18` sets `enableShellIntegration: false`, so OSC 7/633 cwd tracking is off out of the box:
titles never follow `cd`, `updateCwd` never fires, and the persisted `cwd` stays the creation directory —
a restored terminal reopens where it started rather than where the user was.

### Completeness gaps against a baseline terminal

| Missing | Consequence |
|---|---|
| `SearchAddon` | no find in a 10,000-line buffer |
| `SerializeAddon` | "restore" replays a raw byte log, so SGR state is wrong after a trim; a buffer snapshot is the standard answer |
| scrollback / font-size settings | both hardcoded (`10_000`, `14`); no zoom |
| exit status | the exit code is delivered and discarded; the tab simply vanishes |
| `TERM`, `TERM_PROGRAM_VERSION` | `TERM` relies on node-pty's `name`; version unset |
| tests | no spec anywhere covers terminal behaviour, front or back |

## Checked and sound

Recorded so they are not re-investigated:

- `Terminal.dataDisposable` / `exitDisposable` **are** assigned, via `onData` / `onExit`
  (`be/services/terminal.ts:247-274`) — not a leak.
- The `terminal.CLOSED` path correctly calls `clearOutput` then `dispose`
  (`fe/features/terminal/state.ts:258-261`).
- `savedScrollFraction`'s save and restore are self-consistent (`t/H` then `f*H`), so tab-switch scroll
  restoration is correct when content has not changed.
- The output trim stops on a newline boundary deliberately, to avoid splitting an escape sequence
  (`terminal-events.ts:111-121`).

Already fixed, for context: a restored terminal presented a new shell as a continuous session; the pool
now marks the seam when a pty is replaced under it (`508715336`).

## Root causes

These are not seventeen unrelated bugs. They are three causes:

1. **Ownership is diffused.** Three modules each own part of one terminal's lifecycle, so every
   invariant — one host, one handler set, one scroll policy — is a convention rather than a structure.
   F1, F2, F5 and F15 follow from this.
2. **There are three copies of the scrollback** — xterm's own buffer, the event bus's string, and
   `localStorage` — and the two that were added are the slow ones. F3, F6 and F11 follow.
3. **Nothing is observable.** There are no tests, and the one error channel is write-only. F9 is the
   extreme case, and it is why "buggy in general" had no bug list behind it.

## Path forward

**Stage 0 — make it observable before touching the hot path.** The pack suite is `environment: 'node'`,
so `terminal-pool.ts` (which imports xterm and its CSS and constructs a `Terminal`) is unreachable by it.
Add a jsdom project for FE-DOM specs covering the pool and the bus, plus `drive/` scripts for the
interactive invariants: the same terminal in a tab and the panel, scrolling up during heavy output, a
divider drag, a restart. Without this, Stage 2 cannot be verified.

**Stage 1 — one owner per terminal.** A `TerminalSession` owning the xterm, the wrapper, the
subscriptions and the pty wiring. Views become hosts: they receive a node to mount and emit intent, and
cannot register a handler. This fixes F1, F2 and F15 by construction rather than by review.

One decision is open, and it is the only real fork: whether one terminal visible in both the tab and the
panel at once is *supported*. That needs two xterms over one pty — a real multiplexer, materially more
work. Making it exclusive (move, do not copy) is far cheaper and matches VS Code.

**Stage 2 — fix the pipe.** Coalesce pty data in the backend on a ~8 ms or size threshold into one event;
enable node-pty `flowControl` with ack-based pause; replace the concat ring with a chunk list, or drop the
second copy entirely and snapshot xterm's own buffer with `SerializeAddon`; move persistence off
`localStorage`, which is synchronous, window-shared and quota-bound. Fixes F3, F4, F6, and makes F11
trivial.

**Stage 3 — resize discipline.** One send per settled size: rAF-debounce both observers, delete the
redundant explicit `sendResize`, guard `resize()` on changed dimensions, and stop writing EARS on resize
at all — persist on close or on an interval. Fixes F5, and removes a suspect from the LMDB investigation.

**Stage 4 — process safety.** Either bound the orphan kill with `recordIsStale`, or stop treating a stored
pid as a handle: the API process owns the ptys, so a pty whose parent died is already gone except for
daemonised children. Fixes F7.

**Stage 5 — surface the truth.** Route terminal errors through the shell's existing `notify` rather than
plugin context, so an error nothing renders becomes impossible rather than merely unnoticed; show exit
codes. Fixes F9.

**Stage 6 — close the gaps.** `onContextLoss`, bracketed paste on all three paths, `SearchAddon`,
scrollback and font settings, the shell allow-list decision, `TERM` set explicitly. Fixes F10, F12, F13,
F16, F17.

### What makes it stay fixed

- The `TerminalSession` seam, so a view *cannot* wire a handler.
- An invariant spec: exactly one attached host, and exactly one `onData` / `onResize` per terminal.
- A perf budget test — N MB of output must produce at most M events and at most K ms of main-thread
  time. This is the only thing here that would have caught F3 and F4 before a user felt them.

### Independently shippable first

- **F9** is a handful of lines and turns "mysteriously broken" into a message.
- **F10** is three lines and removes a class of permanently blank terminals.

Neither depends on Stage 1.
