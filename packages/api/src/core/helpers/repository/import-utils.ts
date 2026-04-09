import { EARS } from '@/core/types';
import { exists } from './query-helpers';

/** Check if a provided ID collides with an existing entity. */
export function hasIdCollision(providedId: string | undefined): boolean {
  if (!providedId) return false
  return exists(providedId as EARS.EntityId)
}
