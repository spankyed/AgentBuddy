import { PromptTemplate, registerPromptTemplate } from '../types';

export const userMessageAnalysisTemplate: PromptTemplate = {
  id: 'user-message-analysis',
  name: 'User Message Analysis',
  description: 'Analyzes and processes a user message before storage',
  category: 'analysis',
  
  templateFn: (params) => {
    // Access the context object which contains all execution data
    const context = params.context || {};
    
    // Extract user message from event payload
    const userMessage = context.eventPayload?.message || 
                       context.eventPayload?.text || 
                       context.eventPayload || 
                       '[No message provided]';
    
    // Build the prompt
    let prompt = `Analyze the following user message:\n\n`;
    prompt += `Message: "${userMessage}"\n\n`;
    
    // Add any previous results if available
    if (context.previousResults && context.previousResults.length > 0) {
      prompt += `Previous Processing Results:\n`;
      context.previousResults.forEach((result: any, idx: number) => {
        prompt += `- ${result.stepLabel}: ${JSON.stringify(result.result).substring(0, 100)}...\n`;
      });
      prompt += `\n`;
    }
    
    // Add custom context if provided
    if (params.additionalContext) {
      prompt += `Additional Context: ${params.additionalContext}\n\n`;
    }
    
    prompt += `Please provide:\n`;
    prompt += `1. A summary of the message\n`;
    prompt += `2. Identified intent or purpose\n`;
    prompt += `3. Key entities or topics mentioned\n`;
    prompt += `4. Suggested response category\n`;
    prompt += `5. Any data that should be stored`;
    
    return prompt;
  },
  
  params: [
    {
      name: 'additionalContext',
      description: 'Any additional context to include in the analysis',
      type: 'string',
      required: false,
    }
  ],
  
  example: {
    params: {
      context: {
        eventType: 'user.message',
        eventPayload: { message: 'Can you help me debug this Python function?' },
        previousResults: []
      },
      additionalContext: 'User is working on a data analysis project'
    },
    output: `Analyze the following user message:

Message: "Can you help me debug this Python function?"

Additional Context: User is working on a data analysis project

Please provide:
1. A summary of the message
2. Identified intent or purpose
3. Key entities or topics mentioned
4. Suggested response category
5. Any data that should be stored`
  }
};

// Register the template
registerPromptTemplate(userMessageAnalysisTemplate); 