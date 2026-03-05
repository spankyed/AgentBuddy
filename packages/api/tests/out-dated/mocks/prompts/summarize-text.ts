import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';
import { tidyFunction } from '@/core/helpers/tidy-function';

const nowMs = Date.now();

const templateFn = tidyFunction(`
  const { text, maxLength = 100 } = params;
  // prettier-ignore
  return \`
    Please summarize the following text in approximately \${maxLength} words:

    \${text}

    Provide a clear, concise summary focusing on the main points.
  \`;
`);

export const summarizeTextPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-1',
      entityType: EARS.Entity.Prompt,
      label: 'Summarize Text',
      description: 'Summarizes long text into key points',
      category: 'text-processing',
      inputs: {
        text: {
          name: 'text',
          type: 'string',
          description: 'The text to summarize',
          required: true,
          example: 'Long article or document text...'
        },
        maxLength: {
          name: 'maxLength',
          type: 'number',
          description: 'Maximum length of summary in words',
          required: false,
          defaultValue: 100
        }
      },
      templateFn,
      createdAt: nowMs - 86400000 * 7,
      updatedAt: nowMs - 86400000 * 2
    }
  ],
  
  role: [],
  
  relation: []
};