import { EARS } from '@/shared/ears/types';
import type { PromptEntity } from '../types';

export const mockPrompts: PromptEntity[] = [
  {
    id: 'prompt-1' as EARS.EntityId,
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
    templateFn: `(params) => {
  const { text, maxLength = 100 } = params;
  return \`Please summarize the following text in approximately \${maxLength} words:

\${text}

Provide a clear, concise summary focusing on the main points.\`;
}`,
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 2
  },
  {
    id: 'prompt-2' as EARS.EntityId,
    entityType: EARS.Entity.Prompt,
    label: 'Code Review',
    description: 'Reviews code for quality and suggestions',
    category: 'development',
    inputs: {
      code: {
        name: 'code',
        type: 'string',
        description: 'The code to review',
        required: true
      },
      language: {
        name: 'language',
        type: 'string',
        description: 'Programming language',
        required: true,
        example: 'javascript'
      },
      focusAreas: {
        name: 'focusAreas',
        type: 'array',
        description: 'Specific areas to focus on',
        required: false,
        defaultValue: ['bugs', 'performance', 'readability']
      }
    },
    templateFn: `(params) => {
  const { code, language, focusAreas = ['bugs', 'performance', 'readability'] } = params;
  return \`Please review the following \${language} code:

\\\`\\\`\\\`\${language}
\${code}
\\\`\\\`\\\`

Focus on: \${focusAreas.join(', ')}

Provide specific suggestions for improvements.\`;
}`,
    outputSchema: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line: { type: 'number' },
              severity: { type: 'string', enum: ['error', 'warning', 'info'] },
              message: { type: 'string' }
            }
          }
        },
        suggestions: { type: 'array', items: { type: 'string' } }
      }
    },
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 1
  },
  {
    id: 'prompt-3' as EARS.EntityId,
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
  let prompt = \`Please answer the following question in a \${tone} tone:\n\n\${question}\`;
  
  if (context) {
    prompt = \`Context:\n\${context}\n\n\${prompt}\`;
  }
  
  return prompt;
}`,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3
  }
];

// Store for runtime operations
let prompts: Map<EARS.EntityId, PromptEntity> = new Map(
  mockPrompts.map(p => [p.id, p])
);

export function getAllPrompts(): PromptEntity[] {
  return Array.from(prompts.values());
}

export function getPromptById(id: EARS.EntityId): PromptEntity | undefined {
  return prompts.get(id);
}

export function addPrompt(prompt: PromptEntity): void {
  prompts.set(prompt.id, prompt);
}

export function updatePromptInStore(id: EARS.EntityId, prompt: PromptEntity): void {
  prompts.set(id, prompt);
}

export function deletePromptFromStore(id: EARS.EntityId): void {
  prompts.delete(id);
} 