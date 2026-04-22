import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashSuccess } from '../onboarding-helpers';
import { testCliAndAdvance } from './handle-welcome-step';

export const meta: ActionMeta = {
  label: 'Handle CLI Test Step',
  description: 'Handles CLI test ask response — shows debug/setup guidance or re-tests',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: true },
  },
};

const DEBUGGING_MD = `## Troubleshooting Claude Code CLI

The app looks for the Claude Code CLI in these locations:

1. **Settings path** — Check Settings > General > CLI Paths > claude-code
2. **Local install** — \`~/.claude/local/claude\`
3. **User local** — \`~/.local/bin/claude\`
4. **Homebrew** — \`/opt/homebrew/bin/claude\`
5. **Standard Unix** — \`/usr/local/bin/claude\`
6. **NVM** — \`~/.nvm/versions/node/*/bin/claude\`
7. **System PATH** — Bare \`claude\` command

### Steps to fix

- Make sure you can run \`claude --version\` in your terminal
- If installed but not detected, set the full path in Settings > General > CLI Paths
- Run \`claude auth login\` to ensure you're authenticated`;

const SETUP_GUIDE_MD = `## Getting Started with Claude Code

Claude Code is an AI coding assistant that runs in your terminal.

### Installation

1. Install via npm: \`npm install -g @anthropic-ai/claude-code\`
2. Run \`claude\` to start the authentication flow
3. Follow the prompts to sign in to your Anthropic account

### Requirements

- An active Anthropic subscription (Pro or Team plan)
- Node.js 18+ installed

Once installed, come back here and click **Re-test CLI** to continue setup.`;

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const threadId = params.threadId as EntityId;
  const response = typeof params.response === 'string' ? params.response : '';
  const state = getOnboardingState(services, threadId);
  if (!state) return { success: false, reason: 'no-state' };

  if (response === 'retest') {
    flashSuccess(services, threadId, 'paused');
    await testCliAndAdvance(services, state, threadId);
    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  if (response === 'skip') {
    flashSuccess(services, threadId, 'idle');
    services.chat.sendBlockMessage({
      threadId,
      text: "No problem! Currently we only support Claude Code. You can come back later once you've installed it and test through Settings.",
      blocks: [],
      forkable: false,
    });
    finishOnboarding(services, state, threadId, { skipCompletionMessage: true });
    persistOnboardingState(services, threadId, state);
    return { success: true, step: state.step };
  }

  flashSuccess(services, threadId, 'paused');
  // Initial response: "yes" or "no" — create a markdown artifact for guidance
  const markdownContent = response === 'yes' ? DEBUGGING_MD : SETUP_GUIDE_MD;
  const artifactTitle = response === 'yes' ? 'Troubleshooting CLI' : 'Getting Started with Claude Code';

  services.artifact.createAndNotify({
    artifactType: 'markdown',
    title: artifactTitle,
    content: markdownContent,
    threadId,
  });

  const text = response === 'yes'
    ? "Check the troubleshooting guide in the artifact panel. When ready:"
    : "Check the setup guide in the artifact panel. When ready:";

  const { messageId } = services.chat.sendChoiceBlock({
    threadId,
    text,
    prompt: 'What would you like to do?',
    choices: [
      { id: 'retest', label: 'Re-test CLI', description: 'Try detecting Claude Code again' },
      { id: 'skip', label: 'Skip for now', description: "I'll set this up later" },
    ],
    allowCustom: false,
    forkable: false,
    autoHide: true,
    asUser: true,
  });

  state.step = 'cli-test-ask';
  state.pendingMessageId = messageId;
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
