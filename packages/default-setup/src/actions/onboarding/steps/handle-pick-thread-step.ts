import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Pick Thread Step',
  description: 'Opens a selected thread or finishes onboarding with completion message',
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

  if (response === 'skip' || !response) {
    finishOnboarding(services, state, threadId);
  } else {
    services.chat.openThreadChatAndRefreshRecent(response as EntityId);
    finishOnboarding(services, state, threadId, { skipCompletionMessage: true });
  }

  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
