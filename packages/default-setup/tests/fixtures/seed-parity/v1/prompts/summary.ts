import type { PromptMeta } from '@abuddy/sdk/build';

export const meta: PromptMeta = {
  label: 'Summary',
  description: 'Summarize a text',
  category: 'general',
  inputs: {
    text: { name: 'text', type: 'string', description: 'Text to summarize', required: true },
  },
};

export function template(params: Record<string, any>) {
  return `Summarize the following in one paragraph:\n\n${params.text}`;
}
