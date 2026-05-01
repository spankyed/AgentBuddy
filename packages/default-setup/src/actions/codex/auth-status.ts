import type { ActionMeta, Services } from '../../types';

export const meta: ActionMeta = {
  label: 'CX: Auth Status',
  description: 'Check Codex (OpenAI) authentication status.',
  category: 'codex',
  input: {},
};

export async function action(_params: Record<string, any>, services: Services) {
  const status = (services.cli as any).codex.getAuthStatus();
  return { success: true, ...status };
}
