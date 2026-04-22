import type { ActionMeta, EntityId, Services, Z } from '../../types';
import { getOnboardingState, persistOnboardingState, type OnboardingState } from './onboarding-helpers';
import { handleWelcomeStep } from './steps/handle-welcome-step';
import { handleCliTestStep } from './steps/handle-cli-test-step';
import { handleCcImportStep } from './steps/handle-cc-import-step';
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

  const state = getOnboardingState(services, threadId);

  if (!state) {
    await services.logger.warn('No onboarding state found on thread context', { threadId });
    return { success: false, reason: 'no-state' };
  }

  if (state.step === 'complete') {
    return { success: false, reason: 'already-complete' };
  }

  if (params.messageId !== state.pendingMessageId) {
    await services.logger.info('Ignoring response for non-pending message', {
      received: params.messageId,
      expected: state.pendingMessageId,
      step: state.step,
    });
    return { success: false, reason: 'message-id-mismatch' };
  }

  const parsed = parseStepResponse(state.step as OnboardingStepId, response);

  await dispatchStep(parsed, services, state, threadId);

  persistOnboardingState(services, threadId, state);

  await services.logger.info('Onboarding step completed', { step: state.step, threadId });
  return { success: true, step: state.step };
}

async function dispatchStep(
  parsed: ParsedStepResponse,
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
): Promise<void> {
  switch (parsed.step) {
    case 'welcome':
      await handleWelcomeStep(services, state, threadId);
      return;
    case 'cli-test-ask':
      await handleCliTestStep(services, state, threadId, parsed.action);
      return;
    case 'cc-import':
      handleCcImportStep(services, state, threadId, parsed.selected);
      return;
  }
}
