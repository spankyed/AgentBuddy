import type { ActionMeta, Services } from '../../types';
import { killTurn, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CX: Pause Turn',
  description: 'Handle user-initiated pause of a Codex turn.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  killTurn(services, params.threadId);
  updateChatState(services, params.threadId, 'idle');
  return { success: true };
}
