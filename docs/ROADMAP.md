# Claude Code UX roadmap

Phased roll-out of block types and thread artifacts for Claude Code. Phase A landed in commit **TBD** (tool-activity block replacing the per-call blockquote flood). Phases B–E are designed but not yet implemented; this document is the working reference.

The full design doc with rationale and ASCII sketches lives in `.claude/plans/humming-crafting-engelbart.md`; this file is a concise handoff for whoever picks up the next phase.

---

## Where we are

**Phase A — Shipped** · `tool-activity` block end-to-end.

Claude Code tool calls now aggregate into a single collapsible row at the bottom of the assistant bubble with a live-updating status label (`Reading 3 files…` → `Read 8 files, ran 2 searches`) instead of flooding the prose with `> 🔧 name` blockquotes. Per-row drill-down shows tool name, truncated input, duration, and status. The group auto-expands once on error-state transition; otherwise stays collapsed through the turn and freezes to a summary line after the turn ends.

Files of record:
- `packages/api/src/systems/threads/types.ts` — `'tool-activity'` added to `BlockType`, prop interfaces alongside.
- `packages/default-setup/src/actions/claude-code/_helpers/tool-activity-{writer,label,types}.ts` — throttled writer + pure label helper + local type mirror.
- `packages/default-setup/src/actions/claude-code/chat.ts` — event loop rewired: `tool_use` → `append`, `tool_progress` → `update`, `tool_use_summary` → status flip, success/error → `finalise`.
- `packages/renderer/src/plugins/threads/chat/interactions/blocks/ToolActivityBlock.vue` + duplicated `tool-activity-label.ts` — renderer + frontend label helper.
- `packages/renderer/src/plugins/threads/chat/interactions/InteractionContainer.vue` — dispatcher case.

**Known compromise**: the activity block renders *below* the prose of the turn, not interleaved between "prose-before-tool-call" and "prose-after-tool-call" at the exact narrative offset. True inline interleaving would require a new message schema (either multiple messages per turn or offset-based block insertion into `text`). Accepted for Phase A; revisit only if it confuses users in practice.

---

## Design principles (load-bearing — don't violate in later phases)

1. **Activity is collapsible, content is not.** Prose wins visual weight; tool calls and process-level detail hide behind a single live-updating line.
2. **Group by author intent, not by time.** A turn is *prose → work → prose → work → conclusion*. Each prose/activity pair is a logical beat the UI should preserve.
3. **The collapsed label is a live status line.** ~40 chars, present-progressive while streaming (`Reading 3 files…`), simple-past aggregate when done (`Read 8 files, ran 2 searches`), error count wins on failure.
4. **Progressive disclosure.** L0 = label, L1 = row list, L2 = per-row input/output.
5. **Durable outputs become artifacts; ephemeral progress stays inline.** If it outlives the turn, it's an artifact in the right panel. If it's "Claude running `ls`", it stays in the activity group.

---

## Phase B — `claude-session` artifact

**Goal**: give users a stable, always-visible view of the active Claude Code session on each work-mode thread — a persistent "session header" in the right panel that survives thread navigation.

**Why an artifact, not a block**: it outlives every turn, it's referenced by later turns (via `resume: sessionId`), it needs to stay visible while the user scrolls back through older messages. All five principles (especially P5) point at artifact.

### Content shape

```ts
interface ClaudeSessionArtifact {
  artifactType: 'claude-session'
  title: 'Claude Code session'   // fixed
  content: {
    sessionId: string
    model: string                // "claude-sonnet-4-6" etc.
    cwd: string                  // resolved project directory
    startedAt: number
    lastTurnAt: number
    turns: number
    totalCostUsd: number
    status: 'idle' | 'streaming' | 'awaiting-permission' | 'ended'
    toolCallCount: number        // running total across the session
    lastTool?: { name: string; summary: string; at: number }
  }
}
```

### UX

- Compact, always-pinned card at the top of the artifact list for work-mode threads
- Session id (truncated, copy-button), model, cwd, turn count, total cost, coloured status dot
- Dense but unobtrusive — this is a reassurance card, not a dashboard
- Transitions to `status: 'ended'` when the user resets the session (new `Reset Claude Session` action); stays visible so the last cost / last turn timestamp remain auditable

### Backend work

