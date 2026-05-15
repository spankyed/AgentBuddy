/**
 * Fire-and-forget stream consumer for Hermes agent responses.
 *
 * Translates Hermes bridge JSONL events into AgentBuddy thread messages:
 * - token → UPDATE_MESSAGE_STATE (streaming text append)
 * - tool_start → tool activity block
 * - tool_complete → update tool status
 * - done → finalize message, update thread state
 * - stream_error → error message
 *
 * Mirrors the claude-code `_helpers/stream-consumer.ts` pattern but is
 * simpler since Hermes bridge events are already high-level.
 */

import type { Services } from '../../../types';
import {
  getHermesState,
  persistHermesState,
} from './thread-context';

interface StreamConsumerOptions {
  threadId: string;
  services: Services;
}

/**
 * Consume streaming events from the Hermes bridge.
 *
 * Called from the Hermes Chat action — runs as a long-lived callback
 * handler that processes events as they arrive from the bridge.
 *
 * Returns an event handler function to be passed to `hermes.chat()`.
 */
export function createStreamConsumer(opts: StreamConsumerOptions) {
  const { threadId, services } = opts;
  const log = services.logger;

  let currentMessageId: string | null = null;
  let accumulatedText = '';
  let toolActivities: Array<{ name: string; toolCallId: string; status: 'running' | 'done' }> = [];
  let streamId: string | null = null;

  // Throttle text updates to avoid flooding the frontend
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_INTERVAL = 80; // ms

  function flushText() {
    if (!currentMessageId || !accumulatedText) return;
    services.chat.updateMessageState(currentMessageId as any, {
      text: accumulatedText,
    } as any);
  }

  function scheduleFlush() {
    if (flushTimeout) return;
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      flushText();
    }, FLUSH_INTERVAL);
  }

  return function onEvent(type: string, data: Record<string, unknown>) {
    switch (type) {
      case 'stream_start': {
        streamId = data.streamId as string;
        persistHermesState(services, threadId, {
          activeStreamId: streamId,
          chatState: 'working',
          isRunning: true,
        });

        // Create the assistant message placeholder
        const msg = services.chat.sendBlockMessage({
          threadId: threadId as any,
          text: 'Thinking\u2026',
          blocks: [],
          forkable: false,
        });
        currentMessageId = msg?.messageId ?? null;
        accumulatedText = '';
        toolActivities = [];
        break;
      }

      case 'token': {
        const text = data.text as string;
        if (!text) break;
        accumulatedText += text;
        scheduleFlush();
        break;
      }

      case 'tool_start': {
        const name = data.name as string;
        const toolCallId = data.toolCallId as string;
        toolActivities.push({ name, toolCallId, status: 'running' });

        if (currentMessageId) {
          services.chat.updateMessageState(currentMessageId as any, {
            text: accumulatedText || 'Using tools\u2026',
            blocks: [{
              type: 'tool-activity',
              props: {
                label: `Running ${name}\u2026`,
                tools: toolActivities.map(t => ({
                  name: t.name,
                  status: t.status,
                })),
              },
            }],
          } as any);
        }
        break;
      }

      case 'tool_complete': {
        const toolCallId = data.toolCallId as string;
        const activity = toolActivities.find(t => t.toolCallId === toolCallId);
        if (activity) {
          activity.status = 'done';
        }

        if (currentMessageId) {
          const allDone = toolActivities.every(t => t.status === 'done');
          services.chat.updateMessageState(currentMessageId as any, {
            text: accumulatedText || 'Using tools\u2026',
            blocks: [{
              type: 'tool-activity',
              props: {
                label: allDone
                  ? `Used ${toolActivities.length} tool${toolActivities.length > 1 ? 's' : ''}`
                  : 'Running tools\u2026',
                tools: toolActivities.map(t => ({
                  name: t.name,
                  status: t.status,
                })),
              },
            }],
          } as any);
        }
        break;
      }

      case 'tool_call': {
        const name = data.name as string;
        if (currentMessageId) {
          services.chat.updateMessageState(currentMessageId as any, {
            text: accumulatedText || `Using ${name}\u2026`,
            blocks: [{
              type: 'tool-activity',
              props: {
                label: `Using ${name}\u2026`,
                tools: [{ name, status: 'running' }],
              },
            }],
          } as any);
        }
        break;
      }

      case 'reasoning':
        // Could display reasoning in a collapsible block — skip for now
        break;

      case 'done': {
        if (flushTimeout) {
          clearTimeout(flushTimeout);
          flushTimeout = null;
        }

        const finalResponse = data.finalResponse as string;
        if (finalResponse) {
          accumulatedText = finalResponse;
        }
        flushText();

        // Mark message as forkable
        if (currentMessageId) {
          services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);
        }

        const state = getHermesState(services, threadId);
        persistHermesState(services, threadId, {
          chatState: 'success',
          isRunning: false,
          activeStreamId: undefined,
          turns: (state?.turns || 0) + 1,
          sessionId: (data.sessionId as string) || state?.sessionId,
        });

        log.info('Hermes stream completed');
        break;
      }

      case 'stream_error': {
        if (flushTimeout) {
          clearTimeout(flushTimeout);
          flushTimeout = null;
        }

        const errorMsg = (data.message as string) || 'Unknown error';
        flushText();

        services.chat.sendBlockMessage({
          threadId: threadId as any,
          text: `Error: ${errorMsg}`,
          blocks: [{
            type: 'note',
            props: {
              content: errorMsg,
              variant: 'error',
              label: 'Hermes Error',
            },
          }],
          forkable: false,
        });

        persistHermesState(services, threadId, {
          chatState: 'error',
          isRunning: false,
          activeStreamId: undefined,
        });

        log.error('Hermes stream error');
        break;
      }

      default:
        log.debug('Unknown Hermes stream event');
    }
  };
}
