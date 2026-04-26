import type { ActionMeta, Services } from '../../types';
import { persistCodexState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CX: Stream Started',
  description: 'Handle Codex stream started lifecycle event.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    model: { type: 'string', required: false },
    cwd: { type: 'string', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, model, cwd } = params;
  persistCodexState(services, threadId, {
    ...(model && { model }),
    ...(cwd && { cwd }),
  });
  updateChatState(services, threadId, 'working');
  return { success: true };
}
