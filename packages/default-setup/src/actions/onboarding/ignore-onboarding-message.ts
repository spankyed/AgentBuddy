import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Ignore Onboarding Message',
  description: 'Sends a system note when the user tries to send free text during onboarding',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', description: 'The thread ID', required: true },
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

  const { threadId } = params;

  services.chat.sendBlockMessage({
    threadId,
    text: "I'm still setting up! Please complete the onboarding steps above.",
    blocks: [],
  });

  return { success: true };
}
