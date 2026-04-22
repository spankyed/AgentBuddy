import type { ActionMeta, Services, Z } from '../../types';
import { persistOnboardingState, type OnboardingState } from './onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Init Onboarding',
  description: 'Creates the birth thread and sends the welcome artifact for onboarding',
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
    topic: 'Getting Started',
    instructions: 'Onboarding flow — getting set up.',
    tags: [],
    role: ASSISTANT_BIRTH_ROLE,
    forcedMode: 'birth',
    pinned: true,
  });

  // Send welcome message with "Let's go" button
  const { messageId } = services.chat.sendChoiceBlock({
    threadId,
    text: "Welcome! Ready to get started?",
    prompt: '',
    choices: [{ id: 'continue', label: "Let's go", description: '' }],
    allowCustom: false,
    forkable: false,
    autoHide: true,
    asUser: true,
  });

  services.threads.updateChatState(threadId, 'paused');

  // Persist onboarding state to thread context
  const onboardingState: OnboardingState = {
    step: 'welcome',
    threadId,
    pendingMessageId: messageId,
    data: {},
  };
  persistOnboardingState(services, threadId, onboardingState);

  // Open the thread first so the frontend is listening for artifact events
  services.chat.openThreadChatAndRefreshRecent(threadId);

  // Create note artifact pointing to the welcome note (after thread is open)
  const notes = services.repository.noteQueries.allDTOs();
  const welcomeNote = notes.find((n: any) => n.title === 'welcome');

  if (welcomeNote) {
    services.artifact.createAndNotify({
      artifactType: 'note' as any,
      title: 'Welcome',
      content: welcomeNote.id,
      threadId,
    });
  }

  await services.logger.info('Onboarding initialized', { threadId });

  return { threadId, success: true, created: true };
}
