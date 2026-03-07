import type { EntityId, Services } from '../../types';

export const DEFAULT_NAME = 'Kathy';

export const TECH_LEVELS = [
  { id: 'beginner', label: 'Beginner', description: 'New to programming' },
  { id: 'comfortable', label: 'Comfortable reading code', description: 'Can read and understand code' },
  { id: 'intermediate', label: 'Intermediate', description: 'Write code regularly' },
  { id: 'advanced', label: 'Advanced', description: 'Professional developer' },
];

export interface OnboardingState {
  step: 'name' | 'tech-level' | 'projects' | 'finish' | 'complete';
  threadId: EntityId;
  pendingMessageId: EntityId;
  data: { name?: string; techLevel?: string; projects?: string[] };
}

export function getOnboardingState(services: Services, threadId: EntityId) {
  const artifacts = services.database.qx()
    .relatedTo(threadId)
    .ofType(services.database.EARS.Entity.Artifact)
    .pick(['id', 'title', 'content', 'artifactType'] as const);

  return artifacts.find((a) => a.artifactType === 'json') ?? null;
}

export function finishOnboarding(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  state.step = 'complete';

  services.settings.updateInternalSetting(['hasOnboarded'], true);

  services.repository.threadCommands.update(threadId, {
    topic: 'General',
    instructions: 'General conversation thread.',
  });

  services.chat.sendBlockMessage({
    threadId,
    text: "All set! Let's get started!",
    blocks: [],
  });

  services.chat.openThreadChatAndRefreshRecent(threadId);
}
