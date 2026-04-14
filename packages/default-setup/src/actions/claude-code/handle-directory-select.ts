/**
 * CC: Handle Directory Select — processes the user's directory-picker
 * response, saves the chosen directory to settings, and retries the
 * original chat query that was blocked by the missing CWD.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Handle Directory Select',
  description: 'Saves the user-selected project directory and retries the blocked chat query.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    response: { type: 'object', description: 'File-picker response (directory path)', required: true },
    pendingDirectorySelect: { type: 'object', description: 'Stored original message params', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, response, pendingDirectorySelect } = params as {
    threadId: string;
    response: any;
    pendingDirectorySelect: {
      pickerMessageId: string;
      text: string;
      mode?: string;
      phase?: string;
      model?: string;
      allowedTools?: string[];
      disallowedTools?: string[];
      systemPrompt?: string;
      messageId?: string;
      references?: any;
    };
  };

  const selectedDir = typeof response === 'string' ? response : response?.[0];
  if (!selectedDir) {
    return { success: false, error: 'No directory selected' };
  }

  // Save the selected directory as the default base directory.
  services.settings.updatePluginSetting('code', ['defaultBaseDirectory'], selectedDir);

  // Clear pending state.
  persistClaudeState(services, threadId, { pendingDirectorySelect: undefined });

  // Mark the picker message as responded.
  services.chat.updateMessageState(pendingDirectorySelect.pickerMessageId as EntityId, {
    responseTimestamp: Date.now(),
    blockResponse: selectedDir,
  } as any);

  // Re-invoke the chat action with the original params.
  await services.action.getAndExecute('Claude Code Chat', {
    threadId,
    text: pendingDirectorySelect.text,
    mode: pendingDirectorySelect.mode,
    phase: pendingDirectorySelect.phase,
    model: pendingDirectorySelect.model,
    allowedTools: pendingDirectorySelect.allowedTools,
    disallowedTools: pendingDirectorySelect.disallowedTools,
    systemPrompt: pendingDirectorySelect.systemPrompt,
    messageId: pendingDirectorySelect.messageId,
    references: pendingDirectorySelect.references,
  });

  return { success: true, directory: selectedDir };
}
