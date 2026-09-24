import type { ActionMeta } from '@abuddy/sdk/build';

export const meta: ActionMeta = {
  label: 'Set Instructions',
  description: 'Create a thread from instructions, titled by their first line',
  category: 'commands',
  input: {
    text: { type: 'string', description: 'Instructions text', required: true },
  },
};

export async function action(params: Record<string, any>) {
  return { success: true, topic: String(params.text).split('\n')[0] };
}
