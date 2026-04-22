# Revert Flow — "Session Expired" & Broken Conversation State

## Symptom

When reverting to a previous message in a Claude Code thread, the session sometimes errors with **"Session expired — the conversation file was deleted or is invalid"**. The thread enters a broken state showing "Session X not found" in a red banner. Sending a new message silently starts a fresh session with zero context — catastrophic data loss.

---

## Revert Flow (traced step by step)

```
RevertHistoryPopup.vue → REVERT_THREAD event
  → threads/system.ts:721 → softDeleteMessagesAfter() + brain event
  → CC: Handle Revert (handle-revert.ts) → kills CLI, finds cliUuid, sets revertTo flag
  → User sends next message → chat.ts reads revertTo
  → CLI: --resume <sessionId> --fork-session --resume-session-at <cliUuid>
  → CLI creates new forked session JSONL, truncated at cliUuid
```

---

## Findings

### 1. Nothing in AgentBuddy deletes session JSONL files
**Severity:** Root cause is external

`sessions.remove()` exists (`services/claude-code/sessions.ts:287`) but is **never called** during revert or any normal operation. The session JSONL file must be deleted by:
- **Claude CLI's own session cleanup** (most likely — CLI may auto-expire old sessions)
- Manual cleanup of `~/.claude/projects/`
- OS-level cleanup

When chat.ts tries `--resume <deleted-sessionId>`, the CLI errors → `extractStaleSessionId()` catches it → `markSessionBroken()` sets `sessionId: ''` + `chatState: 'error'`.

**The revert code itself is NOT causing the deletion.** But revert makes the problem visible because it references the old sessionId via `--resume`.

### 2. CWD mismatch can cause phantom "session not found"
**File:** `chat.ts:288-295`
**Severity:** Potential silent bug

```typescript
sessionCwd = resumeSessionId ? readSessionCwd(services, threadId) : undefined;
```

Session JSONL files live under `~/.claude/projects/<encoded-cwd>/`. If `sessionCwd` is missing from the artifact, the CLI falls back to `process.cwd()` — which may not match where the session was created. The CLI then looks in the wrong directory → "session not found" even though the file exists on disk.

The code logs a warning (line 292) but proceeds, producing a confusing error.

### 3. Recovery UX silently starts a fresh session — causes data loss
**File:** `chat.ts:233-235`
**Severity:** Critical UX issue

After `markSessionBroken()`, the artifact shows "Session X not found" in a red banner. Sending a new message clears the error (line 235: `updateSessionArtifact(services, threadId, { sessionError: undefined })`) and starts a fresh session. But:
- No "Start fresh session" button — user must know to just type a new message
- The error message says "Your next message will start a fresh session" but the broken artifact appearance discourages interaction
- Session history/context from the old session is **permanently lost**

### 4. Revert-guard silently drops revert intent
**File:** `chat.ts:116-131`
**Severity:** Correct but silent

```typescript
if ((forkFrom || revertTo) && !resumeSessionId) {
  // Drops revert, starts fresh — no user notification
}
```

If the stream-consumer clears `sessionId` between handle-revert storing `revertTo` and the next chat turn, the revert is silently abandoned. The user's intent to revert is lost with no indication.

### 5. `softDeleteMessagesAfter` deletes the target message itself
**File:** `threads/repository/index.ts:858`
**Severity:** By design, but edge-case risk

Uses `nonDeleted.slice(targetIndex)` — the revert target is included in the deletion set. If the user reverts to the **first message**, ALL messages are soft-deleted. Thread is still visible but appears empty.

---

## What's Working Correctly

| Area | Status |
|------|--------|
| Revert message flow | ✅ Correct |
| Handle Revert cliUuid lookup | ✅ Correct |
| One-shot flag lifecycle | ✅ Correct |
| Fork doesn't delete original session | ✅ Confirmed |
| Revert-guard for missing sessionId | ✅ Defensive, but silent |

---

## Recovery UX — Why "Start Fresh" Is Wrong

### Current recovery flow
1. CLI errors with "session not found" on resume
2. `markSessionBroken()` sets `sessionId: ''`, `chatState: 'error'`, `sessionError: <message>`
3. Artifact shows red banner: "Session X not found"
4. Below the thread: "Session expired — the conversation file was deleted or is invalid. Your next message will start a fresh session."
5. User sends a new message → `chat.ts:233-235` clears the error and starts a **brand new session** with zero context

### Why this is harmful

**It's the opposite of what the user asked for.** The user clicked "revert" because they wanted to go *back* to a known-good point in the conversation. Instead they get:
- Complete loss of conversation context (all prior turns, system prompts, tool history)
- No way to recover — the old session is gone, the new one has no memory of it
- The revert intent is silently dropped (Finding 4) with no notification

**Starting a fresh session should never be an automatic recovery mechanism.** It should be an explicit, last-resort action the user opts into after understanding the tradeoff.

### What should happen instead
- Surface the error clearly: "Could not revert — the CLI session file is no longer available"
- Offer explicit options: "Start fresh session" vs "Keep current state" vs "Retry"
- Don't auto-clear the error on next message — that hides the failure mode
- Consider: can we reconstruct context from our own message history instead of depending on the CLI's JSONL file?

---

## Actionable Items

1. **CWD mismatch fix** — ensure `sessionCwd` is always persisted and used on resume
2. **Claude CLI session expiry** — understand the external cleanup policy deleting JSONL files
3. **Recovery UX redesign** — don't silently start fresh sessions; surface the failure and let the user decide
4. **Context reconstruction** — explore whether we can rebuild session context from our own message store when the CLI session is lost
