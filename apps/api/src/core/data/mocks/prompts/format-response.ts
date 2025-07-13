import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';
import { tidyFunction } from '@/core/utils/tidy-function';

const nowMs = Date.now();

const templateFn = tidyFunction(`
  const { userMessage, analysisResult, responseStyle = 'helpful and professional' } = params;

  // prettier-ignore
  return \`
    Based on the following analysis of the user's message, craft an appropriate response.

    Original User Message: "\${userMessage}"

    Analysis Result:
    \${JSON.stringify(analysisResult, null, 2)}

    Please format a response that is \${responseStyle}.

    The response should:
    1. Address the user's primary intent as identified in the analysis
    2. Be clear, concise, and helpful
    3. Include any relevant suggestions or next steps
    4. Maintain a \${responseStyle} tone throughout

    Format your response as a natural, conversational message.
  \`;
`);

export const formatResponsePrompt: Rows = {
  entity: [
    {
      id: 'Prompt-format-response',
      entityType: EARS.Entity.Prompt,
      label: 'Format Response',
      description: 'Formats AI responses based on analysis results and style preferences',
      category: 'formatting',
      inputs: {
        userMessage: {
          name: 'userMessage',
          type: 'string',
          description: 'The original user message',
          required: true
        },
        analysisResult: {
          name: 'analysisResult',
          type: 'object',
          description: 'The analysis result from the previous step',
          required: true
        },
        responseStyle: {
          name: 'responseStyle',
          type: 'string',
          description: 'The desired response style',
          required: false,
          defaultValue: 'helpful and professional'
        }
      },
      templateFn,
      createdAt: nowMs - 86400000 * 2,
      updatedAt: nowMs - 86400000 * 2
    }
  ],
  
  role: [],
  
  relation: []
};