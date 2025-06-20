import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { EARS } from '@/shared/ears/types';
import { updateTNodeStatus } from './tnode-manager';

// Forward declarations - these will be imported from the main spawners
let spawnFlowMachine: any;
let spawnStepMachine: any;

/**
 * Set the spawner functions (to avoid circular dependencies)
 */
export function setSpawners(flowSpawner: any, stepSpawner: any) {
  spawnFlowMachine = flowSpawner;
  spawnStepMachine = stepSpawner;
}

/**
 * Spawn execution chain starting from a node
 */
export function spawnExecutionChain(
  startNode: NodeEntity, 
  parentTNodeId: EARS.EntityId,
  executionContext: ExecutionContext,
  parentActor: any,
  systemActor?: any
) {
  try {
    if (startNode.nodeType === 'flow') {
      spawnFlowMachine(startNode.id!, parentTNodeId, executionContext, parentActor, systemActor);
    } else {
      spawnStepMachine(startNode, parentTNodeId, executionContext, parentActor, systemActor);
    }
  } catch (error) {
    console.error(`Failed to spawn execution chain for node ${startNode.id}:`, error);
    updateTNodeStatus(parentTNodeId, 'failed', systemActor);
  }
} 