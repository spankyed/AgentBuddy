import type { ActionMeta, Services, Z } from '../types';
import type { EARS } from '@/core/types';
import { DEFAULT_NAME, TECH_LEVELS, type OnboardingState } from './onboarding/onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Onboarding Response',
  description: 'Processes an interactive block response and advances the onboarding step',
  category: 'onboarding',
  input: {
    messageId: { type: 'string', description: 'The message ID that was responded to', required: true },
    threadId: { type: 'string', description: 'The thread ID', required: true },
    response: { type: 'any', description: 'The block response data', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { threadId, response } = params;

  // Find the onboarding-state artifact for this thread
  const artifacts = services.database.qx()
    .relatedTo(threadId)
    .ofType(services.database.EARS.Entity.Artifact)
    .pick(['id', 'title', 'content', 'artifactType'] as const)
    .map((a: any) => ({ id: a.id, type: a.artifactType, title: a.title, content: a.content }));
  const stateArtifact = artifacts.find((a: any) => a.type === 'onboarding-state');

  if (!stateArtifact) {
    await services.logger.warn('No onboarding-state artifact found', { threadId });
    return { success: false, reason: 'no-state' };
  }

  const state: OnboardingState = stateArtifact.content;
  const responseValue = response?.value ?? response;

  switch (state.step) {
    case 'name': {
      const name = (typeof responseValue === 'string' && responseValue.trim()) || DEFAULT_NAME;
      state.data.name = name;

      // Save name to assistant settings
      services.repository.settingsCommands.updateSettings('assistant', null, ['name'], name);

      // Alert if default was used
      const usedDefault = name === DEFAULT_NAME;
      const confirmText = usedDefault
        ? `No name provided — I'll go by ${DEFAULT_NAME}! You can always change it later in settings.`
        : `Nice to meet you! I'm ${name}.`;

      services.chat.sendBlockMessage({ threadId, text: confirmText, blocks: [] });

      // Send tech-level choice block
      const { messageId } = services.chat.sendChoiceBlock({
        threadId,
        text: "How comfortable are you with code and technical topics?",
        prompt: 'Select your technical level',
        choices: TECH_LEVELS,
        displayText: 'Technical level:',
      });

      state.step = 'tech-level';
      state.pendingMessageId = messageId as string;
      break;
    }

    case 'tech-level': {
      const techLevel = typeof responseValue === 'string' ? responseValue : responseValue?.id ?? 'comfortable';
      state.data.techLevel = techLevel;

      // Toggle code plugin visibility for beginners
      if (techLevel === 'beginner') {
        services.settings.updatePluginSetting('_meta', ['visibility', 'code'], false);
      }

      const levelLabel = TECH_LEVELS.find(t => t.id === techLevel)?.label ?? techLevel;
      services.chat.sendBlockMessage({
        threadId,
        text: `Got it — ${levelLabel}. I'll tailor my responses accordingly.`,
        blocks: [],
      });

      // Send projects text input block
      const { messageId } = services.chat.sendTextInputBlock({
        threadId,
        text: 'Do you have any project directories you\'d like me to know about? Enter one path per line, or leave blank to skip.',
        prompt: 'Share your project paths',
        placeholder: '/Users/you/projects/my-app\n/Users/you/projects/another-app',
        multiline: true,
        displayText: 'Projects:',
      });

      state.step = 'projects';
      state.pendingMessageId = messageId as string;
      break;
    }

    case 'projects': {
      const raw = typeof responseValue === 'string' ? responseValue : '';
      const projects = raw
        .split('\n')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      state.data.projects = projects;

      if (projects.length > 0) {
        // Save projects to general settings
        const projectEntries = projects.map((dir: string, i: number) => ({
          name: dir.split('/').pop() || `Project ${i + 1}`,
          directories: [dir],
          color: '#3B82F6',
        }));
        services.repository.settingsCommands.updateSettings('general', 'projects', [], projectEntries);

        // Send finish choice — offer to work on one
        const choices = projectEntries.map((p: any) => ({
          id: p.directories[0],
          label: p.name,
          description: p.directories[0],
        }));

        const { messageId } = services.chat.sendChoiceBlock({
          threadId,
          text: `Great, I've saved ${projects.length} project(s). Want to start working on one of these?`,
          prompt: 'Pick a project to start with (or skip)',
          choices,
          allowCustom: false,
          displayText: 'Selected project:',
        });

        state.step = 'finish';
        state.pendingMessageId = messageId as string;
      } else {
        // No projects — finish directly
        await finishOnboarding(services, state, threadId);
      }
      break;
    }

    case 'finish': {
      // User selected a project (or skipped)
      await finishOnboarding(services, state, threadId);
      break;
    }

    default:
      return { success: false, reason: 'unknown-step' };
  }

  // Update the onboarding-state artifact
  services.database.tx(stateArtifact.id, true).update('content', state);

  await services.logger.info('Onboarding step completed', { step: state.step, threadId });
  return { success: true, step: state.step };
}

async function finishOnboarding(
  services: Services,
  state: OnboardingState,
  threadId: EARS.EntityId,
) {
  state.step = 'complete';

  // Mark onboarding as complete
  services.settings.updateInternalSetting(['hasOnboarded'], true);

  // Rename the current birth thread to "General"
  services.repository.threadCommands.update(threadId, {
    topic: 'General',
    instructions: 'General conversation thread.',
  });

  services.chat.sendBlockMessage({
    threadId,
    text: "All set! Let's get started!",
    blocks: [],
  });

  // Refresh the thread data on FE (reloads chat + recent threads sidebar)
  services.chat.openThreadChatAndRefreshRecent(threadId);
}
