import type { NodeEntity } from '@/systems/flows/config/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { brainDebug, brainLogger } from '../utils/brain-debug';
import { repository } from '@/repository';
import { z } from 'zod';

// Lazy services getter to avoid circular dependency
function getServices() {
  return require('@/services').default;
}

interface ActionNodeConfig {
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
): Promise<any> {
  try {
    // Create a function that has access to services, params, and zod
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const func = new AsyncFunction('params', 'services', 'z', actionFn);
    
    // Execute the function with params, services, and zod
    const services = getServices();
    const result = await func(params, services, z);
    
    return result;
  } catch (error) {
    brainLogger.error('Action function execution failed:', error as any);
    throw error;
  }
}

/**
 * Handle execution of an action node
 */
export async function actionNodeHandler(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const actionNode = node as ActionNode;
  const nodeData = tNode.nodeAttributes || {};
  
  brainDebug(`Executing action node: ${node.label}`, {
    tNode,
    node,
    nodeAttributeKeys: Object.keys(nodeData),
  });
  
  try {
    // Get the linked action via INSTANCE_OF relationship
    const actionId = repository.flowsQueries.getNodeActionId(node.id);
    
    if (!actionId) {
      throw new Error('No action linked to this node');
    }
    
    const action = repository.actionQueries.byId(actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    
    brainDebug(`Found action: ${action.label}`, {
      input: Object.keys(action.input || {}),
    });
    
    // Extract action parameters from nodeAttributes
    // All params (both direct and mapped) are already resolved in nodeAttributes
    const params: Record<string, any> = {};
    
    // Everything in nodeData is params (no actionId anymore)
    for (const [key, value] of Object.entries(nodeData)) {
      params[key] = value;
    }
    
    brainDebug(`Executing action with resolved params:`, params);
    
    // Execute the action function
    const result = await executeActionFunction(
      action.actionFn,
      params,
    );
    
    brainDebug(`Action completed successfully:`, {
      nodeLabel: node.label,
      actionLabel: action.label,
      // resultType: typeof result,
      result,
    });
    
    // Send completion event
    actor.send({ 
      type: 'COMPLETE', 
      result
    });
    
  } catch (error) {
    brainLogger.error(`Action node execution failed:`, {
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