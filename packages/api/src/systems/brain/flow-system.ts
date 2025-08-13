import { setup, sendParent, assign, enqueueActions, log, raise } from 'xstate';
import type { ListenNode, NodeEntity } from '@/systems/flows/config/types';
import { repository } from '@/repository';
import { createStepNodeSystem } from './step-system';
import { EARS, ExecutionContext, TNodeEntity } from '@/types';
import { safeEvents } from '@/core/utils/actor-helpers';
import { brain, brainBus } from './system';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('flow-machine');

type TNodeFlowMachineContext = {
  flowId: EARS.EntityId;
  flowLabel: string;
  eventTNodeId?: EARS.EntityId;
  eventNodes: ListenNode[];
  activeChildrenCount: number;
  // Map of event track execution contexts by eventTNodeId
  eventTrackContexts: Record<EARS.EntityId, ExecutionContext>;
  // Final result when a step completes with final flag
  finalResult?: any;
  // Entry data for nested flows (resolved from field mappings)
  entryData?: any;
  // Whether this flow node itself is marked as final
  isFinalStep?: boolean;
};

type ChildCompletedEvent =
  | {
      type: 'CHILD_COMPLETED';
      stepId?: EARS.EntityId;
      tNodeId?: EARS.EntityId;
      stepLabel?: string;
      result?: any;
      final?: boolean;
      eventTNodeId?: EARS.EntityId;
      isFlow?: boolean; // Simple flag to indicate if completing child was a flow
    }
  | { type: 'CANCEL_FLOW' }
  | { type: 'TNODE_UPDATED'; data: { tNodeId: EARS.EntityId; status: string; eventTNodeId?: EARS.EntityId } };

type TNodeFlowMachineInput = {};

const typeOf = safeEvents<ChildCompletedEvent>();

/**
 * Creates a child node (flow or step) and returns the machine, system ID, and tNode
 * @param stepOrFlowNode - The node entity to create
 * @param eventTNodeId - The event track node ID that spawned this node
 * @param executionContext - The execution context for the step
 * @returns Tuple of [machine, systemId, tNode]
 */
