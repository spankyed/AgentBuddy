import type { ActionMeta, EntityId, Services, Z } from '../../types';
import { getOnboardingState, markTaskCompleted, type OnboardingState } from './onboarding-helpers';
import { handleNameStep } from './steps/handle-name-step';
import { handleTechLevelStep } from './steps/handle-tech-level-step';
import { handleProjectsStep } from './steps/handle-projects-step';
import { handleFinishStep } from './steps/handle-finish-step';

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

const stepHandlers: Record<string, (services: Services, state: OnboardingState, threadId: EntityId, responseValue: any) => void> = {
  'name': handleNameStep,
  'tech-level': handleTechLevelStep,
  'projects': handleProjectsStep,
  'finish': (services, state, threadId) => handleFinishStep(services, state, threadId),
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
  const responseValue = response?.value ?? response;

  const handler = stepHandlers[state.step];
  if (!handler) {
    return { success: false, reason: 'unknown-step' };
  }

  const currentStep = state.step;
  handler(services, state, threadId, responseValue);
  markTaskCompleted(services, threadId, currentStep);

  services.database.tx(stateArtifact.id, true).update('content', state);

  await services.logger.info('Onboarding step completed', { step: state.step, threadId });
  return { success: true, step: state.step };
}
