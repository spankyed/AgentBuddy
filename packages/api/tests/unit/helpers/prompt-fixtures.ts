/**
 * Reusable prompt definitions for seeding tests.
 */
export const promptFixtures = [
  {
    label: 'Summarize Text',
    description: 'Generates a concise summary of the provided text',
    category: 'analysis',
    inputs: { text: { name: 'text', type: 'string' as const, required: true } },
    templateFn: '({ text }) => `Summarize the following text:\\n${text}`',
    outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
  },
  {
    label: 'Translate',
    description: 'Translates text to a target language',
    category: 'language',
    inputs: {
      text: { name: 'text', type: 'string' as const, required: true },
      language: { name: 'language', type: 'string' as const, required: true },
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
