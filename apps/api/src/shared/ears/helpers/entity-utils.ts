import { EARS } from '@/shared/ears/types';
import { qx } from './query';

/**
 * Get current timestamp
 */
export function getTimestamp(): number {
  return Date.now();
}

/**
 * Generate a short code for an entity
 */
export function generateShortCode(entityType: EARS.Entity, prefix?: string): string {
  const count = qx(entityType).count() + 1;
  const actualPrefix = prefix || entityType.substring(0, 3).toUpperCase();
  return `${actualPrefix}-${count}`;
}

/**
 * Generate a label with count
 */
export function generateLabelWithCount(baseLabel: string, entityType: EARS.Entity): string {
  const count = qx(entityType).count() + 1;
  return `${baseLabel} ${count}`;
} 