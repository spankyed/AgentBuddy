import type { ActorRefFrom } from 'xstate';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { FlowEntity, FlowNode, NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { createFlowMachine } from './flow-machine';
import { createStepMachine } from './step-machine';
import { createFlowTNode } from '../utils/tnode-manager';
import { getFlowEventNodes } from '../utils/flow-data';
import { setSpawners } from '../utils/execution-chain';

/**
 * Spawn a state machine for a flow node
 */
export function spawnFlowMachine(
  flowNodeId: EARS.EntityId, 
  parentTNodeId: EARS.EntityId,
  executionContext: ExecutionContext,
  parentActor: any,
  systemActor?: any
): ActorRefFrom<any> {
  // Get the flow reference from the flow node
  const flowNode = qx(flowNodeId)
    .pickOne(["id", "nodeType", "flowRef", "label"]) as Partial<FlowNode> | undefined;
  
  if (!flowNode || flowNode.nodeType !== 'flow') {
    throw new Error(`Flow node ${flowNodeId} not found or not a flow type`);
  }

  // Get the referenced flow
  const flow = qx(flowNode.flowRef as EARS.EntityId)
    .pickOne(["id", "label"]) as Partial<FlowEntity> | undefined;
  
  if (!flow) {
    throw new Error(`Referenced flow ${flowNode.flowRef} not found`);
  }

  // Get event nodes for this flow
  const eventNodes = getFlowEventNodes(flow.id!);

  // Create TNode for this flow instance
  const flowTNode = createFlowTNode(
    flow.id!,
    flow.label || 'Flow',
    parentTNodeId,
    systemActor
  );

  // Create and spawn the flow machine
  const flowMachine = createFlowMachine(flow.id!, eventNodes);
  const actor = parentActor.spawn(flowMachine, {
    id: `flow-actor-${flowTNode.id}`,
    input: {
      flowId: flow.id!,
      parentTNodeId: flowTNode.id,
      eventNodes,
      executionContext,
      systemActor,
    },
  });
  
  // Find and trigger entry event if exists
  const entryEvent = eventNodes.find(n => n.mode === 'entry');
  if (entryEvent) {
    actor.send({ type: entryEvent.eventType });
  }
  
  return actor;
}

/**
 * Spawn a state machine for a step node
 */
export function spawnStepMachine(
  node: NodeEntity, 
  parentTNodeId: EARS.EntityId,
  executionContext: ExecutionContext,
  parentActor: any,
  systemActor?: any
): ActorRefFrom<any> {
  const stepMachine = createStepMachine();
  const actor = parentActor.spawn(stepMachine, {
    id: `step-actor-${node.id}`,
    input: {
      node,
      parentTNodeId,
      executionContext,
      systemActor,
    },
  });
  
  return actor;
}

// Initialize the execution chain with these spawners
setSpawners(spawnFlowMachine, spawnStepMachine); 