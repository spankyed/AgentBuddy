/**
 * Hermes Chat — starts a Hermes agent conversation.
 *
 * Validates inputs, checks concurrency, then fires-and-forgets the stream
 * consumer. The consumer handles all streaming mechanics and fires brain
 * events at lifecycle boundaries for the flow-routed lifecycle action.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getHermesState } from './_helpers/thread-context';
import { createStreamConsumer } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Hermes Chat',
  description: 'Drives a Hermes agent conversation in streaming mode.',
  category: 'hermes',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    model: { type: 'string', description: 'Override model name', required: false },
    workspace: { type: 'string', description: 'Working directory', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { threadId, text, model, workspace } = params;

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  const prior = getHermesState(services, threadId);
  if (prior?.isRunning) {
    return { success: true, queued: true };
  }

  const onEvent = createStreamConsumer({ threadId, services });

  // Fire-and-forget — consumer handles streaming + lifecycle events
  (services as any).hermes.chat(
    {
      sessionId: prior?.sessionId,
      message: text,
      model: model || prior?.model,
      workspace: workspace || prior?.workspace,
    },
    onEvent,
  ).catch((err: Error) => {
    onEvent('stream_error', { message: err.message });
  });

  return { success: true };
}
