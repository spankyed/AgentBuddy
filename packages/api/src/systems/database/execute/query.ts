import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import {
  getAllEntities,
  getAll,
  queryEntitiesByRelationTo,
  getAttr,
  getAttrs,
  getRoles,
  getEntitiesOfType,
  queryEntitiesByAttribute,
  queryEntitiesInRelationTo,
  getAllRelationKinds,
} from '@/core/ears/attribute-storage';
import { relationIndex } from '@/core/ears/relation-index';
import { USE_LMDB } from '@/core/ears/use-lmdb';
import { lmdbRelationIdsFor } from '@/core/ears/lmdb-reads';
import { getSchemaStats } from '../repository/schema';

/** Proxy that works under both modes. User code sees the same shape. */
function getRelationIndex(): typeof relationIndex {
  if (!USE_LMDB) return relationIndex;
  return new Proxy({}, {
    ownKeys() { return getAllRelationKinds(); },
    getOwnPropertyDescriptor(_, key) {
      return { configurable: true, enumerable: true };
    },
    get(_, kind) {
      if (typeof kind !== 'string') return undefined;
      const buildDir = (direction: 'out' | 'in') => new Proxy({}, {
        get(_, id) {
          if (typeof id !== 'string') return undefined;
          return lmdbRelationIdsFor(id as EARS.EntityId, kind, direction);
        }
      });
      return { bySource: buildDir('out'), byTarget: buildDir('in') };
    },
  }) as typeof relationIndex;
}

/**
 * Execute a user-provided query against the EARS database
 * 
 * @param code - The query code to execute
 * @returns Query results in graph format (nodes and edges)
 * @throws Error if query execution fails
 */
export async function executeQuery(code: string): Promise<any> {
  try {
    // Basic validation - just check if code is provided
    if (!code || typeof code !== 'string') {
      throw new Error('Invalid query code');
    }
    
    // Create function body - the user's code should include their own return statement
    const functionBody = `
      ${code}
    `;
    
    const queryFunction = new Function(
      'qx', 
      'EARS', 
      'getAllEntities', 
      'getAll', 
      'queryEntitiesByRelationTo',
      'getAttr',
      'getAttrs', 
      'getRoles',
      'getEntitiesOfType',
      'queryEntitiesByAttribute',
      'queryEntitiesInRelationTo',
      'relationIndex',
      'getSchemaStats',
      functionBody
    );
    
    const result = await queryFunction(
      qx,
      EARS,
      getAllEntities,
      getAll,
      queryEntitiesByRelationTo,
      getAttr,
      getAttrs,
      getRoles,
      getEntitiesOfType,
      queryEntitiesByAttribute,
      queryEntitiesInRelationTo,
      getRelationIndex(),
      getSchemaStats
    );
    
    // Return whatever the query produces
    return result;
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}`);
  }
} 