/** CDX: Turn Completed — finalizes session stats and creates diff artifact. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, updateCodexState, updateChatState } from './_helpers/thread-context';
import { parseUnifiedDiff } from '../claude-code/_helpers/parse-diff';

export const meta: ActionMeta = {
  label: 'CDX: Turn Completed',
  description: 'Finalizes session stats and creates diff artifact after a Codex turn.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    usage: { type: 'object', required: false },
    toolCallCount: { type: 'number', required: false },
    mutatedPaths: { type: 'array', required: false },
    hadErrors: { type: 'boolean', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, usage, hadErrors, mutatedPaths, toolCallCount } = params as {
    threadId: string;
    usage?: { input: number; output: number; reasoning: number };
    hadErrors?: boolean;
    mutatedPaths?: string[];
    toolCallCount?: number;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  updateCodexState(services, threadId as EntityId, (prev) => ({
    turns: (prev.turns ?? 0) + 1,
    totalTokens: usage ? {
      input: (prev.totalTokens?.input ?? 0) + usage.input,
      output: (prev.totalTokens?.output ?? 0) + usage.output,
      reasoning: (prev.totalTokens?.reasoning ?? 0) + usage.reasoning,
    } : prev.totalTokens,
    toolCallCount: (prev.toolCallCount ?? 0) + (toolCallCount ?? 0),
    lastTurnAt: Date.now(),
  }));

  const cdxState = getCodexState(services, threadId);
  if (!cdxState?.isRunning && cdxState?.chatState !== 'error') {
    const wasPaused = cdxState?.chatState === 'idle';
    updateChatState(services, threadId as EntityId, !hadErrors && !wasPaused ? 'success' : 'idle');
  }

  // Diff artifact
  let artifactId: string | undefined;
  const paths = Array.isArray(mutatedPaths) ? mutatedPaths : [];
  if (paths.length > 0) {
    try {
      const parsed = parseUnifiedDiff(await services.cli.git.getDiff(paths));
      if (parsed.files.length > 0) {
        const basenames = parsed.files.map(f => f.path.split('/').pop() ?? f.path);
        const prefix = `[Diff][${parsed.files.length}] `;
        let title = prefix + basenames.join(', ');
        if (title.length > 80) title = prefix + basenames.slice(0, 3).join(', ') + '…';
        artifactId = services.artifact.createAndNotify({ artifactType: 'diff', title, content: parsed, threadId: threadId as EntityId }).artifactId;
      }
    } catch (e: any) {
      services.logger.warn('[codex] diff failed', { message: e?.message });
    }
  }

  return { success: true, hadErrors: !!hadErrors, artifactId };
}
