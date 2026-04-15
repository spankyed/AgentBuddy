/**
 * CC: Turn Completed — finalizes the session artifact and creates the diff
 * artifact after a streaming turn ends.
 *
 * Triggered by the `cc.stream.completed` brain event emitted from the
 * stream consumer (both success and error paths). The consumer handles
 * ordering-critical state (writer finalize, toolActivity finalise,
 * clearHandle, setRunning) synchronously before emitting the event.
 * This action handles the async-safe work: UI updates and artifact creation.
 * Queue drain stays in the consumer (ordering-critical).
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { updateSessionArtifact, updateChatState } from './_helpers/session-artifact';
import { parseUnifiedDiff } from './_helpers/parse-diff';

export const meta: ActionMeta = {
  label: 'CC: Turn Completed',
  description: 'Finalizes session stats and creates diff artifact after a turn.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    sessionId: { type: 'string', description: 'CLI session ID', required: false },
    costUsd: { type: 'number', description: 'Total cost in USD', required: false },
    durationMs: { type: 'number', description: 'Turn duration in ms', required: false },
    toolCallCount: { type: 'number', description: 'Number of tool calls', required: false },
    mutatedFileCount: { type: 'number', description: 'Files mutated', required: false },
    mutatedPaths: { type: 'array', description: 'File paths that were mutated', required: false },
    hadErrors: { type: 'boolean', description: 'Whether errors occurred', required: false },
    error: { type: 'string', description: 'Error message if failed', required: false },
    userText: { type: 'string', description: 'Original user message (for diff title)', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const {
    threadId,
    costUsd,
    durationMs,
    hadErrors,
    error: errorMsg,
    mutatedPaths,
    userText,
  } = params as {
    threadId: string;
    sessionId?: string;
    costUsd?: number;
    durationMs?: number;
    toolCallCount?: number;
    mutatedFileCount?: number;
    mutatedPaths?: string[];
    hadErrors?: boolean;
    error?: string;
    userText?: string;
  };

  const log = services.logger;

  if (!threadId) return { success: false, reason: 'missing threadId' };

  // ─── Update session artifact ──────────────────────────────────────
  const { toolCallCount } = params as { toolCallCount?: number };
  updateSessionArtifact(services, threadId as EntityId, (prev) => ({
    turns: (prev.turns ?? 0) + 1,
    totalCostUsd: (prev.totalCostUsd ?? 0) + (costUsd ?? 0),
    toolCallCount: toolCallCount ?? prev.toolCallCount ?? 0,
    lastTurnAt: Date.now(),
  }));
  updateChatState(services, threadId as EntityId, 'idle');

  if (!hadErrors) {
    services.emitter.sendToPlugin('threads', {
      type: 'FLASH_CHAT_STATE', threadId: threadId as string, stateId: 'success', durationMs: 1000,
    });
  }
  // Disabled: hadErrors includes non-critical tool failures (grep no results, bash exit code).
  // Enable once we distinguish process-level errors from routine tool errors.
  // if (hadErrors) {
  //   services.emitter.sendToPlugin('threads', {
  //     type: 'FLASH_CHAT_STATE', threadId: threadId as string, stateId: 'error', durationMs: 3000,
  //   });
  // }

  // ─── Diff artifact ────────────────────────────────────────────────
  let artifactId: string | undefined;
  try {
    const paths = Array.isArray(mutatedPaths) ? mutatedPaths : [];
    if (paths.length > 0) {
      log.debug('collecting diff for mutated files', { paths });
      const unified = await services.cli.git.getDiff(paths);
      const parsed = parseUnifiedDiff(unified);
      if (parsed.files.length > 0) {
        const diffTitle = deriveDiffTitle(userText || '');
        const result = services.artifact.createAndNotify({
          artifactType: 'diff',
          title: diffTitle,
          content: parsed,
          threadId: threadId as EntityId,
        });
        artifactId = result.artifactId;
        log.debug('diff artifact created', { artifactId, fileCount: parsed.files.length });
      }
    }
  } catch (diffErr: any) {
    log.warn('diff artifact assembly failed', { message: diffErr?.message });
  }

  return {
    success: true,
    hadErrors: !!hadErrors,
    error: errorMsg,
    costUsd,
    durationMs,
    artifactId,
  };
}

function deriveDiffTitle(userText: string): string {
  const firstLine = userText.split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Claude Code changes';
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57) + '…';
}
