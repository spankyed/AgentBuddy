import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

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
      templateFn: `(params) => {
  const { question, context = '', tone = 'professional' } = params;
  let prompt = \`Please answer the following question in a \${tone} tone:\\n\\n\${question}\`;
  
  if (context) {
    prompt = \`Context:\\n\${context}\\n\\n\${prompt}\`;
  }
  
  return prompt;
}`,
      createdAt: nowMs - 86400000 * 3,
      updatedAt: nowMs - 86400000 * 3
    }
  ],
  
  role: [],
  
  relation: []
};