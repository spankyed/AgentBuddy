/**
 * CDX: Unqueue Message — removes a queued message without killing the
 * running turn. The user clicked "Cancel" on the amber "Queued" indicator.
 */

import type { ActionMeta, Services } from '../../types';
import { dequeueMessage, getCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Unqueue Message',
  description: 'Removes a queued message without affecting the running Codex turn.',
  category: 'codex',
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

  const prior = getCodexState(services, threadId);
  if (!prior?.queuedMessage) {
    return { success: true, noop: true, reason: 'no queued message' };
  }

  if (messageId && prior.queuedMessage.messageId !== messageId) {
    return { success: true, noop: true, reason: 'queued message mismatch' };
  }

  const queued = dequeueMessage(services, threadId);
  if (queued?.messageId) {
    try {
      services.chat.updateMessageState(queued.messageId as any, { status: 'cancelled' } as any);
    } catch { /* entity already deleted */ }
  }

  return { success: true };
}
