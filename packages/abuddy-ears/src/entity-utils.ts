import { EARS } from './entities.ts';
import type { qx as Qx } from './query.ts';
import { installedEngine } from './installed.ts';

export function getTimestamp(): number {
  return Date.now();
}

/** An engine's numbering of new entities, by how many of their type it holds */
export function createEntityCounters(qx: typeof Qx) {
  function generateShortCode(entityType: EARS.Entity, prefix: string): string {
    const count = qx(entityType).count() + 1;
    return `${prefix}-${count}`;
  }

  function generateLabelWithCount(baseLabel: string, entityType: EARS.Entity): string {
    const count = qx(entityType).count() + 1;
    return `${baseLabel} ${count}`;
  }

  return { generateShortCode, generateLabelWithCount };
}

export function generateShortCode(entityType: EARS.Entity, prefix: string): string {
  return installedEngine().generateShortCode(entityType, prefix);
}

export function generateLabelWithCount(baseLabel: string, entityType: EARS.Entity): string {
  return installedEngine().generateLabelWithCount(baseLabel, entityType);
}

export function getEntityTypeFromId(id: EARS.EntityId): EARS.Entity | null {
  const match = id.match(/^([^-]+)-/);
  if (!match) return null;
  const typeString = match[1];
  return Object.values(EARS.Entity).find(e => e === typeString) || null;
}

export function filterSystemFields<T extends Record<string, any>>(
  updates: T,
  additionalExcludes: string[] = []
): Partial<T> {
  const systemFields = ['id', 'entityType', 'createdAt', ...additionalExcludes];
  const filtered: Partial<T> = {};
  Object.entries(updates).forEach(([key, value]) => {
    if (!systemFields.includes(key) && value !== undefined) {
      filtered[key as keyof T] = value;
    }
  });
  return filtered;
}
