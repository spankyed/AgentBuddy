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
          if (responderNode.nodeType === 'flow') {
            const systemId = `flow-${responderNode.id}-${context.parentTNodeId}`

            enqueue.spawnChild(
              createFlowMachine(responderNode.id, eventTNode.id),
              {
                systemId,
                input: {
                  executionContext: updatedContext,
                  systemActor: context.systemActor,
                },
              }
            );
          } else {
            enqueue.spawnChild(createStepMachine(), {
              systemId: `step-${responderNode.id}`,
              input: {
                node: responderNode,
                parentTNodeId: eventTNode.id,
                executionContext: updatedContext,
                systemActor: context.systemActor,
              }
            });
          }
        }
      }),
      spawnNextNode: enqueueActions(({ context, event, self, enqueue, system }) => {
        console.log(`Child completed in flow ${context.flowId}:`, event);

        const typedEv = typeOf('CHILD_COMPLETED', event as any);

        if (typedEv.nextNode && typedEv.parentTNodeId) {
          if (typedEv.nextNode.nodeType === 'flow') {
            const systemId = `flow-${typedEv.nextNode.id}-${context.parentTNodeId}`

            enqueue.spawnChild(
              createFlowMachine(typedEv.nextNode.id, typedEv.parentTNodeId),
              {
                systemId,
                input: {
                  executionContext: context.executionContext,
                  systemActor: context.systemActor,
                },
              }
            );
          } else {
            enqueue.spawnChild(createStepMachine(), {
              systemId: `step-${typedEv.nextNode.id}`,
              input: {
                node: typedEv.nextNode,
                parentTNodeId: typedEv.parentTNodeId,
                executionContext: context.executionContext,
                systemActor: context.systemActor,
              }
            });
          }
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
