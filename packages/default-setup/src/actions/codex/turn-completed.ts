/**
 * CDX: Turn Completed — finalizes session stats and creates the diff
 * artifact after a streaming turn ends.
 *
 * Triggered by the `cdx.stream.completed` brain event emitted from the
 * stream consumer (both success and error paths).
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, updateCodexState, updateChatState } from './_helpers/thread-context';
import { parseUnifiedDiff } from '../claude-code/_helpers/parse-diff';

export const meta: ActionMeta = {
  label: 'CDX: Turn Completed',
  description: 'Finalizes session stats and creates diff artifact after a Codex turn.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    usage: { type: 'object', description: 'Token usage { input, output, reasoning }', required: false },
    toolCallCount: { type: 'number', description: 'Number of tool calls', required: false },
    mutatedPaths: { type: 'array', description: 'File paths that were mutated', required: false },
    hadErrors: { type: 'boolean', description: 'Whether errors occurred', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const {
    threadId,
    usage,
    hadErrors,
    mutatedPaths,
    toolCallCount,
  } = params as {
    threadId: string;
    usage?: { input: number; output: number; reasoning: number };
    hadErrors?: boolean;
    mutatedPaths?: string[];
    toolCallCount?: number;
  };

  const log = services.logger;

  if (!threadId) return { success: false, reason: 'missing threadId' };

  // ─── Update session stats ──────────────────────────────────────────
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

  // Only transition chatState if no follow-up turn is in flight.
  const cdxState = getCodexState(services, threadId);
  const running = cdxState?.isRunning === true;

  if (!running) {
    const currentChatState = cdxState?.chatState;
    if (currentChatState !== 'error') {
      const wasPaused = currentChatState === 'idle';
      updateChatState(services, threadId as EntityId, !hadErrors && !wasPaused ? 'success' : 'idle');
    }
  }

  // ─── Diff artifact ────────────────────────────────────────────────
  let artifactId: string | undefined;
  try {
    const paths = Array.isArray(mutatedPaths) ? mutatedPaths : [];
    if (paths.length > 0) {
      log.debug('[codex] collecting diff for mutated files', { paths });
      const unified = await services.cli.git.getDiff(paths);
      const parsed = parseUnifiedDiff(unified);
      if (parsed.files.length > 0) {
        const diffTitle = deriveDiffTitle(parsed.files);
        const result = services.artifact.createAndNotify({
          artifactType: 'diff',
          title: diffTitle,
          content: parsed,
          threadId: threadId as EntityId,
        });
        artifactId = result.artifactId;
        log.debug('[codex] diff artifact created', { artifactId, fileCount: parsed.files.length });
      }
    }
  } catch (diffErr: any) {
    log.warn('[codex] diff artifact assembly failed', { message: diffErr?.message });
  }

  return { success: true, hadErrors: !!hadErrors, artifactId };
}

function deriveDiffTitle(files: { path: string }[]): string {
  if (files.length === 0) return '[Diff] No changes';
  const basenames = files.map(f => f.path.split('/').pop() ?? f.path);
  const prefix = `[Diff][${files.length}] `;
  const joined = basenames.join(', ');
  if (prefix.length + joined.length <= 80) return prefix + joined;
  let result = '';
  for (let i = 0; i < basenames.length; i++) {
    const next = result ? result + ', ' + basenames[i] : basenames[i];
    if (prefix.length + next.length + 1 > 80) {
      return prefix + result + '…';
    }
    result = next;
  }
  return prefix + result;
}
