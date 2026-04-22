import type { EntityId, Services } from '../../../types';
import type { OnboardingState } from '../onboarding-helpers';
import { startCcImportStep } from './handle-cc-import-step';

/**
 * Welcome step — user clicked "Let's go".
 * Tests CLI availability and either auto-advances to cc-import
 * or asks the user about their CLI setup.
 */
export async function handleWelcomeStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  await testCliAndAdvance(services, state, threadId);
}

export async function testCliAndAdvance(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  let cliFound = false;
  let authenticated = false;
  let versionError: string | undefined;
  let authError: string | undefined;

  try {
    await services.cli.claudeCode.version();
    cliFound = true;
  } catch (err: any) {
    versionError = err?.message || String(err);
    await services.logger.warn('Onboarding CLI version check failed', { error: versionError });
  }

  if (cliFound) {
    try {
      const auth = await services.cli.claudeCode.authStatus();
      authenticated = auth.authenticated === true;
      if (!authenticated) {
        authError = 'Not authenticated';
      }
    } catch (err: any) {
      authError = err?.message || String(err);
      await services.logger.warn('Onboarding CLI auth check failed', { error: authError });
    }
  }

  state.data.cliFound = cliFound;
  state.data.authenticated = authenticated;

  if (cliFound && authenticated) {
    services.chat.sendBlockMessage({
      threadId,
      text: 'Claude Code CLI detected and working!',
      blocks: [],
      forkable: false,
    });

    startCcImportStep(services, state, threadId);
  } else if (cliFound && !authenticated) {
    // CLI found but not authenticated — specific message
    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: "Claude Code CLI found, but it doesn't appear to be authenticated. Please run `claude` in your terminal to sign in, then come back and re-test.",
      prompt: 'What would you like to do?',
      choices: [
        { id: 'retest', label: 'Re-test CLI', description: 'Try detecting Claude Code again' },
        { id: 'skip', label: 'Skip for now', description: "I'll set this up later" },
      ],
      allowCustom: false,
      forkable: false,
    });

    state.step = 'cli-test-ask';
    state.pendingMessageId = messageId;
  } else {
    // CLI not found
    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: "I wasn't able to detect the Claude Code CLI. Do you already have Claude Code CLI installed with an active subscription?",
      prompt: 'Claude Code CLI status',
      choices: [
        { id: 'yes', label: 'Yes, I have it', description: 'I have Claude Code installed and subscribed' },
        { id: 'no', label: "No, I don't", description: "I haven't set up Claude Code yet" },
      ],
      allowCustom: false,
      forkable: false,
    });

    state.step = 'cli-test-ask';
    state.pendingMessageId = messageId;
  }
}
