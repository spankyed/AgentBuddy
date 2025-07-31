import { EARS } from '@/core/types';
import type { DatabaseSchemaInfo } from '../types';
import { getAllAttributeKinds, getAllRelationKinds, getAllEntityTypes, getEntitiesOfType, getAttributeStats } from '@/core/utils/ears/attribute-storage';
import { relationIndex } from '@/core/utils/ears/relation-index';

/**
 * Generate schema information from actual data in the system
 * This provides a real-time view of what entities, attributes, and relations exist
 */
export function generateSchemaInfo(): DatabaseSchemaInfo {
  // Get entity types directly from entityIndex - this includes ALL entities in the system
  const entityTypes = getAllEntityTypes();
  const entities = entityTypes.map(type => ({ type }));
  
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

/**
 * Get detailed schema statistics
 * Useful for debugging and understanding data distribution
 */
export function getSchemaStats() {
  const stats = {
    entities: {} as Record<string, number>,
    attributes: {} as Record<string, { entityCount: number; totalValues: number }>,
    relations: {} as Record<string, { totalRelations: number; uniqueSources: number; uniqueTargets: number }>,
  };
  
  // Count entities by type using actual entity types from the index
  const entityTypes = getAllEntityTypes();
  for (const entityType of entityTypes) {
    const instances = getEntitiesOfType(entityType);
    stats.entities[entityType] = instances.length;
  }
  
  // Get attribute statistics
  const attributeKinds = getAllAttributeKinds();
  for (const kind of attributeKinds) {
    const attrStats = getAttributeStats(kind);
    stats.attributes[String(kind)] = attrStats;
  }
  
  // Count relations by type
  const relationKinds = getAllRelationKinds();
  for (const kind of relationKinds) {
    const entry = relationIndex[kind];
    if (entry) {
      // Count total relations by summing up all relation IDs
      let totalRelations = 0;
      const uniqueSources = Object.keys(entry.bySource).length;
      const uniqueTargets = Object.keys(entry.byTarget).length;
      
      // Count unique relation IDs (each relation appears in both bySource and byTarget)
      const uniqueRelationIds = new Set<string>();
      for (const relIds of Object.values(entry.bySource)) {
        relIds.forEach(id => uniqueRelationIds.add(id));
      }
      totalRelations = uniqueRelationIds.size;
      
      stats.relations[kind] = {
        totalRelations,
        uniqueSources,
        uniqueTargets,
      };
    }
  }
  
  return stats;
}

/**
 * Get relation counts for a specific relation kind
 */
export function getRelationCount(kind: string): number {
  const entry = relationIndex[kind];
  if (!entry) return 0;
  
  const uniqueRelationIds = new Set<string>();
  for (const relIds of Object.values(entry.bySource)) {
    relIds.forEach(id => uniqueRelationIds.add(id));
  }
  return uniqueRelationIds.size;
}