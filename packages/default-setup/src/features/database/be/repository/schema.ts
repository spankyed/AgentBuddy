import { EARS } from '#generated/ears.ts';
import type { DatabaseSchemaInfo } from '../types.ts';
import { getSchemaStats } from '@apackdev/sdk/ears';

/**
 * Generate schema information from actual data in the system
 * This provides a real-time view of what entities, attributes, and relations exist
 */
export function generateSchemaInfo(): DatabaseSchemaInfo {
  const stats = getSchemaStats();
  const entities = Object.keys(stats.entities).map(type => ({ type: type as EARS.Entity }));
  const attributes = Object.keys(stats.attributes).map(kind => ({ kind }));
  const relations = Object.keys(stats.relations).map(kind => ({ kind: kind as EARS.RelKind }));

  return { entities, attributes, relations };
}
