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
import { updateSessionArtifact, updateChatState, readSessionChatState, readSessionCwd } from './_helpers/session-artifact';
import { getClaudeState } from './_helpers/thread-context';
import { parseUnifiedDiff } from './_helpers/parse-diff';
import { parseContextMarkdown } from './_helpers/context-parser';
import type { ContextUsageData } from './_helpers/context-parser';

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
    userText: { type: 'string', description: 'Original user message', required: false },
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
    toolCallCount: (prev.toolCallCount ?? 0) + (toolCallCount ?? 0),
    lastTurnAt: Date.now(),
  }));

  // A queued-message replay re-enters chat.ts BEFORE this action fires
  // (stream-consumer awaits `replayQueuedMessage` before emitting
  // cc.stream.completed). That replay already set isRunning=true and
  // chatState='working' synchronously, so an unconditional 'idle' write
  // here would overwrite 'working' and leave the chat panel looking
  // stuck in idle for the entire replayed turn — until a permission
  // prompt or its own turn-completed fires. When a follow-up turn is
  // in flight, skip the idle transition AND the success flash;
  // the replayed turn's own turn-completed will handle both.
  const running = getClaudeState(services, threadId)?.isRunning === true;

  if (!running) {
    // Don't overwrite a persistent 'error' state (e.g. session-not-found) —
    // markSessionBroken already set it and the user needs to see it.
    const currentChatState = readSessionChatState(services, threadId as EntityId);
    if (currentChatState !== 'error') {
      // If chatState is already 'idle', the turn was paused/cancelled by the
      // user (pause-turn sets 'idle' before this action fires). Skip the
      // success flash — the turn didn't complete, it was interrupted.
      const wasPaused = currentChatState === 'idle';
      updateChatState(services, threadId as EntityId, 'idle');
      if (!hadErrors && !wasPaused) {
        services.emitter.sendToPlugin('threads', {
          type: 'FLASH_CHAT_STATE', threadId: threadId as string, stateId: 'success', durationMs: 1000,
        });
      }
    }
  }

  // ─── Diff artifact ────────────────────────────────────────────────
  let artifactId: string | undefined;
  try {
    const paths = Array.isArray(mutatedPaths) ? mutatedPaths : [];
    if (paths.length > 0) {
      log.debug('collecting diff for mutated files', { paths });
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
        log.debug('diff artifact created', { artifactId, fileCount: parsed.files.length });
      }
    }
  } catch (diffErr: any) {
    log.warn('diff artifact assembly failed', { message: diffErr?.message });
  }

  // ─── Context usage refresh + threshold alerts ─────────────────────
  // Query the CLI with `/context` to get the full context window breakdown
  // (same mechanism as /cc-context). Best-effort — don't fail the turn.
  try {
    const sessionId = getClaudeState(services, threadId)?.sessionId;
    const sessionCwd = readSessionCwd(services, threadId as EntityId);
    if (sessionId) {
      const handle = await services.cli.claudeCode.query({
        ...(sessionCwd && { cwd: sessionCwd }),
        prompt: '/context',
        resume: sessionId,
        maxTurns: 1,
        permissionMode: 'plan',
        noSessionPersistence: true,
      });
      const ctxResult = await handle.result;
      const contextUsage = parseContextMarkdown(ctxResult.text || '');
      if (contextUsage) {
        // Check for newly crossed thresholds before writing to artifact
        const newAlerts = checkContextThresholds(services, threadId as EntityId, contextUsage);

        updateSessionArtifact(services, threadId as EntityId, (prev) => ({
          contextUsage,
          ...(newAlerts.length > 0
            ? { alertedThresholds: [...(prev.alertedThresholds ?? []), ...newAlerts] }
            : {}),
        }));

        // Send threshold alert messages
        if (newAlerts.length > 0) {
          const highest = Math.max(...newAlerts);
          const variant = highest >= 90 ? 'error' : highest >= 75 ? 'warning' : 'info';
          const label = highest >= 90 ? 'Context Critical' : 'Context Usage';
          let message = `Context window is ${contextUsage.percentage}% full (${fmtTokens(contextUsage.totalTokens)} / ${fmtTokens(contextUsage.maxTokens)} tokens).`;
          if (highest >= 90) message += ' Consider starting a new session soon.';

          services.chat.sendBlockMessage({
            threadId: threadId as any,
            text: message,
            blocks: [{ type: 'note', props: { content: message, variant, label } }],
            forkable: false,
          });
        }
      }
    }
  } catch {
    log.debug('context usage refresh failed (best-effort)');
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

// ─── Helpers ──────────────────────────────────────────────────────────

const THRESHOLDS = [25, 50, 75, 90];

/** Check which thresholds are newly crossed based on accurate contextUsage data. */
function checkContextThresholds(
  services: Services,
  threadId: EntityId,
  contextUsage: ContextUsageData,
): number[] {
  const prev = services.repository.chatQueries.threadArtifacts(threadId)
    ?.find((a: any) => a.artifactType === 'claude-session');
  const alerted: number[] = (prev?.content as any)?.alertedThresholds ?? [];
  const pct = contextUsage.percentage;
  return THRESHOLDS.filter(t => pct >= t && !alerted.includes(t));
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
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