- Add `'claude-session'` to `ArtifactType` union in `packages/api/src/systems/threads/types.ts`.
  - ⚠️ Current union is `'text' | 'code' | 'image' | 'json' | 'graph' | 'table' | 'slack'` — note that the prior Explore-agent report over-counted and claimed `'review' | 'todo' | 'project'` were present; they are not. **Verify the actual union before extending.**
- **New**: `updateArtifact(artifactId, patch)` helper in `packages/api/src/services/artifact.ts`. Currently the artifact commands are create-only; the `claude-session` needs in-place updates per turn, so this is load-bearing work for Phase B.
- Add the matching `chatCommands.updateArtifact` on the repository at `packages/api/src/systems/threads/repository/index.ts`.
- In `chat.ts`:
  - On turn start, find-or-create the session artifact for `threadId` (exactly one per thread)
  - On each turn boundary, update `turns`, `lastTurnAt`, `totalCostUsd`, `status`
  - On each `tool_use`, increment `toolCallCount` and set `lastTool`
  - On turn end (`result`), flip `status: 'idle'`

### Frontend work

- **New**: `packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/claude-session-artifact.vue` — the info card.
- Edit `artifact-list.vue` to pin `claude-session` artifacts to the top of the list (or reserve a slot above the scrollable list).
- Edit `content-viewer.vue` to dispatch `claude-session` to the new component.

### Files modified (Phase B)

- `packages/api/src/systems/threads/types.ts`
- `packages/api/src/services/artifact.ts` (add `updateArtifact`)
- `packages/api/src/systems/threads/repository/index.ts` (add `updateArtifact` command)
- `packages/default-setup/src/actions/claude-code/chat.ts` (wire session create/update)
- `packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/claude-session-artifact.vue` (new)
- `packages/renderer/src/plugins/threads/canvas/agent/artifacts/artifact-list.vue`
- `packages/renderer/src/plugins/threads/canvas/agent/content-viewer.vue`

### Dependencies

None — Phase B is self-contained and does not depend on Phase A's writer internals (it only needs the chat action's turn lifecycle, which was already in place pre-Phase-A).

---

## Phase C — `diff` artifact

**Goal**: when Claude runs `Write` / `Edit` / applies patches, surface those changes as a **reviewable diff artifact** in the right panel, and add a `→ View changes` link beneath the turn's tool-activity block pointing at it.

### Content shape

```ts
interface DiffArtifact {
  artifactType: 'diff'
  title: string    // e.g. "Refactor switch-node.ts" — derived from the turn's task
  content: {
    files: Array<{
      path: string
      patch: string                // unified diff text
      added: number
      removed: number
      changeType: 'added' | 'modified' | 'deleted' | 'renamed'
    }>
    summary: string                // "12 files, +420 -87"
  }
}
```

### UX

- Right panel: left sub-pane = file list (with change-type icons and ±counts), right sub-pane = syntax-highlighted unified diff for the selected file
- Header row shows the aggregate summary
- One diff artifact per turn that contained file mutations; turns stack naturally in the list, giving the user a chronological undo/review trail
- The inline tool-activity block gains an `artifactRef: { artifactId, label }` pointer that the renderer displays as a subtle `→ View changes (Diff: …)` link beneath the group header

### Backend work

- Add `'diff'` to `ArtifactType`.
- The tool-activity writer already knows about `Write`/`Edit` entries; extend `finalise()` to observe them and, when the turn ends with any file-mutation tools, assemble a `DiffArtifact`. Options for obtaining the actual patch text:
  1. **Cheap**: read the tool inputs (Edit tool's `old_string`/`new_string`, Write tool's `file_path`/`contents`) — but this doesn't produce real unified diff format, just "before/after" snapshots.
  2. **Correct**: after the turn ends, call `services.cli.git.getStatus()` / `git diff` via the existing git service at `packages/api/src/systems/code/services/git.ts` to get the real unified diffs relative to HEAD.
  - Start with option 2. The "cheap" path lies when multiple tools modify the same file sequentially.
- Set `artifactRef` on the tool-activity block by extending `ToolActivityBlockProps` (already has the field documented) — writer calls `updateMessageState` one more time at finalisation with the artifact reference attached.
- Title derivation: heuristic from the turn's first user message (first line, truncated). Good enough for v1.

### Frontend work

- **New**: `packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/diff-artifact.vue` — left file list + right diff viewer. Reuse `CodeBlockLowlight` for syntax highlighting of the unified-diff text.
- Extend `ToolActivityBlock.vue` to render the `artifactRef` link beneath the header when present.
- Edit `content-viewer.vue` to dispatch `diff` to the new component.

