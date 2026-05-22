import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
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
  destroyEntity
} from '@/core/ears/attribute-storage';
import { relationIndex } from '@/core/ears/relation-index';
import {
  prepareEntity,
  createEntityWithDefaults,
  updateEntity,
  createRelation,
  removeRelation,
  grantRole,
  revokeRole
} from '@/core/shared/repository/transaction-helpers';

/**
 * Execute a user-provided transaction against the EARS database
 * 
 * @param code - The transaction code to execute
 * @returns Transaction results including affected entities count
 * @throws Error if transaction execution fails
 */
export async function executeTransaction(code: string): Promise<any> {
  try {
    // Basic validation - just check if code is provided
    if (!code || typeof code !== 'string') {
      throw new Error('Invalid transaction code');
    }
    
    // Create function body - the user's code should include their own return statement
    const functionBody = `
      ${code}
    `;
    
    const transactionFunction = new Function(
      // Query utilities (read-only)
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
      // Transaction utilities (write)
      'tx',
      'destroyEntity',
      // Repository helpers
      'prepareEntity',
      'createEntityWithDefaults',
      'updateEntity',
      'createRelation',
      'removeRelation',
      'grantRole',
      'revokeRole',
      functionBody
    );
    
    const result = await transactionFunction(
      // Query utilities
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
      // Transaction utilities
      tx,
      destroyEntity,
      // Repository helpers
      prepareEntity,
      createEntityWithDefaults,
      updateEntity,
      createRelation,
      removeRelation,
      grantRole,
      revokeRole
    );
    
    // Return whatever the transaction produces
    return result;
  } catch (error) {
    throw new Error(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}