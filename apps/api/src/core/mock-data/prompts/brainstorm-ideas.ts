import { EARS } from '@/core/utils/ears/types';
import type { Rows } from '@/core/mock-data';

const nowMs = Date.now();

export const brainstormIdeasPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-6',
      entityType: EARS.Entity.Prompt,
      label: 'Brainstorm Ideas',
      description: 'Generates creative ideas for a given topic',
      category: 'creative',
      inputs: {
        topic: {
          name: 'topic',
          type: 'string',
          description: 'The topic to brainstorm about',
          required: true
        },
        quantity: {
          name: 'quantity',
          type: 'number',
          description: 'Number of ideas to generate',
          required: false,
          defaultValue: 5
        },
        constraints: {
          name: 'constraints',
          type: 'string',
          description: 'Any constraints or requirements',
          required: false,
          defaultValue: ''
        },
        creativity: {
          name: 'creativity',
          type: 'string',
          description: 'Creativity level',
          required: false,
          defaultValue: 'balanced',
          example: 'conservative, balanced, creative, wild'
        }
      },
      templateFn: `const { topic, quantity = 5, constraints = '', creativity = 'balanced' } = params;

// prettier-ignore
return \`
Please brainstorm \${quantity} \${creativity} ideas for:

\${topic}

\${constraints ? 'Constraints/Requirements:\\n' + constraints + '\\n\\n' : ''}Guidelines:
- Generate \${quantity} distinct ideas
- Creativity level: \${creativity}
- Each idea should be practical and actionable
- Include a brief explanation for each idea
- Consider different perspectives and approaches
- Be specific rather than generic

Present each idea with:
1. A clear title
2. A 2-3 sentence description
3. Key benefits or potential impact
\`;`,
      createdAt: nowMs - 86400000 * 8,
      updatedAt: nowMs - 86400000 * 3
    }
  ],
  
  role: [],
  
  relation: []
};