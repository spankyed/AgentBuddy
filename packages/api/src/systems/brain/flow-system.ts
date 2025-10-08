import { setup, sendParent, assign, enqueueActions, log, raise } from 'xstate';
import type { ListenNode, NodeEntity } from '@/systems/flows/config/types';
import { repository } from '@/repository';
import { createStepNodeSystem } from './step-system';
import { EARS, ExecutionContext, TNodeEntity } from '@/types';
import { safeEvents } from '@/core/utils/actor-helpers';
import { brain, brainBus } from './system';
import { brainDebug, brainLogger } from './utils/brain-debug';

/**
 * Flow Actor Registry
 * Maps flowTNodeId (instance ID) to actor reference for event routing
 */
const flowActorRegistry = new Map<EARS.EntityId, any>();

/**
 * Get flow actor from registry by flowTNodeId
 */
export function getFlowActor(flowTNodeId: EARS.EntityId): any | undefined {
  return flowActorRegistry.get(flowTNodeId);
}

/**
 * Get all registered flow actors for global event broadcasting
 */
export function getAllFlowActors(): any[] {
  return Array.from(flowActorRegistry.values());
}

/**
 * Get all registered flow actor IDs for debugging/logging
 */
export function getAllFlowActorIds(): EARS.EntityId[] {
  return Array.from(flowActorRegistry.keys());
}

