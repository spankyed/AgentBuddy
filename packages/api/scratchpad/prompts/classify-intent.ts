import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Classify Intent',
  description: 'Classifies a user message into one of the given categories',
  category: 'analysis',
  inputs: {
    message: { name: 'message', type: 'string', required: true, description: 'The user message to classify' },
    categories: { name: 'categories', type: 'array', required: true, example: ['question', 'request', 'feedback'] },
  },
  outputSchema: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'The classified intent category' },
      confidence: { type: 'number', description: 'Confidence score 0-1' },
    },
  },
};

export function template(params: Record<string, any>) {
  const categories = (params.categories || []).join(', ');

  return `Classify the following user message into exactly one of these categories: ${categories}

User message: "${params.message}"

Respond with a JSON object containing "intent" (the matching category) and "confidence" (0-1).`;
}
