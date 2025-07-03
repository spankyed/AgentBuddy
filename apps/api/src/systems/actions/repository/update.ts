import { tx } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { ActionEntity, ActionParameter } from '../types';

const actionFields = [
  'id',
  'entityType', 
  'label',
  'description',
  'category',
  'parameters',
  'actionFn',
  'output',
  'createdAt',
  'updatedAt'
] as const;

function transformParameters(params: Record<string, any>): Record<string, ActionParameter> {
  const transformed: Record<string, ActionParameter> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object' && value !== null) {
      transformed[key] = value as ActionParameter;
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

export function updateAction(
  id: EARS.EntityId,
  data: {
    label?: string;
    parameters?: Record<string, any>;
    actionFn?: string;
    output?: any;
    description?: string;
    category?: string;
  }
): ActionEntity | undefined {
  // Check if action exists
  const existingAction = qx(id).pick(['id']);
  if (!existingAction) {
    return undefined;
  }
  
  // Build update attributes
  const updates: Record<string, unknown> = {
    updatedAt: Date.now()
  };
  
  if (data.label !== undefined) updates.label = data.label;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.actionFn !== undefined) updates.actionFn = data.actionFn;
  if (data.output !== undefined) updates.output = data.output;
  if (data.parameters !== undefined) updates.parameters = transformParameters(data.parameters);
  
  // Apply all updates in one fluent chain
  tx(id).batchPut(updates);
  
  // Return updated action
  return qx(id).pick(actionFields) as unknown as ActionEntity;
}

export function deleteAction(id: EARS.EntityId): boolean {
  // Check if action exists before attempting delete
  if (!qx(id).pick(['id'])) {
    return false;
  }
  
  tx(id).destroy();
  return true;
}