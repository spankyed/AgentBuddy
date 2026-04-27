import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState, type OnboardingState } from '../onboarding-helpers';
import { startCodexProjectsStep } from './handle-provider-select-step';
import { testCliAndAdvance } from './handle-welcome-step';

export const meta: ActionMeta = {
  label: 'Handle Codex Login Step',
  description: 'Handles Codex OAuth login response — triggers browser login, validates API access, or skips',
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
    // If 'both' was selected and codex was skipped, fall through to Claude Code
    if (state.data.provider === 'both') {
      services.chat.sendBlockMessage({
        threadId,
        text: 'Skipping Codex setup. Moving on to Claude Code…',
        blocks: [],
        forkable: false,
      });
      await testCliAndAdvance(services, state, threadId);
      persistOnboardingState(services, threadId, state);
      return { success: true, step: state.step };
    }

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
        text: `Authenticated as ${status.email || 'unknown'} (${status.planType || 'unknown'} plan). Verifying API access…`,
        blocks: [],
        forkable: false,
      });

      // Validate API access after successful login
      await validateAndAdvance(services, state, threadId, status);
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

/**
 * After login, validate API access. If it works, advance to codex-projects.
 * If it fails, show the error and offer Claude Code fallback.
 */
async function validateAndAdvance(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  loginStatus: any,
) {
  const validation = await (services.cli as any).codex.validate();

  if (validation.success) {
    state.data.codexValidated = true;
    services.chat.sendBlockMessage({
      threadId,
      text: 'API access verified!',
      blocks: [],
      forkable: false,
    });
    startCodexProjectsStep(services, state, threadId);
    return;
  }

  // Validation failed — show clear error + fallback
  state.data.codexValidated = false;
  const email = loginStatus.email || 'your account';
  const plan = loginStatus.planType || 'unknown';
  const errorDetail = validation.error || 'Unknown error';

  const fallbackChoices: any[] = [
    { id: 'setup-cc', label: 'Set up Claude Code', description: 'Use Claude Code instead' },
    { id: 'skip', label: 'Skip for now', description: "I'll come back later" },
  ];

  const { messageId } = services.chat.sendChoiceBlock({
    threadId,
    text: `Authenticated as ${email} (${plan} plan), but Codex API access is not available for your account.\n\n${errorDetail}\n\nThis may be a temporary restriction from OpenAI, or your plan may not include Codex API access.`,
    prompt: 'What would you like to do?',
    choices: fallbackChoices,
    allowCustom: false,
    forkable: false,
    autoHide: true,
    asUser: true,
  });

  state.step = 'codex-fallback';
  state.pendingMessageId = messageId;
}
