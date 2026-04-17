/**
 * CC: Task Backgrounded — notifies the user when a Bash command has been
 * sent to background.
 *
 * Triggered by the `cc.task.backgrounded` brain event, which is emitted from
 * the stream consumer when a Bash control_request is auto-approved with
 * `run_in_background: true` (pattern match or user chose "Allow (Background)").
 *
 * Does NOT touch chatState — background processes are orthogonal to the
 * turn lifecycle (idle/working/paused). The background-processes artifact
 * communicates this state instead.
 */

import type { ActionMeta, Services } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: Task Backgrounded',
  description: 'Notifies the user when a Bash command is backgrounded.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    command: { type: 'string', description: 'The Bash command that was backgrounded', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, command } = params as {
    threadId: string;
    command?: string;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  // Notify the user in chat.
  const shortCommand = command && command.length > 60
    ? command.slice(0, 57) + '…'
    : command || 'bash command';

  services.chat.sendBlockMessage({
    threadId: threadId as any,
    text: `Background process started: \`${shortCommand}\`. You can continue chatting.`,
    blocks: [],
    forkable: false,
  });

  return { success: true };
}
