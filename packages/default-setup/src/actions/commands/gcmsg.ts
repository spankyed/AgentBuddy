import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Git Commit Command',
  description: 'Commits staged changes with the provided message',
  category: 'commands',
  input: {
    text: { type: 'string', description: 'Commit message', required: true },
    threadId: { type: 'string', description: 'Thread ID for feedback', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { text, threadId } = params;

  if (!text?.trim()) {
    if (threadId) {
      services.chat.sendBlockMessage({
        threadId,
        text: 'Usage: /gcmsg <commit message>',
        blocks: [],
      });
    }
    return { success: false, error: 'Empty commit message' };
  }

  try {
    await services.cli.git.commit(text.trim());

    if (threadId) {
      services.chat.sendBlockMessage({
        threadId,
        text: `Committed: "${text.trim()}"`,
        blocks: [],
      });
    }

    return { success: true, message: text.trim() };
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to commit';
    if (threadId) {
      services.chat.sendBlockMessage({
        threadId,
        text: `Commit failed: ${errorMsg}`,
        blocks: [],
      });
    }
    return { success: false, error: errorMsg };
  }
}
