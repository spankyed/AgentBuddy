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
  // Use testCli() — same code path as the Settings test button (clears cache, fresh resolve)
  const cliResult = await services.cli.testCli('claude-code');
  const cliFound = cliResult.success;

  let authenticated = false;
  let authErrorMsg = '';
  if (cliFound) {
    try {
      const auth = await services.cli.claudeCode.authStatus();
      authenticated = auth.authenticated === true || auth.loggedIn === true;
      if (!authenticated) {
        authErrorMsg = 'Claude Code reports it is not authenticated.';
      }
    } catch (err: any) {
      authErrorMsg = err?.message || 'Auth status check failed.';
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
    const detail = authErrorMsg ? ` (${authErrorMsg})` : '';
    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: `Claude Code CLI found, but authentication failed${detail}. Please run \`claude\` in your terminal to sign in, then come back and re-test.`,
      prompt: 'What would you like to do?',
      choices: [
        { id: 'retest', label: 'Re-test CLI', description: 'Try detecting Claude Code again' },
        { id: 'skip', label: 'Skip for now', description: "I'll set this up later" },
      ],
      allowCustom: false,
      forkable: false,
      autoHide: true,
      asUser: false,
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
      autoHide: true,
      asUser: false,
    });

    state.step = 'cli-test-ask';
    state.pendingMessageId = messageId;
  }
}
