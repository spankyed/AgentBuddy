import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState } from '../onboarding-helpers';
import { testCliAndAdvance } from './handle-welcome-step';

export const meta: ActionMeta = {
  label: 'Handle Codex Fallback Step',
  description: 'Handles user choice after Codex API validation fails — offers Claude Code setup or skip',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const threadId = params.threadId as EntityId;
  const response = typeof params.response === 'string' ? params.response : '';
  const state = getOnboardingState(services, threadId);
  if (!state) return { success: false, reason: 'no-state' };

  if (response === 'setup-cc') {
    flashState(services, threadId);

    services.chat.sendBlockMessage({
      threadId,
      text: 'Setting up Claude Code…',
      blocks: [],
      forkable: false,
    });

    // Switch to Claude Code path (or keep 'both' if that was the original choice)
    if (state.data.provider !== 'both') {
      state.data.provider = 'claude-code';
    }
    await testCliAndAdvance(services, state, threadId);
    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  if (response === 'skip') {
    services.chat.sendBlockMessage({
      threadId,
      text: "No problem! You can set up a provider later from Settings.",
      blocks: [],
      forkable: false,
    });
    finishOnboarding(services, state, threadId, { skipCompletionMessage: true });
    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  return { success: false, reason: 'unknown-response' };
}
