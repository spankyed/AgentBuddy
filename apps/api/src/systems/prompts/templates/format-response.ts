import { PromptTemplate, registerPromptTemplate } from '../types';

export const formatResponseTemplate: PromptTemplate = {
  id: 'format-response',
  name: 'Format Response',
  description: 'Formats a response based on analysis results',
  category: 'generation',
  
  templateFn: (params) => {
    const context = params.context || {};
    
    // Get the analysis result from previous step
    // Try by label first, then fall back to last result
    const analysisResult = context.getResultByLabel?.('Process User Message') || 
                          context.getResultByLabel?.('Analyze User Message') ||
                          context.lastResult ||
                          {};
    
    // Get the original user message
    const userMessage = context.eventPayload?.message || 
                       context.eventPayload?.text || 
                       '[No message]';
    
    const responseStyle = params.responseStyle || 'professional';
    
    let prompt = `Original user message: "${userMessage}"\n\n`;
    prompt += `Based on the following analysis:\n\n`;
    prompt += `${JSON.stringify(analysisResult, null, 2)}\n\n`;
    
    prompt += `Generate a ${responseStyle} response that:\n`;
    prompt += `- Directly addresses the user's question or request\n`;
    prompt += `- Uses the identified intent and entities appropriately\n`;
    prompt += `- Follows the suggested response category\n`;
    prompt += `- Is helpful and actionable\n`;
    
    if (params.additionalInstructions) {
      prompt += `\nAdditional instructions: ${params.additionalInstructions}`;
    }
    
    return prompt;
  },
  
  params: [
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
      context: {
        eventType: 'user.message',
        eventPayload: { message: 'Can you help me debug this Python function?' },
        previousResults: [{
          stepId: 'step-1',
          stepLabel: 'Process User Message',
          result: {
            summary: "User needs help debugging Python",
            intent: "technical_support",
            entities: ["Python", "debugging", "function"],
            category: "programming_help"
          },
          timestamp: Date.now()
        }],
        lastResult: {
          summary: "User needs help debugging Python",
          intent: "technical_support",
          entities: ["Python", "debugging", "function"],
          category: "programming_help"
        },
        getResultByLabel: () => ({
          summary: "User needs help debugging Python",
          intent: "technical_support",
          entities: ["Python", "debugging", "function"],
          category: "programming_help"
        })
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