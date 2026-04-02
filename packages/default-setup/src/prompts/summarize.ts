import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Summarize Text',
  description: 'Generates a concise summary of the provided text',
  category: 'analysis',
  inputs: {
    text: { name: 'text', type: 'string', required: true, description: 'The text to summarize' },
    maxSentences: { name: 'maxSentences', type: 'number', defaultValue: 3, description: 'Maximum sentences in summary' },
  },
};

export function template(params: Record<string, any>) {
  const maxSentences = params.maxSentences || 3;

  return `Summarize the following text in ${maxSentences} sentence(s) or fewer.

Text:
${params.text}`;
}
