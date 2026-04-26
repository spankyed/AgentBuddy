import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState } from '../onboarding-helpers';
import { startCodexProjectsStep } from './handle-provider-select-step';

export const meta: ActionMeta = {
  label: 'Handle Codex Login Step',
  description: 'Handles Codex OAuth login response — triggers browser login or skips',
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

  if (response === 'skip') {
    services.chat.sendBlockMessage({
      threadId,
      text: "No problem! You can log in later from Settings or by switching to Codex mode.",
      blocks: [],
      forkable: false,
    });
    finishOnboarding(services, state, threadId, { skipCompletionMessage: true });
    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  if (response === 'login' || response === 'retry') {
    flashState(services, threadId);

    services.chat.sendBlockMessage({
      threadId,
      text: 'Opening browser for ChatGPT login…',
      blocks: [],
      forkable: false,
    });

    try {
      const status = await (services.cli as any).codex.login();

      services.chat.sendBlockMessage({
        threadId,
        text: `Authenticated as ${status.email || 'unknown'} (${status.planType || 'unknown'} plan).`,
        blocks: [],
        forkable: false,
      });

      startCodexProjectsStep(services, state, threadId);
      persistOnboardingState(services, threadId, state);
      return { success: true, step: state.step };
    } catch (err: any) {
      const { messageId } = services.chat.sendChoiceBlock({
        threadId,
        text: `Login failed: ${err?.message || 'Unknown error'}. Would you like to try again?`,
        prompt: 'Codex Authentication',
        choices: [
          { id: 'retry', label: 'Try again', description: 'Re-open the login page' },
          { id: 'skip', label: 'Skip for now', description: "I'll set this up later" },
        ],
        allowCustom: false,
        forkable: false,
        autoHide: true,
        asUser: true,
      });

      state.step = 'codex-login';
      state.pendingMessageId = messageId;
      persistOnboardingState(services, threadId, state);
      return { success: true, step: state.step };
    }
  }

  return { success: false, reason: 'unknown-response' };
}
