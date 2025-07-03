import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { ActionEntity } from '../types';

const fields = [
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

export function getActionById(actionId: EARS.EntityId): ActionEntity | undefined {
  const result = qx(actionId).pickOne(fields);
  return result ? result as unknown as ActionEntity : undefined;
}

export function getAllActions(): ActionEntity[] {
  const results = qx(EARS.Entity.Action).pick(fields);
  return (results || []) as unknown as ActionEntity[];
}

export function getActionsByCategory(category: string): ActionEntity[] {
  const results = qx(EARS.Entity.Action)
    .where('category', category)
    .pick(fields);
  return (results || []) as unknown as ActionEntity[];
}