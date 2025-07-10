import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { ActionEntity } from '../types';

export function getActionById(actionId: EARS.EntityId): ActionEntity | undefined {
  const result = qx(actionId).pickAll()[0];
  return result ? result as unknown as ActionEntity : undefined;
}

export function getAllActions(): ActionEntity[] {
  const results = qx(EARS.Entity.Action).pickAll();
  return (results || []) as unknown as ActionEntity[];
}

export function getActionsByCategory(category: string): ActionEntity[] {
  const results = qx(EARS.Entity.Action)
    .where('category', category)
    .pickAll();
  return (results || []) as unknown as ActionEntity[];
}