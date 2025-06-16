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
    const queryFunction = new Function(
      'qx', 'EARS', 'getAllEntities', 'getAll', 'queryEntitiesByRelationTo',
      `return (async () => { ${code} })();`
    );
    
    const result = await queryFunction(qx, EARS, getAllEntities, getAll, queryEntitiesByRelationTo);
    
    // Already in correct format
    if (result?.nodes && result?.edges && Array.isArray(result.nodes) && Array.isArray(result.edges)) {
      return result;
    }
    
    // Convert qx result
    if (result && typeof result.ids === 'function') {
      const ids = result.ids();
      const nodes = ids.map((id: EARS.EntityId) => ({
        id,
        type: id.split('-')[0] as EARS.Entity,
        data: getAll(id),
      }));
      
      const edges = extractEdges(ids);
      return { nodes, edges };
    }
    
    return { nodes: [], edges: [] };
  } catch (error) {
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractEdges(entityIds: EARS.EntityId[]): DatabaseQueryResult['edges'] {
  const edges: DatabaseQueryResult['edges'] = [];
  const seen = new Set<string>();
  
  for (const entityId of entityIds) {
    for (const [relKind, index] of Object.entries(relationIndex)) {
      const relationIds = index?.bySource[entityId];
      if (!relationIds) continue;
      
      for (const relationId of relationIds) {
        const relationData = getAll(relationId);
        if (!relationData?.target) continue;
        
        const targetId = relationData.target as EARS.EntityId;
        const edgeId = `${entityId}--${relKind}--${targetId}`;
        
        if (!seen.has(edgeId)) {
          seen.add(edgeId);
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