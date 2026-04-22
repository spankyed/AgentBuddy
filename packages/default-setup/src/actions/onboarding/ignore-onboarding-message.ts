import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Ignore Onboarding Message',
  description: 'Marks a user message as cancelled when sent during onboarding',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', description: 'The thread ID', required: true },
    messageId: { type: 'string', description: 'The message ID to cancel', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  // If onboarding is already complete, do nothing
  const internal = services.settings.getInternalSettings();
  if (internal.hasOnboarded) {
    return { success: true, skipped: true };
  }

  const { messageId } = params;

  if (messageId) {
    services.chat.updateMessageState(messageId, { status: 'cancelled' });
  }

  return { success: true };
}
