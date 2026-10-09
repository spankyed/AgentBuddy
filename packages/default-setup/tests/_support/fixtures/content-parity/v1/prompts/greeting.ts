import type { PromptMeta } from '@abuddy/sdk/build';

export const meta: PromptMeta = {
  label: 'Greeting',
  description: 'Greet someone by name',
  category: 'general',
  inputs: {
    name: { name: 'name', type: 'string', description: 'Who to greet', required: true },
  },
};

export function template(params: Record<string, any>) {
  return `Say hello to ${params.name}.`;
}
