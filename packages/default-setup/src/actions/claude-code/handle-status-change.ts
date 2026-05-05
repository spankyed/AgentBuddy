/**
 * CC: Handle Status Change — auto-starts a claude-code session when a
 * thread transitions to "In Progress" via a user-initiated status change
 * (e.g. kanban drag).
 *
 * Triggered by the `thread.status.changed` brain event emitted from the
 * threads system. Reads the thread's instructions, creates a user message,
 * and fires a `user.message` brain event to kick off the claude-code flow.
 */

import type { ActionMeta, Services, EntityId } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: Handle Status Change',
  description: 'Auto-starts a claude-code session when a thread transitions to In Progress.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    status: { type: 'string', description: 'New status', required: true },
    userInduced: { type: 'boolean', description: 'Whether the status change was user-initiated', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, status, userInduced } = params as {
    threadId: string;
    status: string;
    userInduced: boolean;
  };

  if (!userInduced || status !== 'In Progress') {
    return { success: false, reason: 'not applicable' };
  }

  const thread = services.repository.threadQueries.byId(threadId as EntityId);
  const instructions = thread?.instructions?.trim();
  if (!instructions) return { success: false, reason: 'no instructions' };

  const { messageId } = services.chat.sendUserMessage({
    threadId: threadId as EntityId,
    text: instructions,
  });

  services.emitter.sendToBrainSystem({
    eventType: 'user.message',
    payload: {
      text: instructions,
      mode: 'work',
      threadId,
      messageId,
    },
  });

  return { success: true };
}
