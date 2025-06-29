import { EARS } from '@/shared/ears/types';
import type { PromptEntity, TemplateInput } from '../types';
import { getPromptById, updatePromptInStore } from './mock-data';

export function updatePrompt(
  id: EARS.EntityId,
  data: {
    label?: string;
    inputs?: Record<string, any>;
    templateFn?: string;
    outputSchema?: any;
    description?: string;
    category?: string;
  }
): PromptEntity | undefined {
  const existingPrompt = getPromptById(id);
  if (!existingPrompt) {
    return undefined;
  }
  
  // Transform inputs if provided
  let transformedInputs: Record<string, TemplateInput> | undefined;
  if (data.inputs) {
    transformedInputs = {};
    for (const [key, value] of Object.entries(data.inputs)) {
      if (typeof value === 'object' && value !== null) {
        transformedInputs[key] = value as TemplateInput;
      } else {
        transformedInputs[key] = {
          name: key,
          type: 'any',
          required: true
        };
      }
    }
  }
  
  const updatedPrompt: PromptEntity = {
    ...existingPrompt,
    ...(data.label && { label: data.label }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.category !== undefined && { category: data.category }),
    ...(transformedInputs && { inputs: transformedInputs }),
    ...(data.templateFn && { templateFn: data.templateFn }),
    ...(data.outputSchema !== undefined && { outputSchema: data.outputSchema }),
    updatedAt: Date.now()
  };
  
  updatePromptInStore(id, updatedPrompt);
  return updatedPrompt;
} 