### Files modified (Phase C)

- `packages/api/src/systems/threads/types.ts`
- `packages/default-setup/src/actions/claude-code/_helpers/tool-activity-writer.ts` (assemble diff at finalise, attach `artifactRef`)
- `packages/default-setup/src/actions/claude-code/chat.ts` (wire writer → git service call at turn end)
- `packages/renderer/src/plugins/threads/chat/interactions/blocks/ToolActivityBlock.vue` (render `artifactRef` link)
- `packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/diff-artifact.vue` (new)
- `packages/renderer/src/plugins/threads/canvas/agent/content-viewer.vue`

### Dependencies

Depends on Phase A's `ToolActivityWriter` (extends its `finalise` path) and on the existing `services.cli.git` helper at `packages/api/src/services/cli.ts` (already available — no new backend service needed).

Phase C can ship before Phase B; they're independent.

---

## Phase D — `plan` artifact

**Goal**: when Claude produces a structured plan (via `--permission-mode plan`, or later via heuristic detection of a "### Plan" prose section), promote it to a thread artifact the user can approve / mutate / track.

### Content shape

```ts
interface PlanArtifact {
  artifactType: 'plan'
  title: string
  content: {
    steps: Array<{
      id: string
      title: string
      description?: string
      status: 'pending' | 'in-progress' | 'done' | 'skipped'
    }>
    status: 'draft' | 'approved' | 'in-progress' | 'completed' | 'rejected'
    notes?: string    // optional markdown body ("Approach" / "Risks")
  }
}
```

### UX

- Same approvable-checklist feel as the existing `todo` artifact, with optional markdown notes below the steps
- User can approve → flips `status: 'approved'`; can edit step titles/descriptions; can mark steps done
- **Reach goal (Phase D+)**: approving the plan kicks off a follow-up `chat.ts` turn that executes each step with Claude Code in edit mode, streaming per-step progress back into the same artifact

### Open question: new type vs extend `todo`

Two options, flagged for implementation review:

1. **New `'plan'` ArtifactType + new renderer** — keeps semantics clean (agent-authored plan vs user-authored TODO have different lifecycles), but adds surface area.
2. **Reuse `'todo'` with a `source: 'claude-code'` discriminator in `content`** — simpler, no new artifact type, but dilutes meaning.

Recommendation from the design doc: **new type**, keep semantics distinct. Can be folded later if the two genuinely collapse into one.

### Scope caveat: heuristic detection

Heuristic plan detection ("look for `### Plan` in result text") is fuzzy and error-prone. **Safer initial scope**: only create a plan artifact when `permissionMode === 'plan'` was explicitly set. Defer auto-detection until we have signal that it's worth the complexity.

### Backend work

- Add `'plan'` to `ArtifactType`.
- In `chat.ts`: when `permissionMode === 'plan'` is in the incoming options, intercept the assistant's final output, parse it into the `PlanArtifact.content` shape, and create the artifact via `services.artifact.createAndNotify`.
- Wire step-status mutations through the existing `RESPOND_TO_BLOCK_INTERACTION` event flow, similar to how the todo artifact handles updates today.

### Frontend work

- **New**: `packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/plan-artifact.vue`, possibly a thin wrapper around (or fork of) the existing `todo-artifact.vue` if the shapes end up identical enough to share a renderer.
- Edit `content-viewer.vue` to dispatch `plan` to the new component.

### Files modified (Phase D)

- `packages/api/src/systems/threads/types.ts`
- `packages/default-setup/src/actions/claude-code/chat.ts` (create plan artifact when in plan mode)
- `packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/plan-artifact.vue` (new; may wrap `todo-artifact.vue`)
- `packages/renderer/src/plugins/threads/canvas/agent/content-viewer.vue`

### Dependencies

Nothing hard — depends on Phase B's `updateArtifact` command if we want step-status mutations to work in place (otherwise we'd have to delete-and-recreate on each state change, which is workable but cruder).

---

## Phase E — Deferred

Not planned in detail. Listed so future designers don't re-discover them cold.

### E1 — `thinking` block

Minimal collapsible block for Claude's extended thinking output (when `--thinking enabled` is set). Renders as an unobtrusive pill: `💭 Thinking…` while streaming, `💭 Thought for 34s` when done. Expanded state shows the raw thinking text in a dim monospace callout.

