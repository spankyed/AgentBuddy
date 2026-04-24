import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState, type OnboardingState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Projects Step',
  description: 'Handles project directory selection response and asks about thread import',
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
  const selected = Array.isArray(response) ? response : typeof response === 'string' ? [response] : [];

  if (selected.length > 0 && selected[0] !== '') {
    const projectEntries = selected.map((dir: string) => ({
      name: dir.split('/').filter(Boolean).pop() || 'Project',
      directories: [dir],
      color: '#3B82F6',
    }));

    services.repository.settingsCommands.updateSettings('general', 'projects', [], projectEntries);

    // Broadcast to frontend so the settings plugin picks up the new projects immediately
    services.emitter.sendToPlugin('settings', {
      type: 'SETTINGS_UPDATED',
      data: services.repository.settingsQueries.getSettings(),
    });

    services.chat.sendBlockMessage({
      threadId,
      text: `Added ${projectEntries.length} project${projectEntries.length === 1 ? '' : 's'} to your settings.`,
      blocks: [],
      forkable: false,
    });
  }

  // Ask if user wants to import threads
  const { messageId } = services.chat.sendChoiceBlock({
    threadId,
    text: 'Would you like to import your existing Claude Code threads? This may take a minute.',
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

/**
 * Start the cc-import step — discovers sessions and asks about project creation.
 * Called by the welcome step after CLI is confirmed working.
 * This is a helper, not an action (no meta export).
 */
export async function startCcImportStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  let sessions: any[] = [];

  try {
    sessions = await services.cli.claudeCode.listAllSessions({ limit: 50 });
  } catch {
    // If listing fails, skip to finish
  }

  if (!sessions.length) {
    services.chat.sendBlockMessage({
      threadId,
      text: 'No existing Claude Code sessions found. No worries — you can import sessions later with `/cc-import`.',
      blocks: [],
      forkable: false,
    });
    finishOnboarding(services, state, threadId);
    return;
  }

  // Extract unique project directories from sessions
  const cwdSet = new Set<string>();
  for (const s of sessions) {
    if (s.cwd) cwdSet.add(s.cwd);
  }
  const projectDirs = Array.from(cwdSet);

  if (projectDirs.length > 0) {
    const choices = projectDirs.map((dir: string) => {
      const name = dir.split('/').filter(Boolean).pop() || dir;
      return { id: dir, label: name, description: dir };
    });

    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: `I found ${projectDirs.length} project director${projectDirs.length === 1 ? 'y' : 'ies'} from your Claude Code sessions. Would you like to add them as projects?`,
      prompt: 'Select projects to add',
      choices,
      multiSelect: true,
      allowCustom: false,
      compact: true,
      forkable: false,
      autoHide: true,
      asUser: true,
    });

    state.step = 'projects';
    state.pendingMessageId = messageId;
  } else {
    finishOnboarding(services, state, threadId);
  }
}
