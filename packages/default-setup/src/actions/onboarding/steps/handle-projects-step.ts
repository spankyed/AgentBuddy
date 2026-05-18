import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Projects Step',
  description: 'Saves selected project directory, then offers CC session import if available',
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
  const response = params.response;
  const state = getOnboardingState(services, threadId);
  if (!state) return { success: false, reason: 'no-state' };

  flashState(services, threadId);

  // ── Save project directory if user picked one ─────────────────────
  const dir = typeof response === 'string' ? response.trim() : '';
  if (dir && dir !== 'skip' && dir !== '') {
    const name = dir.split('/').filter(Boolean).pop() || 'Project';
    services.repository.settingsCommands.updateSettings('general', 'projects', [], [{
      name,
      directories: [dir],
      color: '#3B82F6',
    }]);

    services.settings.updatePluginSetting('code', ['defaultBaseDirectory'], dir);

    services.emitter.sendToPlugin('settings', {
      type: 'SETTINGS_UPDATED',
      data: services.repository.settingsQueries.getSettings(),
    });

    services.chat.sendBlockMessage({
      threadId,
      text: `Project "${name}" added.`,
      blocks: [],
      forkable: false,
    });
  }

  // ── If CC is authenticated, offer session import ──────────────────
  if (state.data.cliFound && state.data.authenticated) {
    let sessions: any[] = [];
    try {
      sessions = await services.cli.claudeCode.listAllSessions({ limit: 50 });
    } catch { /* listing failed */ }

    if (sessions.length > 0) {
      const { messageId } = services.chat.sendChoiceBlock({
        threadId,
        text: `Found ${sessions.length} Claude Code session${sessions.length === 1 ? '' : 's'}. Would you like to import them as threads?`,
        prompt: 'Import threads',
        choices: [
          { id: 'yes', label: 'Yes, import threads', description: 'Import recent sessions as threads' },
          { id: 'no', label: 'No, skip', description: "I'll start fresh" },
        ],
        allowCustom: false,
        forkable: false,
        autoHide: true,
        asUser: true,
      });

      state.step = 'import-threads';
      state.pendingMessageId = messageId;
      persistOnboardingState(services, threadId, state);
      return { success: true, step: state.step };
    }
  }

  // ── No sessions to import — finish ────────────────────────────────
  finishOnboarding(services, state, threadId);
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
