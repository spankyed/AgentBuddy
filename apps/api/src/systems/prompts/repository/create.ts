import { EARS } from '@/shared/ears/types';
import type { PromptEntity, TemplateInput } from '../types';
import { addPrompt } from './mock-data';

export function createPrompt(data: {
  label: string;
  inputs: Record<string, any>;
  templateFn: string;
  outputSchema?: any;
  description?: string;
  category?: string;
}): PromptEntity {
  const now = Date.now();
  const id = `prompt-${now}` as EARS.EntityId;
  
  // Transform inputs to proper TemplateInput format
  const transformedInputs: Record<string, TemplateInput> = {};
  for (const [key, value] of Object.entries(data.inputs)) {
    if (typeof value === 'object' && value !== null) {
      transformedInputs[key] = value as TemplateInput;
    } else {
      // Simple transformation for basic inputs
      transformedInputs[key] = {
        name: key,
        type: 'any',
        required: true
      };
    }
  }
  
  const newPrompt: PromptEntity = {
    id,
    entityType: EARS.Entity.Prompt,
    label: data.label,
    description: data.description,
    category: data.category,
    inputs: transformedInputs,
    templateFn: data.templateFn,
    outputSchema: data.outputSchema,
    createdAt: now,
    updatedAt: now
  };
  
  addPrompt(newPrompt);
  return newPrompt;
} 