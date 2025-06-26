import { PromptTemplate, registerPromptTemplate } from '../types';

export const formatResponseTemplate: PromptTemplate = {
  id: 'format-response',
  name: 'Format Response',
  description: 'Formats a response based on analysis results',
  category: 'generation',
  
  templateFn: (params) => {
    const { analysisResult, responseStyle, additionalInstructions } = params;
    
    let prompt = `Based on the following analysis:\n\n`;
    prompt += `${JSON.stringify(analysisResult, null, 2)}\n\n`;
    
    prompt += `Generate a ${responseStyle || 'professional'} response that:\n`;
    prompt += `- Addresses the identified intent\n`;
    prompt += `- References the key entities mentioned\n`;
    prompt += `- Follows the suggested response category\n`;
    
    if (additionalInstructions) {
      prompt += `\nAdditional instructions: ${additionalInstructions}`;
    }
    
    return prompt;
  },
  
  params: [
    {
      name: 'analysisResult',
      description: 'The result from the previous analysis step',
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
      analysisResult: {
        summary: "User needs help debugging Python",
        intent: "technical_support",
        entities: ["Python", "debugging", "function"],
        category: "programming_help"
      },
      responseStyle: "helpful and technical"
    },
    output: `Based on the following analysis:

{
  "summary": "User needs help debugging Python",
  "intent": "technical_support", 
  "entities": ["Python", "debugging", "function"],
  "category": "programming_help"
}

Generate a helpful and technical response that:
- Addresses the identified intent
- References the key entities mentioned
- Follows the suggested response category`
  }
};

// Register the template
registerPromptTemplate(formatResponseTemplate); 