import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { getAllEntities, getAll, queryEntitiesByRelationTo } from '@/shared/ears/attribute-storage';
import { relationIndex } from '@/shared/ears/relation-index';
import type { DatabaseQueryResult } from './types';

/**
 * Execute a user-provided query against the EARS database
 * 
 * @param code - The query code to execute
 * @returns Query results in graph format (nodes and edges)
 * @throws Error if query execution fails
 */
export async function executeQuery(code: string): Promise<DatabaseQueryResult> {
  try {
    // Create a sandboxed function that executes the user's code
    // Provide access to qx query builder, EARS types, and query helper functions
    const queryFunction = new Function(
      'qx', 
      'EARS', 
      'getAllEntities', 
      'getAll', 
      'queryEntitiesByRelationTo',
      `return (async () => { ${code} })();`
    );
    
    const result = await queryFunction(
      qx, 
      EARS, 
      getAllEntities, 
      getAll, 
      queryEntitiesByRelationTo
    );
    
    // If result is already in the expected format, return it
    if (isValidQueryResult(result)) {
      return result;
    }
    
    // Convert qx result to graph format
    if (isQxResult(result)) {
      return convertQxResultToGraph(result);
    }
    
    // Return empty result if we can't process it
    return { nodes: [], edges: [] };
  } catch (error) {
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Type guard to check if result is already in DatabaseQueryResult format
 */
function isValidQueryResult(result: unknown): result is DatabaseQueryResult {
  return (
    result !== null &&
    typeof result === 'object' &&
    'nodes' in result &&
    'edges' in result &&
    Array.isArray((result as any).nodes) &&
    Array.isArray((result as any).edges)
  );
}

/**
 * Type guard to check if result is a qx query result
 */
function isQxResult(result: unknown): result is { ids: () => EARS.EntityId[] } {
  return (
    result !== null &&
    typeof result === 'object' &&
    typeof (result as any).ids === 'function'
  );
}

/**
 * Convert qx query result to graph format with nodes and edges
 */
function convertQxResultToGraph(result: { ids: () => EARS.EntityId[] }): DatabaseQueryResult {
  const ids = result.ids();
  
  // Build nodes from entity IDs
  const nodes = ids.map((id: EARS.EntityId) => {
    const [entityType] = id.split('-') as [EARS.Entity];
    return {
      id,
      type: entityType,
      data: getAll(id),
    };
  });
  
  // Build edges from relations
  const edges = extractEdgesFromRelations(ids);
  
  return { nodes, edges };
}

/**
 * Extract edges from relation data for the given entity IDs
 */
function extractEdgesFromRelations(entityIds: EARS.EntityId[]): DatabaseQueryResult['edges'] {
  const edges: DatabaseQueryResult['edges'] = [];
  const processedEdges = new Set<string>();
  
  // The relationIndex stores Relation entity IDs (e.g., "Relation-xyz123")
  // We need to fetch the actual relation data to get the real source/target entity IDs
  for (const entityId of entityIds) {
    for (const [relKind, index] of Object.entries(relationIndex)) {
      if (!index) continue;
      
      // Get relation entity IDs where this entity is the source
      const relationIds = index.bySource[entityId];
      if (!relationIds) continue;
      
      for (const relationId of relationIds) {
        // Get the actual relation data from the Relation entity
        const relationData = getAll(relationId);
        if (!relationData?.target) continue;
        
        const targetId = relationData.target as EARS.EntityId;
        
        // Create a unique edge ID using the relation kind
        const edgeId = `${entityId}--${relKind}--${targetId}`;
        
        if (!processedEdges.has(edgeId)) {
          processedEdges.add(edgeId);
          edges.push({
            id: edgeId,
            source: entityId,
            target: targetId,
            type: relKind as EARS.RelKind,
          });
        }
      }
    }
  }
  
  return edges;
} 