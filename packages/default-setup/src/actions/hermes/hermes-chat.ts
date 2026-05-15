/**
 * Hermes Chat — the main conversational action.
 *
 * Starts a Hermes agent conversation via the bridge subprocess, stores the
 * stream consumer, and kicks off fire-and-forget stream processing.
 * The action returns immediately so the brain's step actor is not blocked.
 *
 * Triggered from the "Hermes Agent" flow when a user.message arrives with
 * `mode === 'hermes'`.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getHermesState, persistHermesState } from './_helpers/thread-context';
import { createStreamConsumer } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Hermes Chat',
  description: 'Drives a Hermes agent conversation in streaming mode for the current thread.',
  category: 'hermes',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', description: 'Agent mode', required: false },
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
  const { threadId, text, model, workspace } = params as {
    threadId: string;
    text: string;
    mode?: string;
    model?: string;
    workspace?: string;
  };

  const log = services.logger;
  log.debug('Hermes chat action invoked');

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  // Check concurrency — don't interleave turns
  const prior = getHermesState(services, threadId);
  if (prior?.isRunning) {
    log.debug('Hermes action already running — skipping');
    return { success: true, queued: true };
  }

  // Mark as running
  persistHermesState(services, threadId, {
    isRunning: true,
    chatState: 'working',
    startedAt: prior?.startedAt || Date.now(),
  });

  // Post the user message to the thread
  services.chat.sendBlockMessage({
    threadId: threadId as any,
    text,
    blocks: [],
    forkable: false,
    autoHide: true,
    asUser: true,
  } as any);

  // Create stream consumer
  const onEvent = createStreamConsumer({
    threadId,
    services,
  });

  // Fire-and-forget: start the Hermes chat via the bridge service
  // The stream consumer handles all events in the background
  services.hermes.chat(
    {
      sessionId: prior?.sessionId,
      message: text,
      model: model || prior?.model,
      workspace: workspace || prior?.workspace,
    },
    onEvent,
  ).catch((err: Error) => {
    log.error('Hermes chat failed');
    onEvent('stream_error', { message: err.message });
  });

  return { success: true };
}
