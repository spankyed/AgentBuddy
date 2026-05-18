import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, showChooseModeOrFinish, flashState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Projects Step',
  description: 'Saves selected project directories and offers per-provider import',
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

  // ── Save selected directories ─────────────────────────────────────
  const selected = Array.isArray(response) ? response : typeof response === 'string' ? [response] : [];
  const dirs = selected.filter((d: string) => d && d !== 'skip' && d !== '');

  if (dirs.length > 0) {
    const projectEntries = dirs.map((dir: string) => ({
      name: dir.split('/').filter(Boolean).pop() || 'Project',
      directories: [dir],
      color: '#3B82F6',
    }));

    services.repository.settingsCommands.updateSettings('general', 'projects', [], projectEntries);

    // Set first directory as default CWD
    services.settings.updatePluginSetting('code', ['defaultBaseDirectory'], dirs[0]);

    services.emitter.sendToPlugin('settings', {
      type: 'SETTINGS_UPDATED',
      data: services.repository.settingsQueries.getSettings(),
    });

    services.chat.sendBlockMessage({
      threadId,
      text: `Added ${projectEntries.length} project${projectEntries.length === 1 ? '' : 's'}.`,
      blocks: [],
      forkable: false,
    });
  }

  // ── Show per-provider import prompt ───────────────────────────────
  const ccCount = state.data.ccSessionCount || 0;
  const codexCount = state.data.codexSessionCount || 0;

  if (ccCount > 0 || codexCount > 0) {
    const choices: any[] = [];
    if (ccCount > 0) choices.push({ id: 'cc', label: `Claude Code threads (${ccCount} sessions)` });
    if (codexCount > 0) choices.push({ id: 'codex', label: `Codex threads (${codexCount} sessions)` });

    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: 'Which sessions would you like to import as threads?',
      prompt: 'Import threads',
      choices,
      multiSelect: true,
      skipOption: { id: 'skip', label: 'Skip' },
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

  // ── No sessions — skip to mode chooser or finish ──────────────────
  showChooseModeOrFinish(services, state, threadId);
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
