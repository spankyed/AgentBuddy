import { PromptTemplate, registerPromptTemplate } from '../types';

export const formatResponseTemplate: PromptTemplate = {
  id: 'format-response',
  name: 'Format Response',
  description: 'Formats a response based on analysis results',
  category: 'generation',
  
  // Declare expected inputs
  inputs: {
    userMessage: {
      name: 'userMessage',
      type: 'string',
      description: 'The original user message',
      required: true,
      commonSources: ['$.event.data.message', '$.event.data.payload']
    },
    analysisResult: {
      name: 'analysisResult',
      type: 'object',
      description: 'The analysis result from the previous step',
      required: true,
      commonSources: ['$.lastStep.result', '$.steps[label=Process User Message].result'],
      example: {
        summary: "User needs help debugging Python",
        intent: "technical_support",
        entities: ["Python", "debugging", "function"],
        category: "programming_help"
      }
    },
    responseStyle: {
      name: 'responseStyle',
      type: 'string',
      description: 'The style of response (professional, casual, technical, etc.)',
      required: false,
      defaultValue: 'professional',
      example: 'helpful and technical'
    },
    additionalInstructions: {
      name: 'additionalInstructions',
      type: 'string',
      description: 'Any additional formatting instructions',
      required: false,
      defaultValue: ''
    }
  },
  
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
  
  example: {
    input: {
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