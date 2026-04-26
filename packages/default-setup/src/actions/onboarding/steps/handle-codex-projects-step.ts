import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Codex Projects Step',
  description: 'Handles project directory selection for Codex onboarding',
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

  // Response is a directory path from the file-picker, or 'skip'
  const dir = typeof response === 'string' ? response.trim() : '';

  if (dir && dir !== 'skip') {
    // Save as a project
    const name = dir.split('/').filter(Boolean).pop() || 'Project';
    const projectEntries = [{
      name,
      directories: [dir],
      color: '#10B981', // Codex green
    }];

    services.repository.settingsCommands.updateSettings('general', 'projects', [], projectEntries);

    // Also set as default working directory
    services.settings.updatePluginSetting('code', ['defaultBaseDirectory'], dir);

    services.emitter.sendToPlugin('settings', {
      type: 'SETTINGS_UPDATED',
      data: services.repository.settingsQueries.getSettings(),
    });

    services.chat.sendBlockMessage({
      threadId,
      text: `Project "${name}" added. You're all set!`,
      blocks: [],
      forkable: false,
    });
  }

  finishOnboarding(services, state, threadId);
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
