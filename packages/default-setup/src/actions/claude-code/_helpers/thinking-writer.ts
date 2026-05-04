/**
 * Throttled writer for the `thinking` block on a streaming chat message.
 *
 * Claude Code's extended thinking emits `thinking_delta` events as the model
 * reasons. This writer accumulates the thinking text and pushes a single
 * `thinking` block via `updateMessageState({ blocks })`.
 *
 * Coordination with ToolActivityWriter: both writers target the `blocks`
 * field, and `updateMessageState` replaces the entire field. The thinking
 * writer writes directly to `blocks` until tool-activity starts, at which
 * point `stopDirectWrites()` is called and the tool-activity writer takes
 * over — it includes the thinking block via the `getThinkingBlock` callback
 * passed at construction time.
 */

import type { Services, EntityId } from '../../../types';
import type { ThinkingBlockProps } from './thinking-types';

export interface ThinkingWriterOptions {
  /** Minimum ms between `updateMessageState` calls. Default 250ms. */
  intervalMs?: number;
}

export interface ThinkingWriter {
  /** Append thinking text to the running buffer and schedule a throttled flush. */
  push(text: string): void;
  /** Force-flush any pending buffered text. */
  flush(): void;
  /** Freeze the block to its final state. */
  finalise(): void;
  /** Stop writing directly to blocks — tool-activity writer takes over. */
  stopDirectWrites(): void;
  /** Build the current block object (used by tool-activity writer). */
  buildBlock(): { type: string; props: ThinkingBlockProps } | null;
  /** Whether any thinking content has been accumulated. */
  readonly hasContent: boolean;
  /** Current accumulated thinking text. */
  readonly content: string;
  /** Whether the writer is still in the streaming state. */
  readonly isStreaming: boolean;
  /** Epoch ms when the writer was created, for duration computation. */
  readonly startedAt: number;
}

export function createThinkingWriter(
  services: Services,
  messageId: EntityId,
  opts: ThinkingWriterOptions = {},
): ThinkingWriter {
  const intervalMs = opts.intervalMs ?? 250;
  let buffer = '';
  let firstPushAt = 0;
  let state: 'streaming' | 'done' = 'streaming';
  let directWritesEnabled = true;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFlushAt = 0;

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return `${mins}m${secs}s`;
  }

  function buildLabel(): string {
    if (state === 'streaming') return 'Thinking';
    const elapsed = Date.now() - (firstPushAt || Date.now());
    return `Thought for ${formatDuration(elapsed)}`;
  }

  function buildBlock(): { type: string; props: ThinkingBlockProps } | null {
    if (!buffer) return null;
    return {
      type: 'thinking',
      props: {
        content: buffer,
        label: buildLabel(),
        state,
        defaultOpen: false,
      },
    };
  }

  function writeNow(): void {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (!directWritesEnabled || !buffer) return;
    const block = buildBlock();
    if (block) {
      services.chat.updateMessageState(messageId, { blocks: [block] as any });
    }
    lastFlushAt = Date.now();
  }

  function schedule(): void {
    if (!directWritesEnabled) return;
    if (pendingTimer) return;
    const since = Date.now() - lastFlushAt;
    const delay = Math.max(0, intervalMs - since);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      writeNow();
    }, delay);
  }

  return {
    get hasContent() { return buffer.length > 0; },
    get content() { return buffer; },
    get isStreaming() { return state === 'streaming'; },
    get startedAt() { return firstPushAt; },

    push(text: string): void {
      if (!text || state === 'done') return;
      if (!firstPushAt) firstPushAt = Date.now();
      buffer += text;
      schedule();
    },

    flush(): void {
      writeNow();
    },

    stopDirectWrites(): void {
      directWritesEnabled = false;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    },

    finalise(): void {
      if (state === 'done') return;
      state = 'done';
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      // Final write — either direct or via tool-activity's next write.
      if (directWritesEnabled && buffer) {
        const block = buildBlock();
        if (block) {
          services.chat.updateMessageState(messageId, { blocks: [block] as any });
        }
      }
    },

    buildBlock,
  };
}
