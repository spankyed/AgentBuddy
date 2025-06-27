import { PromptTemplate, registerPromptTemplate } from '../types';

export const formatResponseTemplate: PromptTemplate = {
  id: 'format-response',
  name: 'Format Response',
  description: 'Formats a response based on analysis results',
  category: 'generation',
  
  templateFn: (params) => {
    // Template receives exactly what it needs via field mappings
    const { userMessage, analysisResult, responseStyle, additionalInstructions } = params;
    
    let prompt = `Original user message: "${userMessage || '[No message]'}"\n\n`;
    prompt += `Based on the following analysis:\n\n`;
    prompt += `${JSON.stringify(analysisResult || {}, null, 2)}\n\n`;
    
    prompt += `Generate a ${responseStyle || 'professional'} response that:\n`;
    prompt += `- Directly addresses the user's question or request\n`;
    prompt += `- Uses the identified intent and entities appropriately\n`;
    prompt += `- Follows the suggested response category\n`;
    prompt += `- Is helpful and actionable\n`;
    
    if (additionalInstructions) {
      prompt += `\nAdditional instructions: ${additionalInstructions}`;
    }
    
    return prompt;
  },
  
  params: [
    {
      name: 'userMessage',
      description: 'The original user message',
      type: 'string',
      required: true,
    },
    {
      name: 'analysisResult',
      description: 'The analysis result from the previous step',
      type: 'object',
      required: true,
    },
    {
      name: 'responseStyle',
      description: 'The style of response (professional, casual, technical, etc.)',
      type: 'string',
      required: false,
      defaultValue: 'professional'
    },
    {
      name: 'additionalInstructions',
      description: 'Any additional formatting instructions',
      type: 'string',
      required: false,
    }
  ],
  
  example: {
    params: {
      userMessage: 'Can you help me debug this Python function?',
      analysisResult: {
        summary: "User needs help debugging Python",
        intent: "technical_support",
        entities: ["Python", "debugging", "function"],
        category: "programming_help"
      },
      responseStyle: "helpful and technical"
    },
    output: `Original user message: "Can you help me debug this Python function?"

Based on the following analysis:

{
  "summary": "User needs help debugging Python",
  "intent": "technical_support", 
  "entities": ["Python", "debugging", "function"],
  "category": "programming_help"
}

Generate a helpful and technical response that:
- Directly addresses the user's question or request
- Uses the identified intent and entities appropriately
- Follows the suggested response category
- Is helpful and actionable`
  }
};

// Register the template
registerPromptTemplate(formatResponseTemplate); 