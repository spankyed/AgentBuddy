import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';
import { tidyFunction } from '@/core/utils/tidy-function';

const nowMs = Date.now();

const templateFn = tidyFunction(`
  const { question, context = '', tone = 'professional' } = params;

  if (context) {
    // prettier-ignore
    return \`
      Context:
      \${context}

      Please answer the following question in a \${tone} tone:

      \${question}

      Provide a clear and helpful response.
    \`;
  }

  // prettier-ignore
  return \`
    Please answer the following question in a \${tone} tone:

    \${question}

    Provide a clear and helpful response.
  \`;
`);

export const qaAssistantPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-3',
      entityType: EARS.Entity.Prompt,
      label: 'Q&A Assistant',
      description: 'Answers questions based on context',
      category: 'assistant',
      inputs: {
        question: {
          name: 'question',
          type: 'string',
          description: 'The user\'s question',
          required: true
        },
        context: {
          name: 'context',
          type: 'string',
          description: 'Additional context or knowledge base',
          required: false,
          defaultValue: ''
        },
        tone: {
          name: 'tone',
          type: 'string',
          description: 'Response tone',
          required: false,
          defaultValue: 'professional'
        }
      },
      templateFn,
      createdAt: nowMs - 86400000 * 3,
      updatedAt: nowMs - 86400000 * 3
    }
  ],
  
  role: [],
  
  relation: []
};