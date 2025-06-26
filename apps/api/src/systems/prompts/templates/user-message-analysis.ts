import { PromptTemplate, registerPromptTemplate } from '../types';

export const userMessageAnalysisTemplate: PromptTemplate = {
  id: 'user-message-analysis',
  name: 'User Message Analysis',
  description: 'Analyzes and processes a user message before storage',
  category: 'analysis',
  
  templateFn: (params) => {
    const { userMessage, context, intent } = params;
    
    let prompt = `Analyze the following user message:\n\n`;
    prompt += `Message: "${userMessage}"\n\n`;
    
    if (context) {
      prompt += `Context: ${context}\n\n`;
    }
    
    if (intent) {
      prompt += `Expected Intent: ${intent}\n\n`;
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
      description: 'The message from the user to analyze',
      type: 'string',
      required: true,
    },
    {
      name: 'context',
      description: 'Additional context about the conversation',
      type: 'string',
      required: false,
    },
    {
      name: 'intent',
      description: 'Expected intent category',
      type: 'string', 
      required: false,
      defaultValue: 'general'
    }
  ],
  
  example: {
    params: {
      userMessage: 'Can you help me debug this Python function?',
      context: 'User is working on a data analysis project'
    },
    output: `Analyze the following user message:

Message: "Can you help me debug this Python function?"

Context: User is working on a data analysis project

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