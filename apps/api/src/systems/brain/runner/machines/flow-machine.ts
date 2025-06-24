import { setup, sendParent, assign, enqueueActions, log } from 'xstate';
import type { ListenNode, NodeEntity } from '@/systems/flows/types';
import { createEventTNode, createFlowTNode, updateTNodeStatus, createRootFlowTNode } from '../../repository/tnode-manager';
import { getEventResponderNode } from '../../repository/tnode-manager';
import { createStepMachine } from './step-machine';
import { EARS, ExecutionContext } from '@/types';
import { safeEvents } from '@/shared/utils/actor-helpers';


type TNodeFlowMachineContext = {
  flowId: EARS.EntityId;
  parentTNodeId?: EARS.EntityId;
  eventNodes: ListenNode[];
  executionContext: ExecutionContext;
  systemActor?: any;
  activeChildrenCount: number;
}

type ChildCompletedEvent =
  | {
    type: 'CHILD_COMPLETED';
    childId: EARS.EntityId;
    result?: any;
    nextNode?: NodeEntity;
    parentTNodeId: EARS.EntityId;
  }

type TNodeFlowMachineInput = {
  executionContext: ExecutionContext;
  systemActor?: any;
}

const typeOf = safeEvents<ChildCompletedEvent>();

/**
 * Helper function to spawn a child node (flow or step)
 */
function spawnChildNode(
  node: NodeEntity,
  parentTNodeId: EARS.EntityId,
  executionContext: ExecutionContext,
  systemActor: any,
  contextParentTNodeId: EARS.EntityId | undefined,
  enqueue: any
) {
  if (node.nodeType === 'flow') {
    const systemId = `flow-${node.id}-${contextParentTNodeId}`;
    
    enqueue.spawnChild(
      createFlowMachine(node.id, parentTNodeId),
      {
        systemId,
        input: {
          executionContext,
          systemActor,
        },
      }
    );
  } else {
    enqueue.spawnChild(createStepMachine(), {
      systemId: `step-${node.id}`,
      input: {
        node,
        parentTNodeId,
        executionContext,
        systemActor,
      }
    });
  }
}

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
export function createFlowMachine(flowId?: EARS.EntityId, parentTNodeId?: EARS.EntityId) {
  // Handle TNode creation
  let actualFlowId: EARS.EntityId;
  let flowTNodeId: EARS.EntityId;
  let eventNodes: ListenNode[];

  if (!flowId) {
    // Create root flow TNode
    const { rootFlow, rootFlowTNode, eventNodes: rootEventNodes } = createRootFlowTNode();
    actualFlowId = rootFlow.id;
    flowTNodeId = rootFlowTNode.id;
    eventNodes = rootEventNodes;
  } else {
    // Create regular flow TNode
    const { flowTNode, eventNodes: flowEventNodes } = createFlowTNode(flowId, parentTNodeId);
    actualFlowId = flowId;
    flowTNodeId = flowTNode.id;
    eventNodes = flowEventNodes;
  }

  const eventHandlers: Record<string, any> = {};

  // Add event listeners
  eventNodes.forEach(node => {
    eventHandlers[node.eventType] = {
      actions: ['handleTrackEvent', 'incrementChildCount'],
    };
  });

  return setup({
    types: {
      context: {} as TNodeFlowMachineContext,
      events: {} as ChildCompletedEvent | {
        type: string;
        [key: string]: any;
      },
      input: {} as TNodeFlowMachineInput,
    },
    actions: {
      handleTrackEvent: enqueueActions(({ context, event, enqueue, system }) => {
        const eventType = event.type;
        const eventNode = context.eventNodes.find(n => n.eventType === eventType);

        if (!eventNode) return;

        const anyEvent = event as any;

        console.log(`Flow ${context.flowId} received event: ${eventType}`);

        const responderNode = getEventResponderNode(eventNode.id!);
        if (responderNode) {
          const eventTNode = createEventTNode(eventNode, context.parentTNodeId);
          // emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: eventTNode }, context.systemActor);

          const updatedContext = {
            ...context.executionContext,
            eventPayload: anyEvent.payload,
            currentEvent: eventType,
          };

          // Spawn child based on node type
          spawnChildNode(
            responderNode, 
            eventTNode.id, 
            updatedContext, 
            context.systemActor, 
            context.parentTNodeId, 
            enqueue
          );
        }
      }),
      spawnNextNode: enqueueActions(({ context, event, self, enqueue, system }) => {
        console.log(`Child completed in flow ${context.flowId}:`, event);

        const typedEv = typeOf('CHILD_COMPLETED', event as any);

        if (typedEv.nextNode && typedEv.parentTNodeId) {
          spawnChildNode(
            typedEv.nextNode,
            typedEv.parentTNodeId,
            context.executionContext,
            context.systemActor,
            context.parentTNodeId,
            enqueue
          );
        }
      }),
      incrementChildCount: assign({
        activeChildrenCount: ({ context, event }) => {
          const eventNode = context.eventNodes.find(n => n.eventType === event.type);
          const responderNode = eventNode ? getEventResponderNode(eventNode.id!) : null;
          return responderNode ? context.activeChildrenCount + 1 : context.activeChildrenCount;
        }
      }),
      processChildCompletion: enqueueActions(({ context, event, enqueue }) => {
        const typedEv = typeOf('CHILD_COMPLETED', event as any)
        // Decrement for completed child, increment if there's a next node
        const decremented = Math.max(0, context.activeChildrenCount - 1);
        enqueue.assign({
          activeChildrenCount: typedEv.nextNode ? decremented + 1 : decremented,
          executionContext: typedEv.result ? { ...context.executionContext, ...typedEv.result } : context.executionContext
        })
      }),
      markFlowCompleted: ({ context }) => {
        if (context.parentTNodeId) {
          updateTNodeStatus(context.parentTNodeId, 'completed', context.systemActor);
        }
      },
      notifyParentOfCompletion: sendParent(({ context }) => ({
        type: 'CHILD_COMPLETED',
        childId: context.flowId,
        result: context.executionContext,
        parentTNodeId: context.parentTNodeId,
      })),
    },
    guards: {
      flowCompleted: ({ event, context }) => event.result?.final || (!event.nextNode && context.activeChildrenCount === 0)
    }
  }).createMachine({
    id: `flow-${actualFlowId}`,
    initial: 'active',
    context: ({ input }: any) => ({
      flowId: actualFlowId,
      parentTNodeId: flowTNodeId,
      eventNodes: eventNodes,
      executionContext: input.executionContext || {},
      systemActor: input.systemActor,
      activeChildrenCount: 0,
    }),
    on: {
      ...eventHandlers,
      CHILD_COMPLETED: [
        {
          target: '.completed',
          guard: 'flowCompleted',
        },
        {
          actions: ['processChildCompletion', 'spawnNextNode'],
        },
      ],
    },
    states: {
      active: {
        entry: log('Flow machine active'),
        on: {
          COMPLETE_FLOW: 'completed',
        },
      },
      completed: {
        entry: ['markFlowCompleted', 'notifyParentOfCompletion'],
        type: 'final',
      },
    },
  });
} 
