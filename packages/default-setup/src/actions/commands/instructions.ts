import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Set Instructions',
  description: 'Set thread instructions and use the first part as the thread title',
  category: 'commands',
  input: {
    text: { type: 'string', description: 'Instructions text', required: true },
    threadId: { type: 'string', description: 'Thread ID', required: false },
  },
};

const TOPIC_MAX_LENGTH = 40;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { text, threadId } = params;

  if (!threadId) {
    return { success: false, error: 'No active thread' };
  }

  if (!text?.trim()) {
    services.chat.sendBlockMessage({
      threadId,
      text: 'Usage: /instructions <your instructions text>',
      blocks: [],
    });
    return { success: false, error: 'No instructions provided' };
  }

  const instructions = text.trim();
  const plainText = stripHtml(instructions);
  const topic = plainText.substring(0, TOPIC_MAX_LENGTH);

  services.repository.threadCommands.update(threadId as any, {
    topic,
    instructions,
  });

  services.emitter.sendToPlugin('threads', {
    type: 'THREAD_UPDATED',
    threadId,
    updates: { topic, instructions },
  });

  services.chat.sendRecentThreadsRefresh();

  services.chat.sendBlockMessage({
    threadId,
    text: 'Instructions set.',
    blocks: [],
  });

  return { success: true };
}
