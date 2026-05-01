import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, flashState, type OnboardingState } from '../onboarding-helpers';
import { testCliAndAdvance } from './handle-welcome-step';

export const meta: ActionMeta = {
  label: 'Handle Provider Select Step',
  description: 'Routes onboarding to Claude Code or Codex path based on user choice',
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

  if (response === 'claude-code') {
    state.data.provider = 'claude-code';
    await testCliAndAdvance(services, state, threadId);
    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  if (response === 'codex' || response === 'both') {
    state.data.provider = response as 'codex' | 'both';

    // Check if already authenticated via ~/.codex/auth.json
    const authStatus = (services.cli as any).codex.getAuthStatus();

    if (authStatus.authenticated) {
      services.chat.sendBlockMessage({
        threadId,
        text: `Codex authenticated as ${authStatus.email || 'unknown'} (${authStatus.planType || 'unknown'} plan). Verifying API access…`,
        blocks: [],
        forkable: false,
      });

      // Validate API access before advancing
      const validation = await (services.cli as any).codex.validate();
      if (validation.success) {
        state.data.codexValidated = true;
        services.chat.sendBlockMessage({
          threadId, text: 'API access verified!', blocks: [], forkable: false,
        });
        startCodexProjectsStep(services, state, threadId);
      } else {
        state.data.codexValidated = false;
        const { messageId } = services.chat.sendChoiceBlock({
          threadId,
          text: `Authenticated, but Codex API access is not available for your account.\n\n${validation.error}\n\nThis may be a temporary restriction from OpenAI.`,
          prompt: 'What would you like to do?',
          choices: [
            { id: 'setup-cc', label: 'Set up Claude Code', description: 'Use Claude Code instead' },
            { id: 'skip', label: 'Skip for now', description: "I'll come back later" },
          ],
          allowCustom: false, forkable: false, autoHide: true, asUser: true,
        });
        state.step = 'codex-fallback';
        state.pendingMessageId = messageId;
      }
    } else {
      const { messageId } = services.chat.sendChoiceBlock({
        threadId,
        text: "Let's connect your ChatGPT account. Click below to open the login page in your browser.",
        prompt: 'Codex Authentication',
        choices: [
          { id: 'login', label: 'Log in with ChatGPT', description: 'Opens browser for OAuth login' },
          { id: 'skip', label: 'Skip for now', description: "I'll set this up later" },
        ],
        allowCustom: false,
        forkable: false,
        autoHide: true,
        asUser: true,
      });
      state.step = 'codex-login';
      state.pendingMessageId = messageId;
    }

    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  return { success: false, reason: 'unknown-response' };
}

/**
 * Show project directory picker for Codex users.
 * Called after successful Codex authentication.
 */
export function startCodexProjectsStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  const { messageId } = services.chat.sendBlockMessage({
    threadId,
    text: 'Select a project directory to get started, or skip to set one up later.',
    blocks: [
      { type: 'prompt', props: { content: 'Choose a project directory' } },
      { type: 'file-picker', props: { fileType: 'directory' } },
    ],
    forkable: false,
    autoHide: true,
    asUser: true,
    asideContext: 'Project',
  } as any);

  state.step = 'codex-projects';
  state.pendingMessageId = messageId;
}
