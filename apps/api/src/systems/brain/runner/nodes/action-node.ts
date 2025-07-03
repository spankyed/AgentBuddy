import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { createLogger } from '@/systems/logs/logger';
import { getActionById } from '@/systems/actions/repository';
import { EARS } from '@/shared/ears/types';
import { applyFieldMappings } from '../field-mapper';
import { mockServices } from '@/systems/actions/repository/mock-data';

const logger = createLogger('action-node');

interface ActionNodeConfig {
  actionId?: string;                          // ID of the action to execute
  params?: Record<string, any>;               // Direct parameters
  fieldMappings?: Array<{                     // Or map from context
    target: string;
    source: string;
    default?: any;
  }>;
}

type ActionNode = NodeEntity & ActionNodeConfig;

/**
 * Execute an action function with provided services and parameters
 */
async function executeActionFunction(
  actionFn: string,
  params: Record<string, any>,
  services: typeof mockServices
): Promise<any> {
  try {
    // Create a function that has access to services and params
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const func = new AsyncFunction('params', 'services', actionFn);
    
    // Execute the function with params and services
    const result = await func(params, services);
    
    return result;
  } catch (error) {
    logger.error('Action function execution failed:', error as any);
    throw error;
  }
}

/**
 * Handle execution of an action node
 */
export async function actionNodeHandler(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const actionNode = node as ActionNode;
  
  logger.debug(`Executing action node: ${node.label}`, {
    actionId: actionNode.actionId,
    hasParams: !!actionNode.params,
    hasMappings: !!actionNode.fieldMappings,
  });
  
  try {
    // Get the action definition
    if (!actionNode.actionId) {
      throw new Error('No action ID specified');
    }
    
    const action = getActionById(`Action-${actionNode.actionId}` as EARS.EntityId);
    if (!action) {
      throw new Error(`Action not found: ${actionNode.actionId}`);
    }
    
    logger.debug(`Found action: ${action.label}`, {
      parameters: Object.keys(action.parameters || {}),
    });
    
    // Prepare parameters
    let params: Record<string, any> = {};
    
    // Apply direct params first
    if (actionNode.params) {
      params = { ...actionNode.params };
    }
    
    // Apply field mappings to override/supplement params
    if (actionNode.fieldMappings && actionNode.fieldMappings.length > 0) {
      const mappedParams = applyFieldMappings(actionNode.fieldMappings, executionContext);
      params = { ...params, ...(mappedParams as Record<string, any>) };
    }
    
    logger.debug(`Executing action with params:`, params);
    
    // Execute the action function
    const result = await executeActionFunction(
      action.actionFn,
      params,
      mockServices
    );
    
    logger.debug(`Action completed successfully:`, {
      nodeLabel: node.label,
      actionLabel: action.label,
      resultType: typeof result,
    });
    
    // Send completion event
    actor.send({ 
      type: 'COMPLETE', 
      result
    });
    
  } catch (error) {
    logger.error(`Action node execution failed:`, {
      nodeLabel: node.label,
      error
    });
    
    // Send error event
    actor.send({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}