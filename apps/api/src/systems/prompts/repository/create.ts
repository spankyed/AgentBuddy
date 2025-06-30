import { tx } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { PromptEntity, TemplateInput } from '../types';

export function createPrompt(data: {
  label: string;
  inputs: Record<string, any>;
  templateFn: string;
  outputSchema?: any;
  description?: string;
  category?: string;
}): PromptEntity {
  const ts = Date.now();
  const count = qx(EARS.Entity.Prompt).count() + 1;
  
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
  
  const newPrompt: Omit<PromptEntity, 'id'> = {
    entityType: EARS.Entity.Prompt,
    label: data.label,
    description: data.description,
    category: data.category,
    inputs: transformedInputs,
    templateFn: data.templateFn,
    outputSchema: data.outputSchema,
    createdAt: ts,
    updatedAt: ts
  };
  
  const id = tx(EARS.Entity.Prompt)
    .batchPut(newPrompt)
    .id();
  
  return { id, ...newPrompt };
} 