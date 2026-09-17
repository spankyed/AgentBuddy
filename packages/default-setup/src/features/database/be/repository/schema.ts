import { EARS } from '@/__generated__/ears';
import type { DatabaseSchemaInfo } from '../types';
import { getAllEntityTypes, getAllAttributeKinds, getAllRelationKinds } from '@abuddy/ears';

/**
 * Generate schema information from actual data in the system
 * This provides a real-time view of what entities, attributes, and relations exist
 */
export function generateSchemaInfo(): DatabaseSchemaInfo {
  // Get entity types directly from entityIndex - this includes ALL entities in the system
  const entityTypes = getAllEntityTypes();
  const entities = entityTypes.map(type => ({ type: type as EARS.Entity }));
  
  // Get all attribute kinds that are actually in use from the store
  const attributes = getAllAttributeKinds().map(kind => ({
    kind: typeof kind === 'string' ? kind : String(kind),
  }));
  
  // Get all relation kinds from actual relation data
  const relationKinds = getAllRelationKinds();
  const relations = relationKinds.map(kind => ({
    kind: kind as EARS.RelKind,
  }));

  return { entities, attributes, relations };
}