type TNodeFlowMachineContext = {
  flowId: EARS.EntityId;
  flowLabel: string;
  flowStepNodeId?: EARS.EntityId;  // The original flow step node ID (for completion tracking)
  flowStepLabel?: string;  // The flow step node label (for $.steps[label] references)
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
  // Flow hierarchy tracking
  hasParent: boolean; // Whether this flow has a parent flow
  isRootFlow: boolean; // Flag to identify root flow
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
  | { type: 'TNODE_UPDATED'; data: { tNodeId: EARS.EntityId; status: string; eventTNodeId?: EARS.EntityId } }
  | { type: 'FIRE_LOCAL_EVENT'; eventType: string; payload?: any };

type TNodeFlowMachineInput = {};

const typeOf = safeEvents<ChildCompletedEvent>();

/**
 * Creates a child node (flow or step) and returns the machine, system ID, and tNode
 * @param stepOrFlowNode - The node entity to create
 * @param eventTNodeId - The event track node ID that spawned this node
 * @param executionContext - The execution context for the step
 * @param hasParent - Whether this child has a parent flow (for child flows)
 * @returns Tuple of [machine, systemId, tNode]
 */
function createChildNode(
  stepOrFlowNode: NodeEntity,
  eventTNodeId: EARS.EntityId,
  executionContext?: ExecutionContext,
  hasParent: boolean = false,
) {
  if (!stepOrFlowNode?.id) {
    throw new Error(`Invalid node passed to createChildNode: ${JSON.stringify(stepOrFlowNode)}`);
  }

  const isFlowNode = stepOrFlowNode.nodeType === 'flow';
  const { machine, tNodeId, tNode } = isFlowNode
    ? createFlowNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext, hasParent)
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
  hasParent: boolean = false,
) {
  const isRootFlow = !flowId;

  // Use ternary to determine which creation function to call
  const result = isRootFlow
    ? (() => {
      const { rootFlow, rootFlowTNode, eventNodes } = repository.brainCommands.createRootFlowTNode();
      return {
        actualFlowId: rootFlow.id,
        flowTNodeId: rootFlowTNode.id || 'TNode-Root',
        flowTNode: rootFlowTNode,
        eventNodes
      };
    })()
    : (() => {
      const { flowTNode, eventNodes } = repository.brainCommands.createFlowTNode(
        flowId,
        eventTNodeId,
        executionContext
      );
      console.log('[DEBUG] eventNodes: ', eventNodes);
      return {
        actualFlowId: flowId,
        flowTNodeId: flowTNode.id,
        flowTNode,
        eventNodes
      };
    })();

  const { actualFlowId, flowTNodeId, flowTNode, eventNodes } = result;


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
        registerFlowActor: ({ self }) => {
          // Register this flow actor in the registry for event routing
          flowActorRegistry.set(flowTNodeId, self);
          brainDebug(`Registered flow actor: ${flowTNodeId}`);
        },
        unregisterFlowActor: () => {
          // Clean up this flow actor from the registry
          flowActorRegistry.delete(flowTNodeId);
          brainDebug(`Unregistered flow actor: ${flowTNodeId}`);
        },
        handleTrackEvent: enqueueActions(({ context, event, enqueue, system, self }) => {
          console.log('handleTrackEvent: ', {
            event,
            eventNodes: context.eventNodes,
          });
          const typedEv = event as { type: string; [key: string]: any };

          const eventType = typedEv.type;

          // Get ALL event nodes matching this event type (not just the first)
          const matchingEventNodes = context.eventNodes.filter(
            (n) => n.eventType === eventType,
          );

          if (matchingEventNodes.length === 0) return;

          // Process ALL matching event nodes
          let spawnedCount = 0;

          for (const eventNode of matchingEventNodes) {
            const firstStep = repository.brainQueries.eventFirstStep(eventNode.id!);

            if (!firstStep) {
              brainLogger.warn(`Failed to handle event ${eventType} for node ${eventNode.id}: No first step found to execute in response`);
              continue; // Skip this event node but process others
            }

            const eventTNode = repository.brainCommands.createEventTNode(eventNode, flowTNodeId);

            // Create execution context with cleaner structure
            // Handle flow.entry events specially - they have a 'data' property we need to unwrap
            const { type, ...eventPayload } = typedEv;
            const eventData = 'data' in eventPayload ? eventPayload.data : eventPayload;

            // Store event payload directly as nodeAttributes for event TNodes
            // Use the full eventData if no specific payload property exists
            const payloadToStore = eventData.payload !== undefined ? eventData.payload : eventData;
            repository.brainCommands.updateTNodeAttributes(eventTNode.id, payloadToStore);

            // Emit TNODE_SPAWNED event for UI to display event TNode
            system.get(brain).send({
              type: 'TNODE_SPAWNED',
              tNode: eventTNode,
              parentId: flowTNodeId,
              eventTNodeId: eventTNode.id,
              flowTNodeId: flowTNodeId
            });

            const eventTrackContext: ExecutionContext = {
              flowTNodeId: flowTNodeId,
              event: {
                type: eventType,
                data: eventData,
                timestamp: Date.now(),
              },
              steps: [],
              lastStep: undefined,
            };

            brainDebug(`${flowTNodeId} received event: ${eventType} for node ${eventNode.id}. Will begin handling.`,
              { eventData, eventNodeId: eventNode.id }
            );

            // Spawn child based on node type (pass true if it's a flow to indicate it has a parent)
            const isFlow = firstStep.nodeType === 'flow';
            const [machine, systemId, childTNode] = createChildNode(
              firstStep,
              eventTNode.id,
              eventTrackContext,
              isFlow ? true : false
            );

            // Spawn child (both flows and steps)
            enqueue.spawnChild(machine, {
              systemId,
              input: {} // Add empty input to satisfy TypeScript
            });

            // Emit TNODE_SPAWNED event for the UI to display child node
            system.get(brain).send({
              type: 'TNODE_SPAWNED',
              tNode: childTNode,
              parentId: eventTNode.id,
              eventTNodeId: eventTNode.id,
              flowTNodeId: flowTNodeId
            });

            // Store the execution context for this event track
            enqueue.assign({
              eventTrackContexts: ({ context }) => ({
                ...context.eventTrackContexts,
                [eventTNode.id]: eventTrackContext,
              }),
            });

            spawnedCount++;
          }

          // Update activeChildrenCount for all spawned children at once
          if (spawnedCount > 0) {
            enqueue.assign({
              activeChildrenCount: ({ context }) => context.activeChildrenCount + spawnedCount,
            });
          }
        }),
        handleChildCompletion: enqueueActions(({ context, event, enqueue, system }) => {
          brainDebug(`Child completed in flow - ${context.flowLabel}:`, { completion: event });
          const typedEv = typeOf('CHILD_COMPLETED', event as any);
          const decremented = Math.max(0, context.activeChildrenCount - 1);

          // Log when we receive a completion with final flag
          if (typedEv.final) {
            brainDebug(`Flow ${flowTNodeId} received child completion with final=true from ${typedEv.stepId || typedEv.tNodeId}`);
          }

          if (!typedEv.eventTNodeId) {
            brainLogger.warn(`Child completed in flow - ${context.flowLabel}: But missing event TNode ID`, { completion: event });
            return;
          }

          // Only check for next node if we have a blueprint stepId (flows with no blueprint have no next step)
          const hasNextNode = typedEv.stepId
            ? repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId)
            : null;

          let trackExecutionContext = context.eventTrackContexts[typedEv.eventTNodeId];
          if (!trackExecutionContext) {
            brainLogger.warn(`Child completed in flow - ${context.flowLabel}: But no execution context found for event TNode ID ${typedEv.eventTNodeId}`, { completion: event });
            return;
          }

          const lastStep = {
            id: typedEv.tNodeId,          // Trace TNode ID (always present)
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

          // For flow results: if completing, use the result from the completing step
          // If no result from this step, keep any existing finalResult
          const flowResult = shouldComplete && typedEv.result !== undefined
            ? typedEv.result
            : context.finalResult;

          enqueue.assign({
            activeChildrenCount: hasNextNode ? decremented + 1 : decremented,
            eventTrackContexts: updatedEventTrackContexts,
            finalResult: flowResult,
          });


          if (shouldComplete) {
            enqueue.raise({ type: 'FLOW_COMPLETE' });
          } else if (hasNextNode) {
            // Spawn next node if there is one (stepId guaranteed to exist here due to hasNextNode check)
            const nextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId!);

            // brainDebug(`Spawning next node after ${typedEv.stepId}:`, {
            //   nextNodeId: nextNode?.id,
            //   nextNodeType: nextNode?.nodeType,
            //   nextNodeLabel: nextNode?.label,
            //   eventTNodeId: typedEv.eventTNodeId
            // });

            const isNextFlow = nextNode.nodeType === 'flow';
            const [nextMachine, nextSystemId, nextTNode] = createChildNode(
              nextNode,
              typedEv.eventTNodeId,
              updatedContext,
              isNextFlow ? true : false
            );

            // Spawn next child (both flows and steps)
            enqueue.spawnChild(nextMachine, {
              systemId: nextSystemId,
              input: {} // Add empty input to satisfy TypeScript
            });

            // Emit TNODE_SPAWNED event for the next node
            system.get(brain).send({
              type: 'TNODE_SPAWNED',
              tNode: nextTNode,
              parentId: typedEv.eventTNodeId,
              eventTNodeId: typedEv.eventTNodeId,
              flowTNodeId: flowTNodeId
            });
          }
        }),
        markFlowCompleted: ({ system, context }) => {
          brainDebug(`Flow ${flowTNodeId} completed (isFinalStep: ${context.isFinalStep})`);
          repository.brainCommands.updateTNodeStatus(flowTNodeId, 'completed');
          
          // Save the flow's result to nodeAttributes so it appears in the details panel
          if (context.finalResult !== undefined) {
            repository.brainCommands.updateTNodeResult(flowTNodeId, context.finalResult);
          }

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
          stepId: context.flowStepNodeId,  // Blueprint Node ID (undefined for root flow)
          tNodeId: flowTNodeId,             // Trace TNode ID (always defined)
          stepLabel: context.flowStepLabel,
          eventTNodeId: context.eventTNodeId,
          result: context.finalResult,
          final: context.isFinalStep,
          isFlow: true,  // Indicate this is a flow completion
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
        flowStepNodeId: flowTNode?.blueprint?.nodeId,  // Store the original flow step node ID
        flowStepLabel: flowTNode?.label,  // Store the flow step node label for references
        eventTNodeId: eventTNodeId,
        eventNodes: eventNodes,
        activeChildrenCount: 0,
        eventTrackContexts: {},
        finalResult: undefined,
        entryData: flowTNode?.nodeAttributes,  // Use full nodeAttributes, not just params
        isFinalStep: flowTNode?.final || false,
        hasParent: hasParent,
        isRootFlow: isRootFlow,
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
        // Handle local events that are fired within this flow
        FIRE_LOCAL_EVENT: {
          actions: [({ event, self }) => {
            const typedEvent = event as { type: 'FIRE_LOCAL_EVENT'; eventType: string; payload?: any };
            // Re-raise the event locally for handling
            if (typedEvent.eventType) {
              self.send({
                type: typedEvent.eventType,
                ...(typedEvent.payload || {})
              });
            }
          }]
        },
      },
      states: {
        active: {
          entry: ['registerFlowActor', 'raiseEntryEvent'],
          on: {
            CANCEL_FLOW: 'completed',
          },
        },
        completed: {
          entry: ['markFlowCompleted', 'notifyParentOfCompletion', 'unregisterFlowActor'],
          type: 'final',
        },
      },
    })
  }
}

