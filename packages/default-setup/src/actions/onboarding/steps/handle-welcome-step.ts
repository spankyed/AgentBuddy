import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, flashState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Welcome Step',
  description: 'Detects Claude Code + Codex CLIs, shows status, then presents project directory picker',
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

  // ── Detect both CLIs in parallel ──────────────────────────────────
  const [ccResult, codexResult] = await Promise.all([
    services.cli.testCli('claude-code'),
    services.cli.testCli('codex'),
  ]);

  const ccFound = ccResult.success;
  const codexFound = codexResult.success;

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

  // ── Warm status message ───────────────────────────────────────────
  const lines: string[] = [];

  if (ccFound && ccAuthenticated) {
    lines.push('**Claude Code** — ready to go');
  } else if (ccFound) {
    lines.push('**Claude Code** — installed but needs authentication. Run `claude` in your terminal to sign in.');
  } else {
    lines.push('**Claude Code** — not installed. You can add it later with `npm i -g @anthropic-ai/claude-code`');
  }

  if (codexFound) {
    lines.push('**Codex** — ready to go');
  } else {
    lines.push('**Codex** — not installed. You can add it later with `npm i -g @openai/codex`');
  }

  services.chat.sendBlockMessage({
    threadId,
    text: lines.join('\n'),
    blocks: [],
    forkable: false,
  });

  // ── Always show project directory picker ──────────────────────────
  const projects = (services.repository.settingsQueries.getGeneralSettings('projects') as any[]) || [];
  const { messageId } = services.chat.sendBlockMessage({
    threadId,
    text: 'Pick a project directory to get started.',
    blocks: [
      { type: 'prompt', props: { content: 'Select a project directory' } },
      ...(projects.length > 0 ? [{ type: 'project-select', props: { projects } }] : []),
      { type: 'file-picker', props: { fileType: 'directory' } },
    ],
    forkable: false,
    autoHide: true,
    asUser: true,
    asideContext: 'Project',
  } as any);

  state.step = 'projects';
  state.pendingMessageId = messageId;
  persistOnboardingState(services, threadId, state);

  return { success: true, step: state.step };
}
