import type { EntityId, Services } from '../../../types';
import { finishOnboarding, type OnboardingState } from '../onboarding-helpers';

/**
 * The finish step finalizes onboarding. Called when the user
 * responds to the final choice block (thread selection) or
 * when no further steps remain.
 */
export function handleFinishStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  finishOnboarding(services, state, threadId);
}
