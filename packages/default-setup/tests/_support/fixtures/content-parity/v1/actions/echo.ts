import type { ActionMeta } from '@abuddy/sdk/build';

export const meta: ActionMeta = {
  label: 'Echo',
  description: 'Return the input text',
  category: 'utility',
  input: {
    text: { type: 'string', description: 'Text to return', required: true },
  },
};

export async function action(params: Record<string, any>) {
  return { text: params.text };
}
