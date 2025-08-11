import { setup, sendParent, assign, enqueueActions, log, raise } from 'xstate';
import type { ListenNode, NodeEntity } from '@/systems/flows/config/types';
import { repository } from '@/repository';
import { createStepNodeSystem } from './step-system';
import { EARS, ExecutionContext } from '@/types';
import { safeEvents } from '@/core/utils/actor-helpers';
import { brainBus } from './system';
import { createLogger } from '@/core/utils/debug/logger';
import { prepareNodeAttributes } from './repository/node-attribute-mappers';
import { qx } from '@/core/utils/ears/helpers/query';

const logger = createLogger('flow-machine');

type TNodeFlowMachineContext = {
  flowId: EARS.EntityId;
  eventTNodeId?: EARS.EntityId;
  eventNodes: ListenNode[];
  activeChildrenCount: number;
  // Map of event track execution contexts by eventTNodeId
  eventTrackContexts: Record<EARS.EntityId, ExecutionContext>;
  // Final result when a step completes with final flag
  finalResult?: any;
  // Entry data for nested flows (resolved from field mappings)
  entryData?: any;
};

type ChildCompletedEvent =
  | {
      type: 'CHILD_COMPLETED';
      stepId?: EARS.EntityId;
      stepLabel?: string;
      result?: any;
      final?: boolean;
      eventTNodeId?: EARS.EntityId;
      isFlowCompletion?: boolean;
    }
  | { type: 'CANCEL_FLOW' };

type TNodeFlowMachineInput = {
  executionContext?: ExecutionContext; // For nested flows
};

const typeOf = safeEvents<ChildCompletedEvent>();

/**
 * Creates a child node (flow or step) and returns the machine and system ID
 * @param stepOrFlowNode - The node entity to create
 * @param eventTNodeId - The event track node ID that spawned this node
 * @param executionContext - The execution context for the step
 * @returns Tuple of [machine, systemId]
 */
