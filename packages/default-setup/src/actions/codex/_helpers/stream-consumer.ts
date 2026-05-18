/**
 * Stream consumer — fire-and-forget async function that owns the `for await`
 * loop over a Codex SDK handle's event stream.
 *
 * Extracted from `chat.ts` so the chat action can return immediately after
 * starting the query. This function runs detached from the action lifecycle.
 *
 * Side effects are split between this consumer (ordering-critical state) and
 * flow actions (async-safe UI/artifact updates):
 * - Consumer: persistCodexState, setRunning, writer/toolActivity, clearHandle,
 *   dequeueMessage → replayQueuedMessage
 * - Flow actions: updateCodexState, diff artifact
 *   (triggered via cdx.stream.* brain events → on() listeners in the flow)
 *
 * Error boundary: the entire body is wrapped in try/catch. Errors never
 * escape — the catch block logs, finalises writers, clears the handle, and
 * emits cdx.stream.completed so the flow's Turn Completed action can clean up.
 */

import type { Services, EntityId } from '../../../types';
import { createStreamWriter } from '../../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../../claude-code/_helpers/tool-activity-writer';
import { createThinkingWriter } from '../../claude-code/_helpers/thinking-writer';
import {
  persistCodexState,
  setRunning,
  dequeueMessage,
  updateChatState,
} from './thread-context';
import {
  createEventMapperState,
  handleItemStarted,
  handleItemUpdated,
  handleItemCompleted,
} from './event-mapper';
import type { Writers } from './event-mapper';

export interface ConsumerContext {
  services: Services;
  threadId: EntityId;
  /** Original user message text — passed to cdx.stream.completed for diff title. */
  text: string;
}

export interface ConsumerWriters {
  writer: ReturnType<typeof createStreamWriter>;
  toolActivity: ReturnType<typeof createToolActivityWriter>;
  thinking: ReturnType<typeof createThinkingWriter>;
  messageId: EntityId;
}

/**
 * Consume the Codex SDK event stream in the background. The chat action calls
 * this without awaiting it, so the action returns immediately while this
 * function continues processing events.
 */
export async function consumeStream(
  handle: any,
  ctx: ConsumerContext,
  initialWriters: ConsumerWriters,
): Promise<void> {
  const { services, threadId, text } = ctx;
  const log = services.logger;

  // True when this consumer still owns the thread's handle slot.
  const stillCurrent = () =>
    (services.codex as any).getHandle(threadId) === handle;

  let currentMessageId: EntityId = initialWriters.messageId;
  let writer = initialWriters.writer;
  let toolActivity = initialWriters.toolActivity;
  let thinking = initialWriters.thinking;

  const finaliseThinking = () => { if (thinking.isStreaming) thinking.finalise(); };

  const mapperState = createEventMapperState();
  const writers: Writers = { writer, toolActivity, thinking };

  // Usage stats from turn.completed
  let usage: { input: number; output: number; reasoning: number } | undefined;
  let hadErrors = false;

  try {
    let eventCount = 0;
    for await (const event of handle.events) {
      const ev = event as any;
      eventCount++;

      if (eventCount <= 5 || eventCount % 20 === 0) {
        log.debug('[codex stream] event', { n: eventCount, type: ev?.type });
      }

      switch (ev.type) {
        case 'thread.started': {
          const codexThreadId = ev.thread_id;
          if (codexThreadId) {
            log.debug('[codex stream] persisting threadId', { threadId, codexThreadId });
            persistCodexState(services, threadId, {
              threadId: codexThreadId,
              lastTurnAt: Date.now(),
            });
          }
          services.emitter.sendToBrainSystem({
            eventType: 'cdx.stream.started',
            payload: { threadId, codexThreadId: codexThreadId || '' },
          });
          break;
        }

        case 'turn.started': {
          updateChatState(services, threadId, 'working');
          break;
        }

        case 'item.started': {
          handleItemStarted(ev.item, writers, mapperState);
          break;
        }

        case 'item.updated': {
          handleItemUpdated(ev.item, writers, mapperState, services, currentMessageId);
          break;
        }

        case 'item.completed': {
          handleItemCompleted(ev.item, writers, mapperState);
          break;
        }

        case 'turn.completed': {
          if (ev.usage) {
            usage = {
              input: ev.usage.input_tokens || 0,
              output: ev.usage.output_tokens || 0,
              reasoning: ev.usage.reasoning_output_tokens || 0,
            };
          }
          break;
        }

        case 'turn.failed': {
          hadErrors = true;
          log.error('[codex stream] turn failed', { error: ev.error?.message });
          break;
        }

        case 'error': {
          hadErrors = true;
          log.error('[codex stream] fatal error', { message: ev.message });
          break;
        }
      }
    }
  } catch (err) {
    hadErrors = true;
    log.error('[codex stream] consumer error', { error: err });
  } finally {
    // ─── Finalization ──────────────────────────────────────────────────
    finaliseThinking();
    writer.finalize(writer.text);
    toolActivity.finalise(hadErrors ? 'error' : 'done');

    // Mark message as forkable
    services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);

    if (stillCurrent()) {
      (services.codex as any).clearHandle(threadId);

      // Dequeue and replay before emitting completion to avoid race
      const queued = dequeueMessage(services, threadId as string);
      if (queued) {
        log.info('[codex stream] replaying queued message', { threadId });
        // Mark the queued message's status indicator
        if (queued.messageId) {
          services.chat.updateMessageState(queued.messageId as any, { status: undefined } as any);
        }
        // Re-invoke the chat action with the queued message
        services.action.executeAction('Codex Chat', {
          threadId,
          text: queued.text,
          mode: queued.mode || 'codex',
          messageId: queued.messageId,
          references: queued.references,
        });
      }

      setRunning(services, threadId as string, false);

      services.emitter.sendToBrainSystem({
        eventType: 'cdx.stream.completed',
        payload: {
          threadId,
          text,
          usage,
          hadErrors,
          mutatedPaths: mapperState.mutatedPaths,
          toolCallCount: mapperState.toolCallCount,
        },
      });
    }
  }
}
