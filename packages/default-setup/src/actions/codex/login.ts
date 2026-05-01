import type { ActionMeta, Services } from '../../types';

export const meta: ActionMeta = {
  label: 'CX: Login',
  description: 'Trigger the Codex ChatGPT OAuth login flow.',
  category: 'codex',
  input: {},
};

export async function action(_params: Record<string, any>, services: Services) {
  try {
    const status = await (services.cli as any).codex.login();
    return { success: true, ...status };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Login failed' };
  }
}
