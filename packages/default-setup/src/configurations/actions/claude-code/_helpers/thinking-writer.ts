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
import { formatDuration } from './tool-activity-label';

export interface ThinkingWriterOptions {
  /** Minimum ms between `updateMessageState` calls. Default 250ms. */
  intervalMs?: number;
}

export interface ThinkingWriter {
  push(text: string): void;
  flush(): void;
  finalise(): void;
  stopDirectWrites(): void;
  buildBlock(): { type: string; props: ThinkingBlockProps } | null;
  readonly hasContent: boolean;
  readonly isStreaming: boolean;
}

export function createThinkingWriter(
  services: Services,
  messageId: EntityId,
  opts: ThinkingWriterOptions = {},
): ThinkingWriter {
  const intervalMs = opts.intervalMs ?? 250;
  let buffer = '';
  let firstPushAt = 0;
  let finalisedAt = 0;
  let state: 'streaming' | 'done' = 'streaming';
  let directWritesEnabled = true;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFlushAt = 0;

  function buildLabel(): string {
    if (state === 'streaming') return 'Thinking';
    const elapsed = (finalisedAt || Date.now()) - (firstPushAt || Date.now());
    return `Thought for ${formatDuration(elapsed)}`;
  }

  function buildBlock(): { type: string; props: ThinkingBlockProps } | null {
    if (!buffer) return null;
    return {
      type: 'thinking',
      props: { content: buffer, label: buildLabel(), state, defaultOpen: false },
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
    get isStreaming() { return state === 'streaming'; },

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
      finalisedAt = Date.now();
      state = 'done';
      writeNow();
    },

    buildBlock,
  };
}
