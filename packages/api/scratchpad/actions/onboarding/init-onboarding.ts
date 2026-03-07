import type { ActionMeta, Services, Z } from '../../types';
import { DEFAULT_NAME, type OnboardingState } from './onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Init Onboarding',
  description: 'Creates the birth thread and sends the first onboarding block message',
  category: 'onboarding',
  input: {},
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const ASSISTANT_BIRTH_ROLE = services.database.EARS.RoleKind.Custom('assistant_birth');

  // Check if birth thread already exists
  const existingBirthThreadId = services.database.qx().withRole(ASSISTANT_BIRTH_ROLE).first();

  if (existingBirthThreadId) {
    await services.logger.info('Birth thread already exists, skipping onboarding init', {
      threadId: existingBirthThreadId,
    });
    return { threadId: existingBirthThreadId, success: true, created: false };
  }

  // Set birthdate if not already set
  const assistantSettings = services.repository.settingsQueries.getAssistantSettings();
  if (!assistantSettings.birthdate) {
    const birthdate = new Date().toISOString();
    services.repository.settingsCommands.updateSettings('assistant', null, ['birthdate'], birthdate);
  }

  // Create the birth thread
  const { id: threadId } = services.chat.createThreadAndNotify({
    topic: 'Assistant Birth',
    instructions: 'Onboarding flow — getting set up.',
    tags: [],
    role: ASSISTANT_BIRTH_ROLE,
    forcedMode: 'birth',
  });

  // Create todo artifact
  services.artifact.createAndNotify({
    artifactType: 'todo',
    title: 'Getting Started Tasks',
    content: {
      tasks: [
        { id: '1', description: 'Give your assistant a name', completed: false },
        { id: '2', description: 'Share your technical skill level', completed: false },
        { id: '3', description: 'Share projects you\'re working on', completed: false },
      ],
      status: 'pending',
    },
    threadId,
  });

  // Send welcome text
  services.chat.sendBlockMessage({
    threadId,
    text: "I'm alive! Let's get you set up.",
    blocks: [],
  });

  // Send name input block
  const { messageId } = services.chat.sendTextInputBlock({
    threadId,
    text: 'First things first — what would you like to call me?',
    prompt: 'Give me a name',
    placeholder: `e.g. ${DEFAULT_NAME}, Alex, Sam...`,
    displayText: 'Name:',
  });

  // Create onboarding-state artifact to track progress
  const onboardingState: OnboardingState = {
    step: 'name',
    threadId: threadId as string,
    pendingMessageId: messageId as string,
    data: {},
  };

  services.artifact.createAndNotify({
    artifactType: 'onboarding-state',
    title: 'Onboarding State',
    content: onboardingState,
    threadId,
  });

  // Open the thread in chat
  services.chat.openThreadChatAndRefreshRecent(threadId);

  await services.logger.info('Onboarding initialized', { threadId });

  return { threadId, success: true, created: true };
}
