import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Choose Mode Step',
  description: 'Sets the default mode based on user choice and finishes onboarding',
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

  flashState(services, threadId);

  if (response) {
    state.data.chosenMode = response;
  }

  finishOnboarding(services, state, threadId);
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