function createChildNode(
  stepOrFlowNode: NodeEntity,
  eventTNodeId: EARS.EntityId,
  executionContext?: ExecutionContext,
) {
  if (!stepOrFlowNode?.id) {
    throw new Error(`Invalid node passed to createChildNode: ${JSON.stringify(stepOrFlowNode)}`);
  }
  
  const isFlowNode = stepOrFlowNode.nodeType === 'flow';
  const { machine, tNodeId, tNode } = isFlowNode
    ? createFlowNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext)
    : createStepNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext);

  const systemId = `${isFlowNode ? 'flow' : 'step'}-tnode-${tNodeId}`;

  return [machine, systemId, tNode] as const;
}

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
export function createFlowNodeSystem(
  flowId?: EARS.EntityId,
  eventTNodeId?: EARS.EntityId,
  executionContext?: ExecutionContext,
) {
  // Handle TNode creation
  let actualFlowId: EARS.EntityId;
  let flowTNodeId: EARS.EntityId;
  let flowTNode: TNodeEntity | undefined;
  let eventNodes: ListenNode[];

  const isRootFlow = !flowId;

  if (isRootFlow) {
    // Create root flow TNode
    const result = repository.brainCommands.createRootFlowTNode();
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
    flowTNode = rootFlowTNode;
    eventNodes = rootEventNodes;
  } else {
    // Create regular flow TNode
    const result = repository.brainCommands.createFlowTNode(
      flowId,
      eventTNodeId,
      executionContext
    );
    if (!result.success) {
      throw new Error(`Failed to create flow TNode: ${result.error}`);
    }
    const { flowTNode: createdFlowTNode, eventNodes: flowEventNodes } = result.data;
    actualFlowId = flowId;
    flowTNodeId = createdFlowTNode.id;
    flowTNode = createdFlowTNode;
    eventNodes = flowEventNodes;
  }
  

  const eventHandlers: Record<string, any> = {};

  // Add event listeners
  eventNodes.forEach((node) => {
    eventHandlers[node.eventType] = {
      actions: ['handleTrackEvent'],
    };
  });

  return {
    tNodeId: flowTNodeId,
    tNode: flowTNode,
    machine: setup({
      types: {
        context: {} as TNodeFlowMachineContext,
        events: {} as
          | ChildCompletedEvent
          | { type: 'FLOW_COMPLETE' }
          | {
              type: string;
              [key: string]: any;
            },
        input: {} as TNodeFlowMachineInput,
      },
      actions: {
        handleTrackEvent: enqueueActions(({ context, event, enqueue, system }) => {
          const eventType = event.type;
          const eventNode = context.eventNodes.find(
            (n) => n.eventType === eventType,
          );

          if (!eventNode) return;

          const firstStep = repository.brainQueries.eventFirstStep(eventNode.id!);

          if (!firstStep) {
            logger.warn(`Failed to handle event ${eventType}: No first step found to execute in response`);
            return;
          }

          const eventTNodeResult = repository.brainCommands.createEventTNode(eventNode, flowTNodeId);
          if (!eventTNodeResult.success) {
            throw new Error(`Failed to create event TNode: ${eventTNodeResult.error}`);
          }
          const eventTNode = eventTNodeResult.data;
          
          // Emit TNODE_SPAWNED event for UI to display event TNode
          system.get(brain).send({
            type: 'TNODE_SPAWNED',
            tNode: eventTNode,
            parentId: flowTNodeId,
            eventTNodeId: eventTNode.id
          });

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

          logger.debug(`${context.flowId} received event: ${eventType}. Will begin handling.`,
            { eventData }
          );

          // Spawn child based on node type
          const [machine, systemId, childTNode] = createChildNode(firstStep, eventTNode.id, eventTrackContext);
          enqueue.spawnChild(machine, {
            systemId,
          });
          
          // Emit TNODE_SPAWNED event for the UI to display child node
          system.get(brain).send({
            type: 'TNODE_SPAWNED',
            tNode: childTNode,
            parentId: eventTNode.id,
            eventTNodeId: eventTNode.id
          });


          // Store the execution context for this event track and increment child count
          enqueue.assign({
            eventTrackContexts: ({ context }) => ({
              ...context.eventTrackContexts,
              [eventTNode.id]: eventTrackContext,
            }),
            activeChildrenCount: ({ context }) => context.activeChildrenCount + 1,
          });
        }),
        handleChildCompletion: enqueueActions(({ context, event, enqueue, system }) => {
          logger.debug(`Child completed in flow - ${context.flowLabel}:`, { completion: event });
          const typedEv = typeOf('CHILD_COMPLETED', event as any);
          const decremented = Math.max(0, context.activeChildrenCount - 1);
          
          // Log when we receive a completion with final flag
          if (typedEv.final) {
            logger.debug(`Flow ${context.flowId} received child completion with final=true from ${typedEv.stepId}`);
          }
          
          if (!typedEv.stepId || !typedEv.eventTNodeId) {
            logger.warn(`Child completed in flow - ${context.flowLabel}: But missing step or event TNode ID`, { completion: event });
            return;
          }

          const hasNextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId);

          let trackExecutionContext = context.eventTrackContexts[typedEv.eventTNodeId];
          if (!trackExecutionContext) {
            logger.warn(`Child completed in flow - ${context.flowLabel}: But no execution context found for event TNode ID ${typedEv.eventTNodeId}`, { completion: event });
            return;
          }

          const lastStep = {
            id: typedEv.stepId,
            tNodeId: typedEv.tNodeId,
            label: typedEv.stepLabel || '',
            result: typedEv.result,
            timestamp: Date.now(),
          };

          const updatedContext: ExecutionContext = {
            ...trackExecutionContext,
            steps: [...trackExecutionContext.steps, lastStep],
            lastStep,
          };

          const updatedEventTrackContexts = {
            ...context.eventTrackContexts,
            [typedEv.eventTNodeId]: updatedContext,
          };
        
          // Check if flow should complete (do this AFTER state update)
          const shouldComplete = typedEv.final ||
            (decremented === 0 && !hasNextNode);
          
          enqueue.assign({
            activeChildrenCount: hasNextNode ? decremented + 1 : decremented,
            eventTrackContexts: updatedEventTrackContexts,
            finalResult: shouldComplete && typedEv.result !== undefined
              ? typedEv.result
              : context.finalResult,
          });
          
          
          if (shouldComplete) {
            enqueue.raise({ type: 'FLOW_COMPLETE' });
          } else if (hasNextNode) {
            // Spawn next node if there is one
            const nextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId);
            
            // logger.debug(`Spawning next node after ${typedEv.stepId}:`, {
            //   nextNodeId: nextNode?.id,
            //   nextNodeType: nextNode?.nodeType,
            //   nextNodeLabel: nextNode?.label,
            //   eventTNodeId: typedEv.eventTNodeId
            // });
            
            const [nextMachine, nextSystemId, nextTNode] = createChildNode(nextNode, typedEv.eventTNodeId, updatedContext);
            enqueue.spawnChild(nextMachine, { 
              systemId: nextSystemId, 
            });
            
            // Emit TNODE_SPAWNED event for the next node
            system.get(brain).send({
              type: 'TNODE_SPAWNED',
              tNode: nextTNode,
              parentId: typedEv.eventTNodeId,
              eventTNodeId: typedEv.eventTNodeId
            });
          }
        }),
        markFlowCompleted: ({ system, context }) => {
          logger.debug(`Flow ${context.flowId} completed (isFinalStep: ${context.isFinalStep})`);
          repository.brainCommands.updateTNodeStatus(flowTNodeId, 'completed');
          
          // Emit TNODE_UPDATED event
          system.get(brain).send({
            type: 'TNODE_UPDATED',
            data: { 
              tNodeId: flowTNodeId, 
              status: 'completed', 
              eventTNodeId: eventTNodeId 
            }
          });
        },
        notifyParentOfCompletion: sendParent(({ context }) => ({
          type: 'CHILD_COMPLETED',
          stepId: context.flowId,
          eventTNodeId: context.eventTNodeId,
          result: context.finalResult,
          // Only send final: true if this flow node itself was marked as final
          final: context.isFinalStep,
        })),
        raiseEntryEvent: raise(({ context }) => ({
          type: 'flow.entry',
          ...(context.entryData !== undefined && { data: context.entryData })
        })),
        forwardTNodeUpdate: sendParent(({ event }) => event),
      },
      guards: {},
    }).createMachine({
      id: isRootFlow ? brainBus : `tnode-${flowTNodeId}`,
      initial: 'active',
      context: ({ input }: any) => ({
        flowId: actualFlowId,
        flowLabel: flowTNode?.label || 'Unknown Flow',
        eventTNodeId: eventTNodeId,
        eventNodes: eventNodes,
        activeChildrenCount: 0,
        eventTrackContexts: {},
        finalResult: undefined,
        entryData: flowTNode?.nodeAttributes?.params,
        isFinalStep: flowTNode?.final || false,
      }),
      on: {
        ...eventHandlers,
        CHILD_COMPLETED: {
          actions: ['handleChildCompletion'],
        },
        TNODE_UPDATED: {
          actions: ['forwardTNodeUpdate'],
        },
        FLOW_COMPLETE: {
          target: '.completed',
        },
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

