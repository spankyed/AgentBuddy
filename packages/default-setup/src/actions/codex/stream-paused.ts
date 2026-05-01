import type { ActionMeta, Services } from '../../types';
import { updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CX: Stream Paused',
  description: 'Handle Codex stream paused (permission requested) lifecycle event.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    toolName: { type: 'string', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  updateChatState(services, params.threadId, 'paused');
  return { success: true };
}
