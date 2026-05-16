/**
 * Hermes: Stream Lifecycle — unified handler for stream boundary events.
 *
 * Dispatches on `eventType` (started | done | error) to persist thread
 * state, finalize messages, or post error blocks. Fired by the stream
 * consumer via brain events at lifecycle boundaries.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getHermesState, persistHermesState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'Hermes: Stream Lifecycle',
  description: 'Handles stream started/done/error lifecycle events.',
  category: 'hermes',
  input: {
    eventType: { type: 'string', description: 'started | done | error', required: true },
    threadId: { type: 'string', description: 'Target thread', required: true },
    streamId: { type: 'string', description: 'Active stream ID', required: false },
    messageId: { type: 'string', description: 'Assistant message to finalize', required: false },
    sessionId: { type: 'string', description: 'Hermes session ID', required: false },
    finalResponse: { type: 'string', description: 'Final response text', required: false },
    errorMessage: { type: 'string', description: 'Error message', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { eventType, threadId, streamId, messageId, sessionId, finalResponse, errorMessage } = params;
  if (!threadId) return { success: false, error: 'threadId required' };

  switch (eventType) {
    case 'started':
      persistHermesState(services, threadId, {
        activeStreamId: streamId,
        isRunning: true,
        ...(sessionId ? { sessionId } : {}),
      });
      updateChatState(services, threadId, 'working');
      break;

    case 'paused':
      persistHermesState(services, threadId, { isRunning: false });
      updateChatState(services, threadId, 'paused');
      break;

    case 'done': {
      if (messageId) {
        services.chat.updateMessageState(messageId as any, {
          forkable: true,
          ...(finalResponse ? { text: finalResponse } : {}),
        } as any);
      }
      const state = getHermesState(services, threadId);
      if (state?.chatState !== 'error') {
        const wasPaused = state?.chatState === 'paused';
        const nextState = wasPaused ? 'idle' : 'success';
        persistHermesState(services, threadId, {
          isRunning: false,
          activeStreamId: undefined,
          turns: (state?.turns || 0) + 1,
          ...(sessionId ? { sessionId } : {}),
        });
        updateChatState(services, threadId, nextState);
      }
      break;
    }

    case 'error':
      services.chat.sendBlockMessage({
        threadId: threadId as any,
        text: `Error: ${errorMessage || 'Unknown error'}`,
        blocks: [{ type: 'note', props: { content: errorMessage || 'Unknown error', variant: 'error', label: 'Hermes Error' } }],
        forkable: false,
      });
      persistHermesState(services, threadId, {
        isRunning: false,
        activeStreamId: undefined,
      });
      updateChatState(services, threadId, 'error');
      break;
  }

  return { success: true };
}
