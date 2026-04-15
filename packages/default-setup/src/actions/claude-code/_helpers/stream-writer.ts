/**
 * Throttled writer for streaming text into an existing chat message.
 *
 * Claude Code's stream-json protocol emits Anthropic text deltas a few
 * characters at a time. Pushing every delta through `chat.updateMessageState`
 * would drown the event bus and the renderer; pushing too rarely would make
 * the UI feel janky. This helper smooths the two sides:
 *
 *  - `push(text)` appends to an in-memory buffer and schedules a single
 *    flush no sooner than `intervalMs` from the previous flush.
 *  - `flush()` writes the accumulated text immediately (used after a
 *    tool_use note or on completion).
 *  - `finalize(text?)` performs one last flush with optional replacement text
 *    and a `responseTimestamp` so the UI marks the message as complete.
 *
 * The writer owns no external state — one instance per streaming message.
 */

import type { Services, EntityId } from '../../../types';

export interface StreamWriterOptions {
  /** Minimum ms between `updateMessageState` calls. Default 80ms. */
  intervalMs?: number;
}

export interface StreamWriter {
  /** Append `text` to the running buffer and schedule a throttled flush. */
  push(text: string): void;
  /** Append `text` to the running buffer and flush immediately. */
  pushImmediate(text: string): void;
  /** Force-flush any pending buffered text. */
  flush(): void;
  /** Final flush with optional replacement text + responseTimestamp. */
  finalize(text?: string): void;
  /** Current accumulated text (useful for returning from an action). */
  readonly text: string;
}

export function createStreamWriter(
  services: Services,
  messageId: EntityId,
  opts: StreamWriterOptions = {},
): StreamWriter {
  const intervalMs = opts.intervalMs ?? 80;
  let buffer = '';
  let lastFlushAt = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const writeNow = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    services.chat.updateMessageState(messageId, { text: buffer });
    lastFlushAt = Date.now();
  };

  const schedule = () => {
    if (pendingTimer) return;
    const since = Date.now() - lastFlushAt;
    const delay = Math.max(0, intervalMs - since);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      services.chat.updateMessageState(messageId, { text: buffer });
      lastFlushAt = Date.now();
    }, delay);
  };

  return {
    get text() { return buffer; },
    push(text: string): void {
      if (!text) return;
      buffer += text;
      schedule();
    },
    pushImmediate(text: string): void {
      if (!text) return;
      buffer += text;
      writeNow();
    },
    flush(): void {
      writeNow();
    },
    finalize(text?: string): void {
      if (text !== undefined) buffer = text;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      services.chat.updateMessageState(messageId, {
        text: buffer,
        responseTimestamp: Date.now(),
      });
      lastFlushAt = Date.now();
    },
  };
}
