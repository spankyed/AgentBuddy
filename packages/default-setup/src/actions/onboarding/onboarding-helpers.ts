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

export function getTodoArtifact(services: Services, threadId: EntityId) {
  const artifacts = services.database.qx()
    .relatedTo(threadId)
    .ofType(services.database.EARS.Entity.Artifact)
    .pick(['id', 'title', 'content', 'artifactType'] as const);
  return artifacts.find((a) => a.artifactType === 'todo') ?? null;
}

const STEP_TO_TASK_ID: Record<string, string> = {
  'name': '1',
  'tech-level': '2',
  'projects': '3',
};

export function markTaskCompleted(services: Services, threadId: EntityId, step: string) {
  const taskId = STEP_TO_TASK_ID[step];
  if (!taskId) return;

  const todoArtifact = getTodoArtifact(services, threadId);
  if (!todoArtifact) return;

  const content = todoArtifact.content as { tasks: any[] };
  const tasks = content.tasks.map((t: any) =>
    t.id === taskId ? { ...t, completed: true } : t
  );
  services.database.tx(todoArtifact.id, true).update('content', { ...content, tasks });

  services.emitter.sendToPlugin('threads', {
    type: 'UPDATE_TODO_TASK',
    artifactId: todoArtifact.id,
    taskId,
    completed: true,
  });
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
    forcedMode: null,
  });

  services.chat.sendBlockMessage({
    threadId,
    text: "All set! Let's get started!",
    blocks: [],
    forkable: false,
  });

  services.chat.openThreadChatAndRefreshRecent(threadId);

  services.emitter.sendToPlugin('threads', {
    type: 'SET_MODE',
    mode: 'manager',
  });
}
