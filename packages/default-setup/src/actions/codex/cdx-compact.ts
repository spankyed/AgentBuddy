/**
 * CDX: Compact - starts Codex app-server compaction for the current thread.
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'CDX: Compact',
  description: 'Compact the active Codex thread.',
  category: 'codex',
  input: {
    command: { type: 'string', required: true },
    text: { type: 'string', required: false },
    threadId: { type: 'string', required: false },
    references: { type: 'object', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { threadId } = params;

  if (!threadId) {
    return { success: false, command: 'cdx-compact', text: 'No active thread.' };
  }

  try {
    const result = await services.action.getAndExecute('CDX: Handle Summarize', { threadId });
    if (!result?.success) {
      return {
        success: false,
        command: 'cdx-compact',
        text: result?.error || result?.reason || 'Compaction could not be started.',
      };
    }
    return { success: true, command: 'cdx-compact', text: 'Compaction started.' };
  } catch (error: any) {
    const text = `cdx-compact failed: ${error?.message || 'Unknown error'}`;
    services.chat.sendBlockMessage({ threadId, text, blocks: [] });
    return { success: false, command: 'cdx-compact', text };
  }
}
