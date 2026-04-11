/**
 * Throttled writer for the `tool-activity` block on a streaming chat message.
 *
 * Claude Code can emit 20+ tool_use / tool_progress events in a few seconds;
 * we don't want to hit `updateMessageState` 20+ times per second because the
 * frontend rebuilds the blocks array wholesale on every update. This helper
 * coalesces writes into ~250ms batches (mirroring `createStreamWriter`'s
 * pattern for text deltas).
 *
 * The writer owns the canonical copy of the block's `entries` array and
 * `state`. Call `append`, `update`, and `finalise`; the writer recomputes
 * the collapsed label on each change and pushes the whole block object
 * via `services.chat.updateMessageState(messageId, { blocks: [ourBlock] })`.
 *
 * Ownership model: the streaming assistant message only ever has ONE
 * entry in its `blocks` array — this writer's tool-activity block. The
 * `onPermissionRequest` flow in chat.ts creates approval blocks as
 * separate sibling messages (`sendApprovalBlock` → `sendBlockMessage`),
 * not into the streaming message's block array, so the writer can safely
 * emit `{ blocks: [ourBlock] }` wholesale without clobbering anything.
 *
 * Coexistence with `StreamWriter`: they touch different fields of the
 * same message (`text` vs `blocks`). Both call `updateMessageState` with
 * only the field they own; the backend's update merges by key so they
 * don't clobber each other.
 *
 * One compromise flagged in the design doc: `MessageEntity` stores `text`
 * and `blocks` as separate fields and `message.vue` renders the Tiptap text
 * first, then `<InteractionContainer>` below. So the activity block visually
 * lands below the prose of the turn, not interleaved between "prose-before"
 * and "prose-after" the tool calls. True inline interleaving would require a
 * new message schema; the "work log below prose" layout is acceptable for
 * Phase A.
 */

import type { Services, EntityId } from '../../../types';
import { computeLabel } from './tool-activity-label';
import type { ToolActivityEntry, ToolActivityBlockProps } from './tool-activity-types';

export interface ToolActivityWriterOptions {
  /** Minimum ms between `updateMessageState` calls. Default 250ms. */
  intervalMs?: number;
}

export interface ToolActivityWriter {
  /** Add a new tool entry. Triggers a throttled write. */
  append(entry: ToolActivityEntry): void;
  /** Patch an existing entry (by id). Triggers a throttled write. */
  update(id: string, patch: Partial<ToolActivityEntry>): void;
  /** Flush any pending write immediately (e.g. before a permission prompt). */
  flush(): void;
  /** Freeze the block to its final state. Writes immediately. */
  finalise(state: 'done' | 'error'): void;
  /** Current entries (read-only snapshot). */
  readonly entries: ReadonlyArray<ToolActivityEntry>;
  /** Whether the writer has produced any entries yet. */
  readonly hasEntries: boolean;
  /** Epoch ms when the writer was created, for duration aggregates. */
  readonly startedAt: number;
}

export function createToolActivityWriter(
  services: Services,
  messageId: EntityId,
  opts: ToolActivityWriterOptions = {},
): ToolActivityWriter {
  const intervalMs = opts.intervalMs ?? 250;
  const entries: ToolActivityEntry[] = [];
  const startedAt = Date.now();

  let state: 'streaming' | 'done' | 'error' = 'streaming';
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFlushAt = 0;
  /** Once true, we've pushed at least one block — finalise(0-entries) should clear. */
  let hasWrittenOnce = false;

  const buildBlockProps = (): ToolActivityBlockProps => ({
    // Fresh array copy so frontend reactivity sees a new reference on every write.
    entries: entries.map(e => ({ ...e })),
    label: computeLabel(entries, state),
    state,
    defaultOpen: false,
  });

  const writeNow = (): void => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    // Cast through `any` at the service boundary because the default-setup
    // generated defs haven't been rebuilt yet to include the new
    // 'tool-activity' BlockType variant. Once `npm run build:be` runs, this
    // cast is purely cosmetic — the runtime shape is already correct.
    const block = {
      type: 'tool-activity',
      props: buildBlockProps() as unknown as Record<string, unknown>,
    };
    services.chat.updateMessageState(messageId, { blocks: [block] as any });
    hasWrittenOnce = true;
    lastFlushAt = Date.now();
  };

  const schedule = (): void => {
    if (pendingTimer) return;
    const since = Date.now() - lastFlushAt;
    const delay = Math.max(0, intervalMs - since);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      writeNow();
    }, delay);
  };

  return {
    get entries() { return entries; },
    get hasEntries() { return entries.length > 0; },
    get startedAt() { return startedAt; },

    append(entry: ToolActivityEntry): void {
      // De-dup by id — Claude CLI occasionally re-emits the same tool_use
      // inside a replayed `assistant` line after a permission pause.
      if (entries.some(e => e.id === entry.id)) return;
      entries.push(entry);
      schedule();
    },

    update(id: string, patch: Partial<ToolActivityEntry>): void {
      const idx = entries.findIndex(e => e.id === id);
      if (idx === -1) return;
      entries[idx] = { ...entries[idx], ...patch };
      schedule();
    },

    flush(): void {
      if (entries.length === 0) return;
      writeNow();
    },

    finalise(finalState: 'done' | 'error'): void {
      state = finalState;
      if (entries.length === 0) {
        // No tools actually ran. If we never wrote a block, nothing to do.
        // If we had written then everything was denied and retracted,
        // emit an empty-blocks update to clear the prior placeholder.
        if (hasWrittenOnce) {
          services.chat.updateMessageState(messageId, { blocks: [] as any });
        }
        return;
      }
      // Any entry still marked 'running' at finalise time is stranded —
      // mark it 'ok' so the group doesn't visually lie.
      for (const e of entries) {
        if (e.status === 'running') e.status = 'ok';
      }
      writeNow();
    },
  };
}
