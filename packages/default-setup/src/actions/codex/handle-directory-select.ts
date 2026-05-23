/** CDX: Handle Directory Select — saves chosen directory and retries the blocked chat query. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Handle Directory Select',
  description: 'Saves the selected project directory and retries the blocked Codex query.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: true },
    pendingDirectorySelect: { type: 'object', required: true },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, response, pendingDirectorySelect } = params as {
    threadId: string;
    response: any;
    pendingDirectorySelect: { pickerMessageId: string; text: string; mode?: string; phase?: string; model?: string; messageId?: string; references?: any };
  };

  const selectedDir = typeof response === 'string' ? response
    : response?.path ? (typeof response.path === 'string' ? response.path : response.path?.[0])
    : Array.isArray(response) ? response[0]
    : undefined;

  if (!selectedDir) return { success: false, error: 'No directory selected' };

  services.settings.updatePluginSetting('code', ['defaultBaseDirectory'], selectedDir);
  persistCodexState(services, threadId, { pendingDirectorySelect: undefined } as any);
  services.chat.updateMessageState(pendingDirectorySelect.pickerMessageId as EntityId, { responseTimestamp: Date.now(), blockResponse: response } as any);

  await services.action.getAndExecute('Codex Chat', {
    threadId, text: pendingDirectorySelect.text, mode: pendingDirectorySelect.mode || 'codex',
    phase: pendingDirectorySelect.phase,
    model: pendingDirectorySelect.model, messageId: pendingDirectorySelect.messageId, references: pendingDirectorySelect.references,
  });

  return { success: true, directory: selectedDir };
}
