import type { EntityId, Services } from '../../../types';
import { finishOnboarding, type OnboardingState } from '../onboarding-helpers';

/**
 * The finish step ignores its response payload — it's called after the
 * user picks a project from the final choice block, but the pick
 * itself is already captured upstream in the `projects` step's data.
 * This handler just finalizes the onboarding state.
 *
 * Note: unlike the other step handlers, this one doesn't take a
 * `ParsedStepResponse` parameter — there's nothing to read. The
 * dispatcher in `handle-onboarding-response.ts` calls it with 3 args
 * instead of 4.
 */
export function handleFinishStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  finishOnboarding(services, state, threadId);
}
