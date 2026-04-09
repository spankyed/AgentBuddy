import { EARS } from '@/core/types';
import { exists } from './query-helpers';

/** Resolve a provided ID for import: use it if valid and not already taken, otherwise undefined (auto-generate). */
export function resolveImportId(providedId: string | undefined): EARS.EntityId | undefined {
  if (!providedId) return undefined
  if (exists(providedId as EARS.EntityId)) return undefined
  return providedId as EARS.EntityId
}
