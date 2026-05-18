/**
 * Fire-and-forget stream consumer for the Codex SDK event stream.
 * Processes events, manages writers, and emits cdx.stream.completed.
 */

import type { Services, EntityId } from '../../../types';
import { createStreamWriter } from '../../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../../claude-code/_helpers/tool-activity-writer';
import { createThinkingWriter } from '../../claude-code/_helpers/thinking-writer';
import { persistCodexState, setRunning, dequeueMessage, updateChatState, updateCodexState } from './thread-context';
import { createEventMapperState, handleItemStarted, handleItemUpdated, handleItemCompleted } from './event-mapper';
import type { Writers } from './event-mapper';

export interface ConsumerContext {
  services: Services;
  threadId: EntityId;
  text: string;
}

export interface ConsumerWriters {
  writer: ReturnType<typeof createStreamWriter>;
  toolActivity: ReturnType<typeof createToolActivityWriter>;
  thinking: ReturnType<typeof createThinkingWriter>;
  messageId: EntityId;
}

export async function consumeStream(handle: any, ctx: ConsumerContext, initialWriters: ConsumerWriters): Promise<void> {
  const { services, threadId, text } = ctx;
  const log = services.logger;

  const stillCurrent = () => (services.codex as any).getHandle(threadId) === handle;

  const { messageId: currentMessageId, writer, toolActivity, thinking } = initialWriters;
  const finaliseThinking = () => { if (thinking.isStreaming) thinking.finalise(); };
  const mapperState = createEventMapperState();
  const writers: Writers = { writer, toolActivity, thinking };

  let usage: { input: number; output: number; reasoning: number } | undefined;
  let hadErrors = false;

  try {
    for await (const event of handle.events) {
      const ev = event as any;

      switch (ev.type) {
        case 'thread.started':
          if (ev.thread_id) {
            persistCodexState(services, threadId, { threadId: ev.thread_id, lastTurnAt: Date.now() });
          }
          break;

        case 'turn.started':
          updateChatState(services, threadId, 'working');
          break;

        case 'item.started': {
          const toolInfo = handleItemStarted(ev.item, writers, mapperState);
          if (toolInfo) {
            updateCodexState(services, threadId, (prev) => ({
              recentTools: [...(prev.recentTools ?? []), { ...toolInfo, at: Date.now() }].slice(-3),
            }));
          }
          break;
        }

        case 'item.updated':
          handleItemUpdated(ev.item, writers, mapperState, services, currentMessageId);
          break;

        case 'item.completed':
          handleItemCompleted(ev.item, writers, mapperState);
          break;

        case 'turn.completed':
          if (ev.usage) {
            usage = {
              input: ev.usage.input_tokens || 0,
              output: ev.usage.output_tokens || 0,
              reasoning: ev.usage.reasoning_output_tokens || 0,
            };
          }
          break;

        case 'turn.failed':
          hadErrors = true;
          log.error('[codex] turn failed', { error: ev.error?.message });
          break;

        case 'error':
          hadErrors = true;
          log.error('[codex] fatal error', { message: ev.message });
          break;
      }
    }
  } catch (err) {
    hadErrors = true;
    log.error('[codex] consumer error', { error: err });
  } finally {
    finaliseThinking();
    writer.finalize(writer.text);
    toolActivity.finalise(hadErrors ? 'error' : 'done');
    services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);

    if (stillCurrent()) {
      (services.codex as any).clearHandle(threadId);

      const queued = dequeueMessage(services, threadId as string);
      if (queued) {
        if (queued.messageId) {
          services.chat.updateMessageState(queued.messageId as any, { status: undefined } as any);
        }
        services.action.executeAction('Codex Chat', {
          threadId, text: queued.text, mode: queued.mode || 'codex',
          messageId: queued.messageId, references: queued.references,
        });
      }

      setRunning(services, threadId as string, false);
      services.emitter.sendToBrainSystem({
        eventType: 'cdx.stream.completed',
        payload: { threadId, text, usage, hadErrors, mutatedPaths: mapperState.mutatedPaths, toolCallCount: mapperState.toolCallCount },
      });
    }
  }
}
