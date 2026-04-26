import type { ActionMeta, Services } from '../../types';
import { updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CX: Turn Completed',
  description: 'Handle Codex turn completed lifecycle event.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    text: { type: 'string', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  updateChatState(services, params.threadId, 'idle');
  return { success: true };
}
