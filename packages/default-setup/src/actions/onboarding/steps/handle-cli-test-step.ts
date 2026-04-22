import type { EntityId, Services } from '../../../types';
import { finishOnboarding, type OnboardingState } from '../onboarding-helpers';
import { testCliAndAdvance } from './handle-welcome-step';

const DEBUGGING_MD = `## Troubleshooting Claude Code CLI

The app looks for the Claude Code CLI in these locations:

1. **Settings path** — Check Settings > General > CLI Paths > claude-code
2. **Local install** — \`~/.claude/local/claude\`
3. **Homebrew** — \`/opt/homebrew/bin/claude\`
4. **Standard Unix** — \`/usr/local/bin/claude\`
5. **NVM** — \`~/.nvm/versions/node/*/bin/claude\`
6. **System PATH** — Bare \`claude\` command

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

/**
 * CLI test ask step — user answered whether they have CC installed.
 * Shows debugging or setup guidance, with Re-test and Skip buttons.
 */
export async function handleCliTestStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  response: string,
) {
  if (response === 'retest') {
    // Re-test the CLI
    await testCliAndAdvance(services, state, threadId);
    return;
  }

  if (response === 'skip') {
    // Skip — finish onboarding without cc-import
    services.chat.sendBlockMessage({
      threadId,
      text: "No problem! Currently we only support Claude Code. You can come back later once you've installed it and test through Settings.",
      blocks: [],
      forkable: false,
    });
    finishOnboarding(services, state, threadId);
    return;
  }

  // Initial response: "yes" or "no"
  const markdownContent = response === 'yes' ? DEBUGGING_MD : SETUP_GUIDE_MD;
  const text = response === 'yes'
    ? "Let's debug why the CLI isn't being detected."
    : "Here's how to get set up with Claude Code.";

  const { messageId } = services.chat.sendBlockMessage({
    threadId,
    text,
    blocks: [
      {
        type: 'markdown',
        props: { content: markdownContent },
      },
      {
        type: 'choice',
        props: {
          prompt: 'What would you like to do?',
          choices: [
            { id: 'retest', label: 'Re-test CLI', description: 'Try detecting Claude Code again' },
            { id: 'skip', label: 'Skip for now', description: "I'll set this up later" },
          ],
        },
      },
    ],
    forkable: false,
    autoHide: true,
    asUser: true,
  });

  // Stay on the same step but update pendingMessageId
  state.step = 'cli-test-ask';
  state.pendingMessageId = messageId;
}
