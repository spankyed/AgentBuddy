import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';

const nowMs = Date.now();

export const sentimentAnalysisPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-5',
      entityType: EARS.Entity.Prompt,
      label: 'Sentiment Analysis',
      description: 'Analyzes sentiment and emotion in text',
      category: 'analysis',
      inputs: {
        text: {
          name: 'text',
          type: 'string',
          description: 'The text to analyze',
          required: true
        },
        detailed: {
          name: 'detailed',
          type: 'boolean',
          description: 'Include detailed emotion breakdown',
          required: false,
          defaultValue: false
        }
      },
      templateFn: `const { text, detailed = false } = params;

// prettier-ignore
return \`
Please analyze the sentiment of the following text:

"\${text}"

Provide a sentiment analysis that includes:
- Overall sentiment (positive, negative, neutral, mixed)
- Confidence score (0-100%)
- Key emotional indicators
\${detailed ? '- Detailed emotion breakdown (joy, anger, fear, sadness, surprise, etc.)\\n- Specific phrases that indicate each emotion\\n- Intensity levels for each emotion detected' : ''}

Format your response as a clear, structured analysis.
\`;`,
      outputSchema: {
        type: 'object',
        properties: {
          sentiment: {
            type: 'string',
            enum: ['positive', 'negative', 'neutral', 'mixed']
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 100
          },
          emotions: {
            type: 'object',
            properties: {
              joy: { type: 'number' },
              anger: { type: 'number' },
              fear: { type: 'number' },
              sadness: { type: 'number' },
              surprise: { type: 'number' }
            }
          },
          keyPhrases: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      },
      createdAt: nowMs - 86400000 * 6,
      updatedAt: nowMs - 86400000 * 2
    }
  ],
  
  role: [],
  
  relation: []
};