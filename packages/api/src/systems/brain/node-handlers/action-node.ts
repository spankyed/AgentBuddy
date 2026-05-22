import type { NodeEntity } from '@/systems/flows/config/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { brainInspect, brainLogger } from '../utils/brain-inspect';
import { repository } from '@/repository';
import { z } from 'zod';

// Lazy services getter — merges built-in + user-installed services
function getServices() {
  const mod = require('@/services');
  return mod.getServicesWithUser(mod.default);
}

interface ActionNodeConfig {
  mode?: 'template' | 'code';
  actionFn?: string;
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
  flowTNodeId: string,
): Promise<any> {
  try {
    // Create a function that has access to services, params, flowId (instance ID), and zod
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const func = new AsyncFunction('params', 'services', 'z', 'flowId', actionFn);

    // Execute the function with params, services, zod, and flowId (which is actually the instance ID)
    const services = getServices();
    const result = await func(params, services, z, flowTNodeId);

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
  
  try {
    brainInspect(`Executing action node: ${node.label}`, {
      tNode,
      node,
      nodeAttributeKeys: Object.keys(nodeData),
    });
    // Inline code mode: execute actionFn directly without entity lookup
    if (actionNode.mode === 'code' && actionNode.actionFn) {
      const params: Record<string, any> = {
        event: executionContext.event,
        steps: executionContext.steps,
        lastStep: executionContext.lastStep,
      };

      brainInspect(`Executing inline action code for: ${node.label}`, params);

      const result = await executeActionFunction(
        actionNode.actionFn,
        params,
        executionContext.flowTNodeId,
      );

      brainInspect(`Inline action completed successfully:`, { nodeLabel: node.label, result });
      actor.send({ type: 'COMPLETE', result });
      return;
    }

    // Template mode: Get the linked action via INSTANCE_OF relationship
    const actionId = repository.flowsQueries.getNodeActionId(node.id);
    
    if (!actionId) {
      throw new Error('No action linked to this node');
    }
    
    const action = repository.actionQueries.byId(actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    
    brainInspect(`Found action: ${action.label}`, {
      input: Object.keys(action.input || {}),
    });
    
    // User params are structurally separated during TNode creation —
    // no need to filter config keys by name.
    const params: Record<string, any> = (tNode.resolvedParams as Record<string, any>) || {};
    
    brainInspect(`Executing action with resolved params:`, params);

    // Execute the action function
    const result = await executeActionFunction(
      action.actionFn,
      params,
      executionContext.flowTNodeId,
    );
    
    brainInspect(`Action completed successfully:`, {
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