function createChildNode(
  stepOrFlowNode: NodeEntity,
  eventTNodeId: EARS.EntityId,
  executionContext?: ExecutionContext,
  systemActor?: any,
) {
  logger.debug('createChildNode called with:', {
    nodeId: stepOrFlowNode?.id,
    nodeType: stepOrFlowNode?.nodeType,
    nodeLabel: stepOrFlowNode?.label,
    eventTNodeId,
    hasContext: !!executionContext
  });
  
  if (!stepOrFlowNode?.id) {
    throw new Error(`Invalid node passed to createChildNode: ${JSON.stringify(stepOrFlowNode)}`);
  }
  
  const isFlowNode = stepOrFlowNode.nodeType === 'flow';
  const { machine, tNodeId } = isFlowNode
    ? createFlowNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext, systemActor)
    : createStepNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext, systemActor);

  const systemId = `${isFlowNode ? 'flow' : 'step'}-${stepOrFlowNode.id}-ev-${eventTNodeId}-tnode-${tNodeId}`;

  return [machine, systemId] as const;
}

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
export function createFlowNodeSystem(
  flowId?: EARS.EntityId,
  eventTNodeId?: EARS.EntityId,
  executionContext?: ExecutionContext,
  systemActor?: any,
) {
  // Handle TNode creation
  let actualFlowId: EARS.EntityId;
  let flowTNodeId: EARS.EntityId;
  let eventNodes: ListenNode[];
  let entryData: any = undefined;

  const isRootFlow = !flowId;

  if (isRootFlow) {
    // Create root flow TNode
    const result = repository.brainCommands.createRootFlowTNode(systemActor);
    if (!result.success) {
      throw new Error(`Failed to create root flow TNode: ${result.error}`);
    }
    const {
      rootFlow,
      rootFlowTNode,
      eventNodes: rootEventNodes,
    } = result.data;
    actualFlowId = rootFlow.id;
    flowTNodeId = rootFlowTNode.id || 'TNode-Root'; // 'TNode-Root'
    eventNodes = rootEventNodes;
  } else {
    // Create regular flow TNode
    const result = repository.brainCommands.createFlowTNode(
      flowId,
      eventTNodeId,
      systemActor,
    );
    if (!result.success) {
      throw new Error(`Failed to create flow TNode: ${result.error}`);
    }
    const { flowTNode, eventNodes: flowEventNodes } = result.data;
    actualFlowId = flowId;
    flowTNodeId = flowTNode.id;
    eventNodes = flowEventNodes;
    
    // Resolve entry parameter for nested flows
    if (executionContext && flowId) {
      // Get the flow node to access its fieldMappings
      const flowNode = qx(flowId).pickAll()[0] as unknown as NodeEntity | undefined;
      
      if (flowNode && flowNode.nodeType === 'flow') {
        // Prepare node attributes to resolve field mappings
        const nodeAttributes = prepareNodeAttributes(flowNode, executionContext);
        
        // Extract the entry parameter if it was mapped
        if (nodeAttributes.entry !== undefined) {
          entryData = nodeAttributes.entry;
          // logger.debug(`Resolved entry parameter for flow ${flowId}:`, entryData);
        }
      }
    }
  }

  const eventHandlers: Record<string, any> = {};

  // Add event listeners
  eventNodes.forEach((node) => {
    eventHandlers[node.eventType] = {
      actions: ['handleTrackEvent', 'incrementChildCount'],
    };
  });

  return {
    tNodeId: flowTNodeId,
    machine: setup({
      types: {
        context: {} as TNodeFlowMachineContext,
        events: {} as
          | ChildCompletedEvent
          | {
              type: string;
              [key: string]: any;
            },
        input: {} as TNodeFlowMachineInput,
      },
      actions: {
        handleTrackEvent: enqueueActions(({ context, event, enqueue, self }) => {
          const eventType = event.type;
          const eventNode = context.eventNodes.find(
            (n) => n.eventType === eventType,
          );

          if (!eventNode) return;

          logger.debug(`${context.flowId} received event: ${eventType}`);

          const firstStep = repository.brainQueries.eventFirstStep(eventNode.id!);

          if (firstStep) {
            const eventTNodeResult = repository.brainCommands.createEventTNode(eventNode, flowTNodeId, self);
            if (!eventTNodeResult.success) {
              throw new Error(`Failed to create event TNode: ${eventTNodeResult.error}`);
            }
            const eventTNode = eventTNodeResult.data;

            // Create execution context with cleaner structure
            const { type, ...eventData } = event;
            
            const eventTrackContext: ExecutionContext = {
              event: {
                type: eventType,
                data: eventData,
                timestamp: Date.now(),
              },
              steps: [],
              lastStep: undefined,
            };

            logger.debug(`Event ${eventType} received:`, {
              eventData,
              contextStructure: {
                'event.type': eventType,
                'event.data': eventData,
                'steps.length': 0
              }
            });

            // Store the execution context for this event track
            enqueue.assign({
              eventTrackContexts: ({ context }) => ({
                ...context.eventTrackContexts,
                [eventTNode.id]: eventTrackContext,
              }),
            });

            // Spawn child based on node type
            const [machine, systemId] = createChildNode(firstStep, eventTNode.id, eventTrackContext, self);
            enqueue.spawnChild(machine, { 
              systemId, 
              input: { executionContext: eventTrackContext } 
            });
          }
        }),
        incrementChildCount: assign({
          activeChildrenCount: ({ context, event }) => {
            const eventNode = context.eventNodes.find(
              (n) => n.eventType === event.type,
            );
            const firstStep = eventNode
              ? repository.brainQueries.eventFirstStep(eventNode.id!)
              : null;
            return firstStep
              ? context.activeChildrenCount + 1
              : context.activeChildrenCount;
          },
        }),
        handleChildCompletion: enqueueActions(({ context, event, enqueue, self }) => {
          logger.debug(`Child completed in flow ${context.flowId}:`, { event });
          const typedEv = typeOf('CHILD_COMPLETED', event as any);
          const decremented = Math.max(0, context.activeChildrenCount - 1);
          
          // Check if this child has a next node (only for step completions)
          const hasNextNode = typedEv.eventTNodeId && typedEv.stepId
            ? repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId)
            : false;
          
          // Update execution context if this was a step completion
          let eventTrackContexts = context.eventTrackContexts;
          let executionContext: ExecutionContext | undefined;
          
          if (typedEv.eventTNodeId && typedEv.stepId) {
            executionContext = context.eventTrackContexts[typedEv.eventTNodeId];
            if (executionContext) {
              const newStep = {
                id: typedEv.stepId,
                label: typedEv.stepLabel || '',
                result: typedEv.result,
                timestamp: Date.now(),
              };
              
              const updatedContext: ExecutionContext = {
                ...executionContext,
                steps: [...executionContext.steps, newStep],
                lastStep: newStep,
              };
              
              eventTrackContexts = {
                ...context.eventTrackContexts,
                [typedEv.eventTNodeId]: updatedContext,
              };
              executionContext = updatedContext;
            }
          }
          
          // Update state
          enqueue.assign({
            activeChildrenCount: hasNextNode ? decremented + 1 : decremented,
            eventTrackContexts,
            // Capture result if:
            // 1. Child has final flag (step or flow), OR
            // 2. It's a step with no next nodes
            finalResult: typedEv.result !== undefined && 
              (typedEv.final || (typedEv.eventTNodeId && !hasNextNode))
              ? typedEv.result
              : context.finalResult,
          });
          
          // Spawn next node if there is one
          if (hasNextNode && typedEv.eventTNodeId && typedEv.stepId && executionContext) {
            const nextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId);
            
            logger.debug(`Spawning next node after ${typedEv.stepId}:`, {
              nextNodeId: nextNode?.id,
              nextNodeType: nextNode?.nodeType,
              nextNodeLabel: nextNode?.label,
              eventTNodeId: typedEv.eventTNodeId
            });
            
            const [nextMachine, nextSystemId] = createChildNode(nextNode, typedEv.eventTNodeId, executionContext, self);
            enqueue.spawnChild(nextMachine, { 
              systemId: nextSystemId, 
              input: { executionContext } 
            });
          }
        }),
        markFlowCompleted: ({ context, self }) => {
          repository.brainCommands.updateTNodeStatus(flowTNodeId, 'completed', eventTNodeId, self);
        },
        notifyParentOfCompletion: sendParent(({ context }) => ({
          type: 'CHILD_COMPLETED',
          stepId: context.flowId,
          eventTNodeId: context.eventTNodeId,
          result: context.finalResult,
          final: true,
        })),
        raiseEntryEvent: raise(({ context }) => ({
          type: 'flow.entry',
          ...(context.entryData !== undefined && { data: context.entryData })
        })),
      },
      guards: {
        flowCompleted: ({ event, context }) => {
          const typedEv = typeOf('CHILD_COMPLETED', event as any);
          
          // If it's a step with final flag, the flow is complete
          if (typedEv.final) return true;
          
          // If it's not a step completion (no eventTNodeId), ignore
          if (!typedEv.eventTNodeId || !typedEv.stepId) return false;
          
          // Flow is complete if there are no next nodes nor active children
          const hasNextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId);
          return !hasNextNode && context.activeChildrenCount === 0;
        },
      },
    }).createMachine({
      id: isRootFlow ? brainBus : `tnode-${flowTNodeId}`,
      initial: 'active',
      context: ({ input }: any) => ({
        flowId: actualFlowId,
        eventTNodeId: flowTNodeId,
        eventNodes: eventNodes,
        activeChildrenCount: 0,
        eventTrackContexts: {},
        finalResult: undefined,
        entryData: entryData,
      }),
      on: {
        ...eventHandlers,
        CHILD_COMPLETED: [
          {
            guard: 'flowCompleted',
            target: '.completed',
          },
          {
            actions: ['handleChildCompletion'],
          },
        ],
      },
      states: {
        active: {
          entry: ['raiseEntryEvent'],
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

