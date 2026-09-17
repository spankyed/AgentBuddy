import type { PromptInput } from '@abuddy/sdk/repositories';

/**
 * Reusable prompt definitions for seeding tests.
 */
export const promptFixtures: PromptInput[] = [
  {
    label: 'Summarize Text',
    description: 'Generates a concise summary of the provided text',
    category: 'analysis',
    inputs: { text: { name: 'text', type: 'string', required: true } },
    templateFn: '({ text }) => `Summarize the following text:\\n${text}`',
    outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
  },
  {
    label: 'Translate',
    description: 'Translates text to a target language',
    category: 'language',
    inputs: {
      text: { name: 'text', type: 'string', required: true },
      language: { name: 'language', type: 'string', required: true },
    },
    templateFn: '({ text, language }) => `Translate to ${language}:\\n${text}`',
  },
  {
    label: 'Generate Code',
    category: 'utility',
    inputs: {},
    templateFn: '({ description }) => `Write code for: ${description}`',
  },
];
