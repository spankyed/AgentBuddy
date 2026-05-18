import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState, type OnboardingState } from '../onboarding-helpers';
import { startCcImportStep } from './handle-projects-step';

export const meta: ActionMeta = {
  label: 'Handle Welcome Step',
  description: 'Detects Claude Code + Codex CLIs and advances onboarding',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const threadId = params.threadId as EntityId;
  const state = getOnboardingState(services, threadId);
  if (!state) return { success: false, reason: 'no-state' };

  flashState(services, threadId);
  await detectAllClis(services, state, threadId);
  persistOnboardingState(services, threadId, state);

  return { success: true, step: state.step };
}

/**
 * Detect both Claude Code and Codex CLIs in parallel, show a unified
 * status message, then advance based on what was found.
 */
async function detectAllClis(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  // Test both CLIs in parallel
  const [ccResult, codexResult] = await Promise.all([
    services.cli.testCli('claude-code'),
    services.cli.testCli('codex'),
  ]);

  const ccFound = ccResult.success;
  const codexFound = codexResult.success;

  // Check CC auth if found
  let ccAuthenticated = false;
  if (ccFound) {
    try {
      const auth = await services.cli.claudeCode.authStatus();
      ccAuthenticated = (auth as any).authenticated === true || (auth as any).loggedIn === true;
    } catch { /* auth check failed */ }
  }

  state.data.cliFound = ccFound;
  state.data.authenticated = ccAuthenticated;
  state.data.codexFound = codexFound;

  // Build unified status message
  const lines: string[] = [];

  if (ccFound && ccAuthenticated) {
    lines.push('**Claude Code** — detected and authenticated');
  } else if (ccFound) {
    lines.push('**Claude Code** — detected but not authenticated. Run `claude` in your terminal to sign in.');
  } else {
    lines.push('**Claude Code** — not found. Install with `npm i -g @anthropic-ai/claude-code`');
  }

  if (codexFound) {
    lines.push('**Codex** — detected');
  } else {
    lines.push('**Codex** — not found. Install with `npm i -g @openai/codex`');
  }

  services.chat.sendBlockMessage({
    threadId,
    text: lines.join('\n'),
    blocks: [],
    forkable: false,
  });

  // Advance based on what we found
  if (ccFound && ccAuthenticated) {
    // CC is ready — proceed to session import flow
    await startCcImportStep(services, state, threadId);
  } else {
    // Nothing to import — go straight to hermes/finish
    finishOnboarding(services, state, threadId);
  }
}
