import { tx } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { PromptEntity, TemplateInput } from '../types';

const promptFields = [
  'id',
  'entityType', 
  'label',
  'description',
  'category',
  'inputs',
  'templateFn',
  'outputSchema',
  'createdAt',
  'updatedAt'
] as const;

function transformInputs(inputs: Record<string, any>): Record<string, TemplateInput> {
  const transformed: Record<string, TemplateInput> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'object' && value !== null) {
      transformed[key] = value as TemplateInput;
    } else {
      transformed[key] = {
        name: key,
        type: 'any',
        required: true
      };
    }
  }
  return transformed;
}

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
  // Check if prompt exists
  const existingPrompt = qx(id).pick(['id']);
  if (!existingPrompt) {
    return undefined;
  }
  
  // Build update attributes
  const updates: Record<string, unknown> = {
    updatedAt: Date.now()
  };
  
  if (data.label !== undefined) updates.label = data.label;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.templateFn !== undefined) updates.templateFn = data.templateFn;
  if (data.outputSchema !== undefined) updates.outputSchema = data.outputSchema;
  if (data.inputs !== undefined) updates.inputs = transformInputs(data.inputs);
  
  // Apply all updates in one fluent chain
  tx(id).batchPut(updates);
  
  // Return updated prompt
  return qx(id).pick(promptFields) as unknown as PromptEntity;
}

export function deletePrompt(id: EARS.EntityId): boolean {
  // Check if prompt exists before attempting delete
  if (!qx(id).pick(['id'])) {
    return false;
  }
  
  tx(id).destroy();
  return true;
} 