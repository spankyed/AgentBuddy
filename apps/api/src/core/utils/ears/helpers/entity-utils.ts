import { EARS } from "@/core/types";
import { qx } from "./query";

/*─────────────────────────────────────────────────────────────────
 * Common utility functions for EARS entities
 *─────────────────────────────────────────────────────────────────*/

/**
 * Get current timestamp
 */
export function getTimestamp(): number {
  return Date.now();
}

/**
 * Generate a short code for an entity type
 */
export function generateShortCode(entityType: EARS.Entity, prefix: string): string {
  const count = qx(entityType).count() + 1;
  return `${prefix}-${count}`;
}

/**
 * Generate a label with count
 */
export function generateLabelWithCount(baseLabel: string, entityType: EARS.Entity): string {
  const count = qx(entityType).count() + 1;
  return `${baseLabel} ${count}`;
}

/**
 * Validate entity ID format
 */
export function isValidEntityId(id: string): id is EARS.EntityId {
  return /^(Agent|Brain|Message|Thread|Tag|Relation|Artifact|Flow|Node|TNode|Prompt|Action|Document|Collection|Terminal)-/.test(id);
}

/**
 * Extract entity type from ID
 */
export function getEntityTypeFromId(id: EARS.EntityId): EARS.Entity | null {
  const match = id.match(/^([^-]+)-/);
  if (!match) return null;
  
  const typeString = match[1];
  return Object.values(EARS.Entity).find(e => e === typeString) || null;
}

/**
 * Filter out system fields from updates
 */
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