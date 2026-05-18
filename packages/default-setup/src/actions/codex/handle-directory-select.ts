/**
 * CDX: Handle Directory Select — processes the user's directory-picker
 * response, saves the chosen directory to settings, and retries the
 * original chat query that was blocked by the missing CWD.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Handle Directory Select',
  description: 'Saves the user-selected project directory and retries the blocked Codex chat query.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    response: { type: 'any', description: 'File-picker response', required: true },
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
      model?: string;
      messageId?: string;
      references?: any;
    };
  };

  // Parse response — supports string or { path, toggles }
  let selectedDir: string | undefined;

  if (typeof response === 'string') {
    selectedDir = response;
  } else if (response?.path) {
    selectedDir = typeof response.path === 'string' ? response.path : response.path?.[0];
  } else if (Array.isArray(response)) {
    selectedDir = response[0];
  }

  if (!selectedDir) {
    return { success: false, error: 'No directory selected' };
  }

  // Save the selected directory as the default base directory.
  services.settings.updatePluginSetting('code', ['defaultBaseDirectory'], selectedDir);

  // Clear pending state.
  persistCodexState(services, threadId, { pendingDirectorySelect: undefined } as any);

  // Mark the picker message as responded.
  services.chat.updateMessageState(pendingDirectorySelect.pickerMessageId as EntityId, {
    responseTimestamp: Date.now(),
    blockResponse: response,
  } as any);

  // Re-invoke the chat action with the original params.
  await services.action.getAndExecute('Codex Chat', {
    threadId,
    text: pendingDirectorySelect.text,
    mode: pendingDirectorySelect.mode || 'codex',
    model: pendingDirectorySelect.model,
    messageId: pendingDirectorySelect.messageId,
    references: pendingDirectorySelect.references,
  });

  return { success: true, directory: selectedDir };
}
