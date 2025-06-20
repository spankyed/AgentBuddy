import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { EARS } from '@/shared/ears/types';
import { updateTNodeStatus } from './tnode-manager';
import { spawnFlowMachine, spawnStepMachine } from '../machines/spawners';

/**
 * Spawn a child machine based on node type
 */
export function spawnChildMachine(
  node: NodeEntity,
  parentTNodeId: EARS.EntityId,
  executionContext: ExecutionContext,
  parentActor: any,
  systemActor?: any
) {
  try {
    if (node.nodeType === 'flow') {
      spawnFlowMachine(node.id!, parentTNodeId, executionContext, parentActor, systemActor);
    } else {
      spawnStepMachine(node, parentTNodeId, executionContext, parentActor, systemActor);
    }
  } catch (error) {
    console.error(`Failed to spawn child for node ${node.id}:`, error);
    updateTNodeStatus(parentTNodeId, 'failed', systemActor);
  }
} 