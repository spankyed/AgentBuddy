/**
 * CC: Unqueue Message — removes a queued message without killing the
 * running turn. The user clicked "Cancel" on the amber "Queued" indicator.
 */

import type { ActionMeta, Services } from '../../types';
import { dequeueMessage, getClaudeState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Unqueue Message',
  description: 'Removes a queued message without affecting the running turn.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    messageId: { type: 'string', description: 'Message entity ID of the queued message', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, messageId } = params as { threadId: string; messageId: string };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const prior = getClaudeState(services, threadId);
  if (!prior?.queuedMessage) {
    return { success: true, noop: true, reason: 'no queued message' };
  }

  // Only dequeue if the queued message matches what the user clicked.
  // Guards against race where the queue drained naturally before this event arrived.
  if (messageId && prior.queuedMessage.messageId !== messageId) {
    return { success: true, noop: true, reason: 'queued message mismatch' };
  }

  // Pop from queue and mark the message as cancelled.
  const queued = dequeueMessage(services, threadId);
  if (queued?.messageId) {
    services.chat.updateMessageState(queued.messageId as any, { status: 'cancelled' } as any);
  }

  return { success: true };
}
