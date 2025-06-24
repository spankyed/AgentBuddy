import { setup, sendParent, assign, enqueueActions, log } from 'xstate';
import type { ListenNode, NodeEntity } from '@/systems/flows/types';
import { createEventTNode, createFlowTNode, updateTNodeStatus, createRootFlowTNode, getNextNodes } from '../../repository/tnode-manager';
import { getEventResponderNode } from '../../repository/tnode-manager';
import { createStepMachine } from './step-machine';
import { EARS, ExecutionContext } from '@/types';
import { safeEvents } from '@/shared/utils/actor-helpers';
import { brainBus } from '../../system';

type TNodeFlowMachineContext = {
  flowId: EARS.EntityId;
  eventTNodeId?: EARS.EntityId;
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
    eventTNodeId: EARS.EntityId;
  }
  | { type: 'CANCEL_FLOW' }

type TNodeFlowMachineInput = {
  executionContext: ExecutionContext;
  systemActor?: any;
}

const typeOf = safeEvents<ChildCompletedEvent>();

/**
 * Helper function to spawn a child node (flow or step)
 */
function createChildNode(
  stepOrFlowNode: NodeEntity,
  eventTNodeId: EARS.EntityId,
) {
  const isFlowNode = stepOrFlowNode.nodeType === 'flow';
  const { machine, tNodeId } = isFlowNode
    ? createFlowMachine(stepOrFlowNode.id, eventTNodeId)
    : createStepMachine(stepOrFlowNode.id, eventTNodeId);

  const systemId = `${isFlowNode ? 'flow' : 'step'}-${stepOrFlowNode.id}-ev-${eventTNodeId}-tnode-${tNodeId}`;

  return [
    machine,
    systemId
  ] as const;
}

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
export function createFlowMachine(flowId?: EARS.EntityId, eventTNodeId?: EARS.EntityId) {
  // Handle TNode creation
  let actualFlowId: EARS.EntityId;
  let flowTNodeId: EARS.EntityId;
  let eventNodes: ListenNode[];

  const isRootFlow = !flowId;

  if (isRootFlow) {
    // Create root flow TNode
    const { rootFlow, rootFlowTNode, eventNodes: rootEventNodes } = createRootFlowTNode();
    actualFlowId = rootFlow.id;
    flowTNodeId = rootFlowTNode.id || 'TNode-Root'; // 'TNode-Root'
    eventNodes = rootEventNodes;
  } else {
    // Create regular flow TNode
    const { flowTNode, eventNodes: flowEventNodes } = createFlowTNode(flowId, eventTNodeId);
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

  return {
    tNodeId: flowTNodeId,
    machine: setup({
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
            const eventTNode = createEventTNode(eventNode, flowTNodeId);
            // emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: eventTNode }, context.systemActor);

            const updatedContext = {
              ...context.executionContext,
              eventPayload: anyEvent.payload,
              currentEvent: eventType,
            };

            // Spawn child based on node type
            const [machine, systemId] = createChildNode(responderNode, eventTNode.id);
            enqueue.spawnChild(machine, { systemId, input: { executionContext: updatedContext, systemActor: context.systemActor } });
          }
        }),
        spawnNextNode: enqueueActions(({ context, event, self, enqueue, system }) => {
          console.log(`Child completed in flow ${context.flowId}:`, event);
          const typedEv = typeOf('CHILD_COMPLETED', event as any);
          if (!typedEv.eventTNodeId) return;

          const nextNodes = getNextNodes(typedEv.childId);
          const nextNode = nextNodes.length > 0 ? nextNodes[0] : undefined;

          if (nextNode) {
            const [machine, systemId] = createChildNode(nextNode, typedEv.eventTNodeId);
            enqueue.spawnChild(machine, { systemId, input: { executionContext: context.executionContext, systemActor: context.systemActor } });
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
          const decremented = Math.max(0, context.activeChildrenCount - 1);
          const hasNextNode = getNextNodes(typedEv.childId).length > 0;

          enqueue.assign({
            // Decrement for completed child, increment if there's a next node
            activeChildrenCount: hasNextNode ? decremented + 1 : decremented,
            executionContext: typedEv.result ? { ...context.executionContext, ...typedEv.result } : context.executionContext
          })
        }),
        markFlowCompleted: ({ context }) => {
          if (context.eventTNodeId) {
            updateTNodeStatus(context.eventTNodeId, 'completed', context.systemActor);
          }
        },
        notifyParentOfCompletion: sendParent(({ context }) => ({
          type: 'CHILD_COMPLETED',
          childId: context.flowId,
          result: context.executionContext,
          eventTNodeId: context.eventTNodeId,
        })),
      },
      guards: {
        flowCompleted: ({ event, context }) => {
          const typedEv = typeOf('CHILD_COMPLETED', event as any)
          return typedEv.result?.final || (!typedEv.nextNode && context.activeChildrenCount === 0)
        }
      }
    }).createMachine({
      id: isRootFlow ? brainBus : `tnode-${flowTNodeId}`,
      initial: 'active',
      context: ({ input }: any) => ({
        flowId: actualFlowId,
        eventTNodeId: flowTNodeId,
        eventNodes: eventNodes,
        executionContext: input.executionContext || {},
        systemActor: input.systemActor,
        activeChildrenCount: 0,
      }),
      on: {
        ...eventHandlers,
        CHILD_COMPLETED: [
          {
            guard: 'flowCompleted',
            target: '.completed',
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
            CANCEL_FLOW: 'completed',
          },
        },
        completed: {
          entry: ['markFlowCompleted', 'notifyParentOfCompletion'],
          type: 'final',
        },
      },
    })
  }
} 
