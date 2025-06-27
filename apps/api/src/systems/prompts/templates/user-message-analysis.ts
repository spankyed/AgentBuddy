import { PromptTemplate, registerPromptTemplate } from '../types';

export const userMessageAnalysisTemplate: PromptTemplate = {
  id: 'user-message-analysis',
  name: 'User Message Analysis',
  description: 'Analyzes and processes a user message before storage',
  category: 'analysis',
  
  templateFn: (params) => {
    // Template receives exactly what it needs via field mappings
    const { userMessage, additionalContext } = params;
    
    // Build the prompt
    let prompt = `Analyze the following user message:\n\n`;
    prompt += `Message: "${userMessage || '[No message provided]'}"\n\n`;
    
    // Add custom context if provided
    if (additionalContext) {
      prompt += `Additional Context: ${additionalContext}\n\n`;
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
      name: 'userMessage',
      description: 'The user message to analyze',
      type: 'string',
      required: true,
    },
    {
      name: 'additionalContext',
      description: 'Any additional context to include in the analysis',
      type: 'string',
      required: false,
    }
  ],
  
  example: {
    params: {
      userMessage: 'Can you help me debug this Python function?',
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