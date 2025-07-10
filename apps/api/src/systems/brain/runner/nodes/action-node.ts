import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { createLogger } from '@/systems/logs/logger';
import { actionQueries } from '@/systems/actions/repository';
import { EARS } from '@/shared/ears/types';
import type { Services } from '@/systems/actions/services';
import { services } from '@/systems/actions/services';
import { qx } from '@/shared/ears/helpers/query';

const logger = createLogger('action-node');

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
  services: Services
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
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const actionNode = node as ActionNode;
  const nodeData = tNode.nodeAttributes || {};
  
  logger.debug(`Executing action node: ${node.label}`, {
    nodeAttributeKeys: Object.keys(nodeData),
  });
  
  try {
    // Get the linked action via INSTANCE_OF relationship
    const actionId = qx(node.id)
      .links(EARS.RelKind.INSTANCE_OF, EARS.Entity.Action)
      .map(({ id }) => id)[0];
    
    if (!actionId) {
      throw new Error('No action linked to this node');
    }
    
    const action = actionQueries.byId(actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    
    logger.debug(`Found action: ${action.label}`, {
      input: Object.keys(action.input || {}),
    });
    
    // Extract action parameters from nodeAttributes
    // All params (both direct and mapped) are already resolved in nodeAttributes
    const params: Record<string, any> = {};
    
    // Everything in nodeData is params (no actionId anymore)
    for (const [key, value] of Object.entries(nodeData)) {
      params[key] = value;
    }
    
    logger.debug(`Executing action with resolved params:`, params);
    
    // Execute the action function
    const result = await executeActionFunction(
      action.actionFn,
      params,
      services
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