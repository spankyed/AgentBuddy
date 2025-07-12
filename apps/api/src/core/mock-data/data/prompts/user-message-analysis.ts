import { EARS } from '@/core/utils/ears/types';
import type { Rows } from '@/core/types';

const nowMs = Date.now();

export const userMessageAnalysisPrompt: Rows = {
  entity: [
    {
      id: 'Prompt-user-message-analysis',
      entityType: EARS.Entity.Prompt,
      label: 'User Message Analysis',
      description: 'Analyzes user messages to extract intent, entities, and sentiment',
      category: 'analysis',
      inputs: {
        userMessage: {
          name: 'userMessage',
          type: 'string',
          description: 'The user\'s message to analyze',
          required: true
        },
        additionalContext: {
          name: 'additionalContext',
          type: 'string',
          description: 'Additional context about the conversation',
          required: false,
          defaultValue: ''
        }
      },
      templateFn: `const { userMessage, additionalContext = '' } = params;

// prettier-ignore
return \`
Analyze the following user message and extract key information:

User Message: "\${userMessage}"

\${additionalContext ? \`Additional Context: \${additionalContext}\n\n\` : ''}

Please provide a detailed analysis including:
1. Summary: A brief summary of what the user is asking or saying
2. Intent: The primary intent or goal of the message (e.g., question, request, feedback, etc.)
3. Entities: Key entities, topics, or concepts mentioned
4. Category: Categorize the message (e.g., technical_support, general_inquiry, feature_request, etc.)
5. Urgency: Assess the urgency level (low, medium, high)

Format your response as a structured analysis.
\`;`,
      createdAt: nowMs - 86400000 * 2,
      updatedAt: nowMs - 86400000 * 2
    }
  ],
  
  role: [],
  
  relation: []
};