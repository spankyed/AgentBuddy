import { setup, sendParent, assign, enqueueActions, log, raise } from 'xstate';
import type { ListenerNode, NodeEntity } from '@/systems/flows/config/types';
import { repository } from '@/repository';
import { createStepNodeSystem } from './step-system';
import { EARS, ExecutionContext, TNodeEntity } from '@/types';
import { safeEvents } from '@/core/helpers/actor-helpers';
import { brain, brainBus } from './system';
import { brainInspect, brainLogger } from './utils/brain-inspect';
import { isBrainPaused } from './utils/brain-pause';

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
  eventNodes: ListenerNode[];
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
  // Deferred next-steps when brain is paused
  pendingNextSteps: Array<{
    nextNode: NodeEntity;
    eventTNodeId: EARS.EntityId;
    executionContext: ExecutionContext;
    parentTNodeId?: EARS.EntityId;
  }>;
  // Deferred events when brain is paused (replayed on resume)
  pendingEvents: Array<Record<string, any>>;
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
  | { type: 'KILL_FLOW' }
  | { type: 'RESUME_FLOW' }
  | { type: 'TNODE_UPDATED'; data: { tNodeId: EARS.EntityId; status: string; eventTNodeId?: EARS.EntityId } }
  | { type: 'FIRE_LOCAL_EVENT'; eventType: string; payload?: any };

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
  parentTNodeId?: EARS.EntityId,
) {
  if (!stepOrFlowNode?.id) {
    throw new Error(`Invalid node passed to createChildNode: ${JSON.stringify(stepOrFlowNode)}`);
  }

  const spawnParent = parentTNodeId ?? eventTNodeId;
  const isFlowNode = stepOrFlowNode.nodeType === 'flow';
  const { machine, tNodeId, tNode } = isFlowNode
    ? createFlowNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext, true, spawnParent)
    : createStepNodeSystem(stepOrFlowNode.id, eventTNodeId, executionContext, spawnParent);

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
  parentTNodeId?: EARS.EntityId,
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
        parentTNodeId ?? eventTNodeId,
        executionContext
      );
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
    if (!node.eventType) return;
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
          brainInspect(`Registered flow actor: ${flowTNodeId}`);
        },
        unregisterFlowActor: () => {
          // Clean up this flow actor from the registry
          flowActorRegistry.delete(flowTNodeId);
          brainInspect(`Unregistered flow actor: ${flowTNodeId}`);
        },
        handleTrackEvent: enqueueActions(({ context, event, enqueue, system, self }) => {
          const typedEv = event as { type: string; [key: string]: any };
          const eventType = typedEv.type;

          // Brain is paused — defer the raw event for replay on resume
          if (isBrainPaused()) {
            enqueue.assign({
              pendingEvents: ({ context }) => [...context.pendingEvents, { ...typedEv }],
            });
            brainInspect(`Flow ${flowTNodeId} deferring event "${eventType}" (brain paused)`);
            return;
          }

          // Get ALL event nodes matching this event type (not just the first)
          const matchingEventNodes = context.eventNodes.filter(
            (n) => n.eventType === eventType,
          );

          if (matchingEventNodes.length === 0) return;

          // Process ALL matching event nodes
          let spawnedCount = 0;

          for (const eventNode of matchingEventNodes) {
            const allSteps = repository.brainQueries.eventAllSteps(eventNode.id!);

            if (allSteps.length === 0) {
              brainLogger.warn(`Failed to handle event ${eventType} for node ${eventNode.id}: No steps found to execute in response`);
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

            brainInspect(`${flowTNodeId} received event: ${eventType} for node ${eventNode.id}. Will begin handling.`,
              { eventData, eventNodeId: eventNode.id }
            );

            // Spawn ALL connected downstream steps in parallel
            for (const step of allSteps) {
              const [machine, systemId, childTNode] = createChildNode(
                step,
                eventTNode.id,
                eventTrackContext
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

              spawnedCount++;
            }

            // Store the execution context for this event track
            enqueue.assign({
              eventTrackContexts: ({ context }) => ({
                ...context.eventTrackContexts,
                [eventTNode.id]: eventTrackContext,
              }),
            });
          }

          // Update activeChildrenCount for all spawned children at once
          if (spawnedCount > 0) {
            enqueue.assign({
              activeChildrenCount: ({ context }) => context.activeChildrenCount + spawnedCount,
            });
          }
        }),
        handleChildCompletion: enqueueActions(({ context, event, enqueue, system }) => {
          brainInspect(`Child completed in flow - ${context.flowLabel}:`, { completion: event });
          const typedEv = typeOf('CHILD_COMPLETED', event as any);
          const decremented = Math.max(0, context.activeChildrenCount - 1);

          // Log when we receive a completion with final flag
          if (typedEv.final) {
            brainInspect(`Flow ${flowTNodeId} received child completion with final=true from ${typedEv.stepId || typedEv.tNodeId}`);
          }

          if (!typedEv.eventTNodeId) {
            brainLogger.warn(`Child completed in flow - ${context.flowLabel}: But missing event TNode ID`, { completion: event });
            return;
          }

          // Only check for next node if we have a blueprint stepId (flows with no blueprint have no next step)
          // If the result includes a sourceHandle, use branch routing (e.g. switch nodes).
          // If the result carries `noMatch: true` (switch node with no matching condition
          // and no else), end the chain here — nextNode is explicitly null so no downstream
          // step is spawned. Other parallel chains in the flow are unaffected.
          const sourceHandle = typedEv.result?.sourceHandle;
          const noMatch = (typedEv.result as { noMatch?: boolean } | undefined)?.noMatch === true;
          const nextNode = typedEv.stepId && !noMatch
            ? sourceHandle
              ? repository.brainQueries.nextNodeForBranch(typedEv.stepId, sourceHandle)
              : repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId)
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
            (decremented === 0 && !nextNode);

          // For flow results: if completing, use the result from the completing step
          // If no result from this step, keep any existing finalResult
          const flowResult = shouldComplete && typedEv.result !== undefined
            ? typedEv.result
            : context.finalResult;

          enqueue.assign({
            activeChildrenCount: nextNode ? decremented + 1 : decremented,
            eventTrackContexts: updatedEventTrackContexts,
            finalResult: flowResult,
          });


          if (shouldComplete) {
            enqueue.raise({ type: 'FLOW_COMPLETE' });
          } else if (nextNode && isBrainPaused()) {
            // Brain is paused — defer spawning the next step
            brainInspect(`Flow ${flowTNodeId} deferring next step (brain paused)`, { nextNodeId: nextNode.id });
            enqueue.assign({
              pendingNextSteps: ({ context }) => [
                ...context.pendingNextSteps,
                {
                  nextNode,
                  eventTNodeId: typedEv.eventTNodeId!,
                  executionContext: updatedContext,
                  parentTNodeId: typedEv.tNodeId,
                },
              ],
            });
          } else if (nextNode) {
            // Spawn next node - already computed above, no duplicate query needed
            const [nextMachine, nextSystemId, nextTNode] = createChildNode(
              nextNode,
              typedEv.eventTNodeId,
              updatedContext,
              typedEv.tNodeId
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
              parentId: typedEv.tNodeId,
              eventTNodeId: typedEv.eventTNodeId,
              flowTNodeId: flowTNodeId
            });
          }
        }),
        markFlowCompleted: ({ system, context }) => {
          brainInspect(`Flow ${flowTNodeId} completed (isFinalStep: ${context.isFinalStep})`);
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
        resumeFlowSteps: enqueueActions(({ context, enqueue, system }) => {
          brainInspect(`Flow ${flowTNodeId} resuming ${context.pendingNextSteps.length} deferred steps, ${context.pendingEvents.length} deferred events`);

          // Resume deferred next-steps
          for (const pending of context.pendingNextSteps) {
            const [machine, systemId, tNode] = createChildNode(
              pending.nextNode,
              pending.eventTNodeId,
              pending.executionContext,
              pending.parentTNodeId
            );

            enqueue.spawnChild(machine, {
              systemId,
              input: {}
            });

            system.get(brain).send({
              type: 'TNODE_SPAWNED',
              tNode,
              parentId: pending.parentTNodeId ?? pending.eventTNodeId,
              eventTNodeId: pending.eventTNodeId,
              flowTNodeId: flowTNodeId
            });
          }

          // Replay deferred events — handleTrackEvent processes them normally since brain is unpaused
          for (const pendingEvent of context.pendingEvents) {
            enqueue.raise(pendingEvent as any);
          }

          enqueue.assign({ pendingNextSteps: [], pendingEvents: [] });
        }),
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
        pendingNextSteps: [],
        pendingEvents: [],
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
        RESUME_FLOW: {
          actions: ['resumeFlowSteps'],
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
            KILL_FLOW: 'completed',
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

