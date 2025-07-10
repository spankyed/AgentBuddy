import { tx } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { ActionEntity, ActionParameter } from '../types';

export function createAction(data: {
  label: string;
  input: Record<string, any>;
  actionFn: string;
  output?: any;
  description?: string;
  category?: string;
}): ActionEntity {
  const ts = Date.now();
  const count = qx(EARS.Entity.Action).count() + 1;
  
  // Transform input to proper ActionParameter format
  const transformedInput: Record<string, ActionParameter> = {};
  for (const [key, value] of Object.entries(data.input)) {
    if (typeof value === 'object' && value !== null) {
      transformedInput[key] = value as ActionParameter;
    } else {
      // Simple transformation for basic input
      transformedInput[key] = {
        name: key,
        type: 'any',
        required: true
      };
    }
  }
  
  const newAction: Omit<ActionEntity, 'id'> = {
    entityType: EARS.Entity.Action,
    label: data.label,
    description: data.description,
    category: data.category,
    input: transformedInput,
    actionFn: data.actionFn,
    output: data.output,
    createdAt: ts,
    updatedAt: ts
  };
  
  const id = tx(EARS.Entity.Action)
    .batchPut(newAction)
    .id();
  
  return { id, ...newAction };
}