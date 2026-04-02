/**
 * Example prompt template — reference for writing new prompts.
 *
 * Demonstrates: meta with typed inputs, output schema, and template function.
 * The template function is synchronous and returns a string.
 */
import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Summarize Text',
  description: 'Generates a concise summary of the provided text',
  category: 'analysis',
  inputs: {
    text: {
      name: 'text',
      type: 'string',
      required: true,
      description: 'The text to summarize',
    },
    maxSentences: {
      name: 'maxSentences',
      type: 'number',
      defaultValue: 3,
      description: 'Maximum sentences in summary',
    },
  },
  // Optional: describe the expected output shape for downstream consumers
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'The generated summary' },
    },
  },
};

/**
 * Template function — receives params and returns a prompt string.
 * Must be synchronous. No imports or side effects at runtime.
 */
export function template(params: Record<string, any>) {
  const maxSentences = params.maxSentences || 3;

  return `Summarize the following text in ${maxSentences} sentence(s) or fewer.

Text:
${params.text}`;
}
