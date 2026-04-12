import type { ActionMeta, EntityId, Services, Z } from '../../types';
import { getOnboardingState, markTaskCompleted, type OnboardingState } from './onboarding-helpers';
import { handleNameStep } from './steps/handle-name-step';
import { handleTechLevelStep } from './steps/handle-tech-level-step';
import { handleProjectsStep } from './steps/handle-projects-step';
import { handleFinishStep } from './steps/handle-finish-step';
import {
  parseStepResponse,
  type OnboardingStepId,
  type ParsedStepResponse,
} from './_helpers/parse-step-response';

export const meta: ActionMeta = {
  label: 'Handle Onboarding Response',
  description: 'Processes an interactive block response and advances the onboarding step',
  category: 'onboarding',
  input: {
    messageId: { type: 'string', description: 'The message ID that was responded to', required: true },
    threadId: { type: 'string', description: 'The thread ID', required: true },
    response: { type: 'any', description: 'The block response data', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { response } = params;
  const threadId = params.threadId as EntityId;

  const stateArtifact = getOnboardingState(services, threadId);

  if (!stateArtifact) {
    await services.logger.warn('No onboarding-state artifact found', { threadId });
    return { success: false, reason: 'no-state' };
  }

  const state = stateArtifact.content as OnboardingState;

  if (params.messageId !== state.pendingMessageId) {
    await services.logger.info('Ignoring response for non-pending message', {
      received: params.messageId,
      expected: state.pendingMessageId,
      step: state.step,
    });
    return { success: false, reason: 'message-id-mismatch' };
  }

  // Parse the raw block response into a step-specific typed payload.
  // Each step handler below takes a narrowed `ParsedStepResponse`
  // variant, so the defensive `typeof === 'string'` checks that used
  // to live in every handler are gone — TypeScript enforces the shape
  // contract via the discriminated union. The stale
  // `response?.value ?? response` line that was here before is
  // redundant: no onboarding block has ever emitted a `{value}`
  // shape. See `_helpers/parse-step-response.ts` for the full
  // shape-contract comment and the accompanying unit test for the
  // regression guard that pins that.
  const parsed = parseStepResponse(state.step as OnboardingStepId, response);

  const currentStep = state.step;
  dispatchStep(parsed, services, state, threadId);
  markTaskCompleted(services, threadId, currentStep);

  services.database.tx(stateArtifact.id, true).update('content', state);

  await services.logger.info('Onboarding step completed', { step: state.step, threadId });
  return { success: true, step: state.step };
}

/**
 * Discriminated dispatch — TypeScript ensures every case is handled
 * and each handler receives the correctly-typed parsed variant. The
 * old `stepHandlers` record was a string-keyed fanout that forced
 * every handler to take an `any`-typed parameter; replacing it with
 * a switch means the compiler narrows `parsed` to the right variant
 * for every branch.
 */
function dispatchStep(
  parsed: ParsedStepResponse,
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
): void {
  switch (parsed.step) {
    case 'name':
      handleNameStep(services, state, threadId, parsed);
      return;
    case 'tech-level':
      handleTechLevelStep(services, state, threadId, parsed);
      return;
    case 'projects':
      handleProjectsStep(services, state, threadId, parsed);
      return;
    case 'finish':
      handleFinishStep(services, state, threadId);
      return;
  }
}