Blocked until someone wants to expose thinking as a user option; Claude Code isn't emitting thinking by default in our chat action today.

Design shape in the full doc (`Part 2 / Block 2.2`).

### E2 — `search-results` artifact

When Claude runs a batch of `Grep` / `Glob` during exploration, the matches are often referenced in later prose ("those 12 files all call `foo()`"). If the activity group is collapsed, those matches are buried. A `search-results` artifact would surface them as a filterable `{file, line, match}` table grouped by pattern.

Nice-to-have; deferred because it adds artifact sprawl for speculative value. Revisit if users specifically ask for it.

### E3 — Interactive plan execution

The reach goal from Phase D: approve a plan → follow-up chat action runs each step as a separate Claude Code turn → progress streams back into the plan artifact step-by-step. This touches Phase D (plan artifact), Phase C (diff artifact per step), Phase B (session state transitions), and requires a new multi-step flow orchestration primitive.

Large scope; not worth planning in detail until the four building blocks above are in place.

---

## Cross-cutting design questions (flagged for implementation review in any phase)

These seven questions from the full design doc are deliberately left unanswered — they're taste calls best made with live events in hand during implementation.

1. **Row ordering on late-arriving results.** Arrival order vs completion order for tool rows. Recommendation: arrival order. Matches user's mental model, avoids visible reordering.

2. **Spinner behaviour during permission pauses.** When approval blocks block the activity group mid-stream, pause the spinner and set the label to `Read 3 files, awaiting approval`. The group is in a known waiting state; animating would suggest work is happening.

3. **Per-turn cost badge in Phase A.** Should the tool-activity block show `$0.04` inline? Recommendation: **no**, not in Phase A. Add to the session artifact card (Phase B) instead. Revisit only if users ask.

4. **Denied-tool display.** Show grayed-out with a line-through so the audit trail is complete; removing them would make the group count misleading ("ran 12 tools" when 2 were denied).

5. **Label debounce tuning.** 250ms is a guess. Drop to 150ms if labels visibly lag; raise to 400ms if they thrash. Tune with live events.

6. **Activity block position in narrative.** The accepted compromise is "below the prose of the turn" — the true inline interleaving ("between prose-before and prose-after") is out of reach without a new message schema. Revisit only if it confuses users.

7. **`todo` vs new `plan` type in Phase D.** Recommendation: keep them separate. Collapse only if long-term usage shows they genuinely overlap.

---

## Explicit out-of-scope (keep this discipline across phases)

- **Don't refactor the existing streaming text path.** `StreamWriter` is correct for prose; activity writers are side channels.
- **Don't add JSON-patch semantics to the `blocks` array.** Wholesale replacement works for <50 entries and is fine.
- **Don't add `claude-code` as a separate plugin.** Everything lives inside the existing threads plugin.
- **Don't try to unify `todo` and `plan` artifacts in Phase D.** Different lifecycles; collapse later if usage justifies it.
- **Don't promote every Grep/Glob batch to a `search-results` artifact.** Artifact sprawl has real UX cost.
- **Don't change the Claude CLI's wire format.** We adapt on our side.
- **Don't add UI-layer filter/search inside the tool-activity block.** 20 entries don't need it; 200 means we have bigger UX problems.

---

## References

- Full design doc with rationale, ASCII sketches, and wire-shape TypeScript: `.claude/plans/humming-crafting-engelbart.md`
- Phase A implementation (this commit / branch): `packages/default-setup/src/actions/claude-code/_helpers/tool-activity-*.ts`, `packages/renderer/src/plugins/threads/chat/interactions/blocks/ToolActivityBlock.vue`
- Existing artifact system entry points:
  - `packages/api/src/systems/threads/types.ts` (`ArtifactEntity`, `ArtifactType`)
  - `packages/api/src/services/artifact.ts` (`createAndNotify`, add `updateArtifact` in Phase B)
  - `packages/renderer/src/plugins/threads/canvas/agent/content-viewer.vue` (dispatcher)
- Existing block system entry points:
  - `packages/api/src/systems/threads/types.ts` (`BlockConfig`, `BlockType`)
  - `packages/api/src/services/chat.ts` (`send*Block` helpers, `updateMessageState`)
  - `packages/renderer/src/plugins/threads/chat/interactions/InteractionContainer.vue` (dispatcher)
