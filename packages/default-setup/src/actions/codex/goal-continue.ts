/** CDX: Goal Continue — auto-continues a Codex turn when the thread goal is active. */

import type { ActionMeta, Services } from '../../types';
import { getCodexState, persistCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Goal Continue',
  description: 'Auto-continues a Codex turn when the thread goal is active.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
  },
};

const MAX_CONTINUATION_TURNS = 50;

export async function action(params: Record<string, any>, services: Services) {
  const { threadId } = params;
  const state = getCodexState(services, threadId);
  const goal = state?.goal;

  // Skip if: no active goal, already running (queued message took priority), or paused/terminal
  if (!goal || goal.status !== 'active' || state?.isRunning) {
    return { continued: false };
  }

  // Safety valve: cap consecutive auto-continuation turns
  const turns = goal.continuationTurns ?? 0;
  if (turns >= MAX_CONTINUATION_TURNS) {
    persistCodexState(services, threadId, {
      goal: { ...goal, status: 'usage_limited' as const },
    });
    services.chat.sendBlockMessage({
      threadId,
      text: `Goal auto-continuation stopped after ${MAX_CONTINUATION_TURNS} turns. Use /cdx-goal resume to continue.`,
      blocks: [],
    });
    return { continued: false, reason: 'max-turns' };
  }

  // Increment continuation counter and start new turn
  persistCodexState(services, threadId, {
    goal: { ...goal, continuationTurns: turns + 1 },
  });

  try {
    await services.action.getAndExecute('Codex Chat', {
      threadId,
      text: 'Continue working toward the goal.',
      mode: 'Codex',
    });
    return { continued: true };
  } catch (err: any) {
    services.logger.warn('[codex] goal continuation failed', { error: err?.message });
    return { continued: false, error: err?.message };
  }
}
