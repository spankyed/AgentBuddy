import { EARS } from '@/registries/ears';
import { qx } from '@abuddy/sdk/ears';
import { 
  getAllEntities, 
  getAll, 
  queryEntitiesByRelationTo,
  getAttr,
  getAttrs,
  getRoles,
  getEntitiesOfType,
  queryEntitiesByAttribute,
  queryEntitiesInRelationTo
} from '@abuddy/sdk/ears';
import { relationIndex } from '@abuddy/sdk/ears';
import { getSchemaStats } from '../repository/schema';

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
      relationIndex,
      getSchemaStats
    );
    
    // Return whatever the query produces
    return result;
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}`);
  }
} 