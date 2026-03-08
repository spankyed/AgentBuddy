import type { EntityId, Services } from '../../../types';
import { finishOnboarding, type OnboardingState } from '../onboarding-helpers';

export function handleProjectsStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  responseValue: any,
) {
  const raw = typeof responseValue === 'string' ? responseValue : '';
  const projects = raw
    .split('\n')
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0);

  state.data.projects = projects;

  if (projects.length > 0) {
    const projectEntries = projects.map((dir: string, i: number) => ({
      name: dir.split('/').pop() || `Project ${i + 1}`,
      directories: [dir],
      color: '#3B82F6',
    }));
    services.repository.settingsCommands.updateSettings('general', 'projects', [], projectEntries);

    const choices = projectEntries.map((p) => ({
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
      forkable: false,
    });

    state.step = 'finish';
    state.pendingMessageId = messageId;
  } else {
    finishOnboarding(services, state, threadId);
  }
}
