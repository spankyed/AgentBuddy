import type { PromptMeta } from '@apackdev/sdk/build';

export const meta: PromptMeta = {
  label: 'Greeting',
  description: 'Greet someone by name, warmly',
  category: 'general',
  inputs: {
    name: { name: 'name', type: 'string', description: 'Who to greet', required: true },
  },
};

export function template(params: Record<string, any>) {
  return `Warmly say hello to ${params.name}.`;
}
