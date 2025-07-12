import { EARS } from '@/core/utils/ears/types';
import type { Rows } from '@/core/types';

const nowMs = Date.now();

export const codeReviewPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-2',
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
      templateFn: `const { code, language, focusAreas = ['bugs', 'performance', 'readability'] } = params;
// prettier-ignore
return \`
Please review the following \${language} code:

\\\`\\\`\\\`\${language}
\${code}
\\\`\\\`\\\`

Focus on: \${focusAreas.join(', ')}

Provide specific suggestions for improvements.
\`;`,
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
      createdAt: nowMs - 86400000 * 5,
      updatedAt: nowMs - 86400000 * 1
    }
  ],
  
  role: [],
  
  relation: []
};