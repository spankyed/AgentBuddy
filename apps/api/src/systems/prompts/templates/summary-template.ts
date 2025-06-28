import { PromptTemplate, registerPromptTemplate } from '../types';

export const summaryTemplate: PromptTemplate = {
  id: 'multi-step-summary',
  name: 'Multi-Step Summary',
  description: 'Creates a summary using results from multiple previous steps',
  category: 'analysis',
  
  // Declare expected inputs
  inputs: {
    firstAnalysis: {
      name: 'firstAnalysis',
      type: 'object',
      description: 'Results from the first analysis step',
      required: false,
      commonSources: ['$.steps[0].result', '$.lastStep.result']
    },
    secondAnalysis: {
      name: 'secondAnalysis',
      type: 'object',
      description: 'Results from the second analysis step',
      required: false,
      commonSources: ['$.steps[1].result']
    },
    originalMessage: {
      name: 'originalMessage',
      type: 'string',
      description: 'The original user message',
      required: false,
      commonSources: ['$.event.data.message', '$.event.data.payload']
    },
    allPreviousSteps: {
      name: 'allPreviousSteps',
      type: 'array',
      description: 'Summary of all previous step results',
      required: false,
      commonSources: ['$.steps']
    }
  },
  
  templateFn: (params) => {
    const { firstAnalysis, secondAnalysis, originalMessage, allPreviousSteps } = params;
    
    let prompt = `Create a comprehensive summary based on multiple analysis steps:\n\n`;
    
    if (originalMessage) {
      prompt += `Original Message: "${originalMessage}"\n\n`;
    }
    
    if (firstAnalysis) {
      prompt += `First Analysis Results:\n${JSON.stringify(firstAnalysis, null, 2)}\n\n`;
    }
    
    if (secondAnalysis) {
      prompt += `Second Analysis Results:\n${JSON.stringify(secondAnalysis, null, 2)}\n\n`;
    }
    
    if (allPreviousSteps) {
      prompt += `All Previous Steps Summary:\n${JSON.stringify(allPreviousSteps, null, 2)}\n\n`;
    }
    
    prompt += `Please provide a consolidated summary that:\n`;
    prompt += `1. Synthesizes insights from all analyses\n`;
    prompt += `2. Identifies any patterns or conflicts\n`;
    prompt += `3. Provides final recommendations`;
    
    return prompt;
  },
  
  example: {
    params: {
      firstAnalysis: { intent: "help", category: "technical" },
      secondAnalysis: { sentiment: "neutral", urgency: "medium" },
      originalMessage: "Can you help me debug this?",
    },
    output: `Create a comprehensive summary based on multiple analysis steps:

Original Message: "Can you help me debug this?"

First Analysis Results:
{
  "intent": "help",
  "category": "technical"
}

Second Analysis Results:
{
  "sentiment": "neutral",
  "urgency": "medium"
}

Please provide a consolidated summary that:
1. Synthesizes insights from all analyses
2. Identifies any patterns or conflicts
3. Provides final recommendations`
  }
};

// Register the template
registerPromptTemplate(summaryTemplate); 