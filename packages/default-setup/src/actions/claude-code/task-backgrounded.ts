/**
 * CC: Task Backgrounded — updates the session artifact and notifies the user
 * when a Bash command has been sent to background.
 *
 * Triggered by the `cc.task.backgrounded` brain event, which is emitted from
 * the stream consumer when a Bash control_request is auto-approved with
 * `run_in_background: true` (pattern match or user chose "Allow (Background)").
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState } from './_helpers/thread-context';
import { updateChatState } from './_helpers/session-artifact';

export const meta: ActionMeta = {
  label: 'CC: Task Backgrounded',
  description: 'Updates chat state and notifies the user when a Bash command is backgrounded.',
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

  // Only set 'background' if no foreground turn is actively running.
  // If a queued message was replayed, chatState is already 'working' and
  // should stay that way.
  const state = getClaudeState(services, threadId);
  if (!state?.isRunning) {
    updateChatState(services, threadId as EntityId, 'background');
  }

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
