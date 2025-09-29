import { setup, sendParent, assign, enqueueActions, log, raise } from 'xstate';
import type { ListenNode, NodeEntity } from '@/systems/flows/config/types';
import { repository } from '@/repository';
import { createStepNodeSystem } from './step-system';
import { EARS, ExecutionContext, TNodeEntity } from '@/types';
import { safeEvents } from '@/core/utils/actor-helpers';
import { brain, brainBus } from './system';
import { brainDebug, brainLogger } from './utils/brain-debug';

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
        handleTrackEvent: enqueueActions(({ context, event, enqueue, system }) => {
          const eventType = event.type;
          // Get ALL event nodes matching this event type (not just the first)
          const matchingEventNodes = context.eventNodes.filter(
            (n) => n.eventType === eventType,
          );
          console.log('[DEBUG] matchingEventNodes: ', matchingEventNodes);

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
            const { type, ...eventPayload } = event;
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
              event: {
                type: eventType,
                data: eventData,
                timestamp: Date.now(),
              },
              steps: [],
              lastStep: undefined,
            };

            brainDebug(`${context.flowId} received event: ${eventType} for node ${eventNode.id}. Will begin handling.`,
              { eventData, eventNodeId: eventNode.id }
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
            brainDebug(`Flow ${context.flowId} received child completion with final=true from ${typedEv.stepId}`);
          }

          if (!typedEv.stepId || !typedEv.eventTNodeId) {
            brainLogger.warn(`Child completed in flow - ${context.flowLabel}: But missing step or event TNode ID`, { completion: event });
            return;
          }

          const hasNextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId);

          let trackExecutionContext = context.eventTrackContexts[typedEv.eventTNodeId];
          if (!trackExecutionContext) {
            brainLogger.warn(`Child completed in flow - ${context.flowLabel}: But no execution context found for event TNode ID ${typedEv.eventTNodeId}`, { completion: event });
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
            // Spawn next node if there is one
            const nextNode = repository.brainQueries.nextNodeInFlowTrack(typedEv.stepId);

            // brainDebug(`Spawning next node after ${typedEv.stepId}:`, {
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
              eventTNodeId: typedEv.eventTNodeId,
              flowTNodeId: flowTNodeId
            });
          }
        }),
        markFlowCompleted: ({ system, context }) => {
          brainDebug(`Flow ${context.flowId} completed (isFinalStep: ${context.isFinalStep})`);
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
          stepId: context.flowStepNodeId || context.flowId,  // Use flow step node ID if available
          stepLabel: context.flowStepLabel,  // Include the label for $.steps[label] references
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
        flowStepNodeId: flowTNode?.blueprint?.nodeId,  // Store the original flow step node ID
        flowStepLabel: flowTNode?.label,  // Store the flow step node label for references
        eventTNodeId: eventTNodeId,
        eventNodes: eventNodes,
        activeChildrenCount: 0,
        eventTrackContexts: {},
        finalResult: undefined,
        entryData: flowTNode?.nodeAttributes,  // Use full nodeAttributes, not just params
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

