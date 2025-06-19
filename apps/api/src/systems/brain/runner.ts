import { setup, createActor, sendTo, type ActorRefFrom, assign, sendParent } from 'xstate';
import { qx } from '@/shared/ears/helpers/query';
import { tx } from '@/shared/ears/helpers/transaction';
import { EARS } from '@/shared/ears/types';
import type { FlowEntity, NodeEntity, ListenNode, FlowNode } from '@/systems/flows/types';
import type { TNodeEntity, EventReceived } from './types';
import { emit } from '@/shared/utils/actor-helpers';
import { bus } from '@/systems/_backend/backend';
import { brain } from './system';

interface ExecutionContext {
  [key: string]: any;
  eventPayload?: any;
  previousResults?: any[];
}

interface BrainRunnerContext {
  rootFlow: FlowEntity;
  eventNodes: ListenNode[];
  currentTNode?: TNodeEntity;
  systemActor?: any;
}

interface FlowMachineContext {
  flowId: EARS.EntityId;
  parentTNodeId?: EARS.EntityId;
  eventNodes: ListenNode[];
  executionContext: ExecutionContext;
  systemActor?: any;
  activeChildren: Map<string, ActorRefFrom<any>>;
}

interface StepMachineContext {
  node: NodeEntity;
  parentTNodeId?: EARS.EntityId;
  tNodeId?: EARS.EntityId;
  executionContext: ExecutionContext;
  systemActor?: any;
}

/**
 * Get the root flow and its event listener nodes
 */
function getRootFlowData() {
  // Get root flow
  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(["id", "label", "flowType", "status", "createdAt"]) as FlowEntity | undefined;
    
  if (!rootFlow) {
    throw new Error("No root flow found");
  }

  // Get all nodes that have EVENT_TRACE relation from the root flow
  const eventNodes = qx(rootFlow.id)
    .linksPick(
      EARS.RelKind.EVENT_TRACE,
      ["id", "nodeType", "label", "eventType", "mode"] as const,
      [EARS.Entity.Node]
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];

  // Find the entry event node
  const entryNode = eventNodes.find(node => 
    qx(node.id!).hasRole(EARS.RoleKind.Custom("entry_event"))
  );

  if (!entryNode) {
    throw new Error("No entry event node found");
  }

  return { rootFlow, eventNodes, entryNode };
}

/**
 * Create an event TNode and persist it
 */
function createEventTNode(eventNode: ListenNode, parentTNodeId?: EARS.EntityId, systemActor?: any): TNodeEntity {
  const eventTNode: TNodeEntity = {
    id: `TNode-Event-${Date.now()}` as EARS.EntityId,
    entityType: EARS.Entity.TNode,
    nodeType: 'event',
    label: eventNode.label,
    eventType: eventNode.eventType,
    status: 'active',
    startedAt: Date.now(),
    createdAt: Date.now(),
  };
  
  // Create TNode in database
  tx(eventTNode.id)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', eventTNode.nodeType)
    .put('label', eventTNode.label)
    .put('eventType', eventTNode.eventType!)
    .put('status', eventTNode.status)
    .put('startedAt', eventTNode.startedAt)
    .put('createdAt', eventTNode.createdAt);
  
  // Create TRACKED relationship from parent flow
  if (parentTNodeId) {
    tx(parentTNodeId).link(EARS.RelKind.TRACKED, eventTNode.id);
  }
  
  // Emit event about spawned event TNode
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'EVENT_TNODE_SPAWNED',
      tNode: eventTNode,
    }));
  }
  
  return eventTNode;
}

/**
 * Update TNode status in database
 */
function updateTNodeStatus(tNodeId: EARS.EntityId, status: TNodeEntity['status'], systemActor?: any) {
  tx(tNodeId).put('status', status);
  
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'TNODE_UPDATED',
      data: { tNodeId, status },
    }));
  }
}

/**
 * Spawn execution chain starting from a node
 */
function spawnExecutionChain(
  startNode: NodeEntity, 
  parentTNodeId: EARS.EntityId,
  executionContext: ExecutionContext,
  parentActor: any,
  systemActor?: any
) {
  try {
    if (startNode.nodeType === 'flow') {
      const flowActor = spawnFlowMachine(startNode.id!, parentTNodeId, executionContext, parentActor, systemActor);
      if (parentActor.context && parentActor.context.activeChildren) {
        parentActor.context.activeChildren.set(startNode.id!, flowActor);
      }
    } else {
      const stepActor = spawnStepMachine(startNode, parentTNodeId, executionContext, parentActor, systemActor);
      if (parentActor.context && parentActor.context.activeChildren) {
        parentActor.context.activeChildren.set(startNode.id!, stepActor);
      }
    }
  } catch (error) {
    console.error(`Failed to spawn execution chain for node ${startNode.id}:`, error);
    // Update parent TNode status to failed
    updateTNodeStatus(parentTNodeId, 'failed', systemActor);
  }
}

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
function createFlowMachine(flowId: EARS.EntityId, eventNodes: ListenNode[]) {
  // Build event handlers dynamically
  const eventHandlers: Record<string, any> = {};
  
  eventNodes.forEach(node => {
    eventHandlers[node.eventType] = {
      actions: 'handleFlowEvent',
    };
  });

  // Add child completion handler
  eventHandlers['CHILD_COMPLETED'] = {
    actions: 'handleChildCompletion',
  };

  return setup({
    types: {
      context: {} as FlowMachineContext,
      events: {} as any,
    },
    actions: {
      handleFlowEvent: ({ context, event, self }) => {
        const eventType = event.type;
        const eventNode = context.eventNodes.find(n => n.eventType === eventType);
        
        if (!eventNode) return;
        
        console.log(`Flow ${context.flowId} received event: ${eventType}`);
        
        // Get the responder node for this event
        const responderLinks = qx(eventNode.id!)
          .links(EARS.RelKind.RESPONDER, [EARS.Entity.Node]);
        
        if (responderLinks.length > 0) {
          const responderNode = qx(responderLinks[0].id)
            .pickOne(["id", "nodeType", "label"]) as NodeEntity;
          
          // Create event TNode first
          const eventTNode = createEventTNode(eventNode, context.parentTNodeId, context.systemActor);
          
          // Update execution context with event payload
          const updatedContext = {
            ...context.executionContext,
            eventPayload: event.payload,
            currentEvent: eventType,
          };
          
          // Spawn execution chain starting from responder
          spawnExecutionChain(responderNode, eventTNode.id, updatedContext, self, context.systemActor);
        }
      },
      
      handleChildCompletion: ({ context, event, self }) => {
        console.log(`Child completed in flow ${context.flowId}:`, event);
        // Remove completed child from active children
        if (event.childId) {
          context.activeChildren.delete(event.childId);
        }
        
        // Update execution context with child results
        if (event.result) {
          context.executionContext = { ...context.executionContext, ...event.result };
        }
        
        // Spawn next step if there is one
        if (event.nextNode && event.parentTNodeId) {
          spawnExecutionChain(event.nextNode, event.parentTNodeId, context.executionContext, self, context.systemActor);
        }
      },
    },
  }).createMachine({
    id: `flow-${flowId}`,
    initial: 'active',
    context: ({ input }: any) => ({
      flowId: input.flowId,
      parentTNodeId: input.parentTNodeId,
      eventNodes: input.eventNodes,
      executionContext: input.executionContext || {},
      systemActor: input.systemActor,
      activeChildren: new Map(),
    }),
    on: eventHandlers,
    states: {
      active: {
        // Flow is actively listening for events
      },
    },
  });
}

/**
 * Spawn a state machine for a flow node
 */
function spawnFlowMachine(
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
  const eventNodes = qx(flow.id!)
    .linksPick(
      EARS.RelKind.EVENT_TRACE,
      ["id", "nodeType", "label", "eventType", "mode"] as const,
      [EARS.Entity.Node]
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];

  // Create TNode for this flow instance
  const flowTNode: TNodeEntity = {
    id: `TNode-Flow-${Date.now()}` as EARS.EntityId,
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label: flow.label || 'Flow',
    status: 'active',
    startedAt: Date.now(),
    createdAt: Date.now(),
  };
  
  // Create TNode in database
  tx(flowTNode.id)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', flowTNode.nodeType)
    .put('label', flowTNode.label)
    .put('status', flowTNode.status)
    .put('startedAt', flowTNode.startedAt)
    .put('createdAt', flowTNode.createdAt)
    .link(EARS.RelKind.INSTANCE_OF, flow.id!);
  
  // Create SPAWNED relationship from parent
  tx(parentTNodeId).link(EARS.RelKind.SPAWNED, flowTNode.id);
  
  // Emit event about spawned flow
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'EVENT_TNODE_SPAWNED',
      tNode: flowTNode,
    }));
  }

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
 * Create a step execution machine
 */
function createStepMachine() {
  return setup({
    types: {
      context: {} as StepMachineContext,
      events: {} as { type: 'EXECUTE' } | { type: 'COMPLETE'; result?: any } | { type: 'ERROR'; error: any },
    },
    actions: {
      createStepTNode: assign({
        tNodeId: ({ context }) => {
          const stepTNode: TNodeEntity = {
            id: `TNode-Step-${Date.now()}` as EARS.EntityId,
            entityType: EARS.Entity.TNode,
            nodeType: 'step',
            label: context.node.label,
            status: 'active',
            startedAt: Date.now(),
            createdAt: Date.now(),
            stepNodeId: context.node.id,
            stepNodeType: context.node.nodeType,
          };
          
          // Create TNode in database
          tx(stepTNode.id)
            .put('entityType', EARS.Entity.TNode)
            .put('nodeType', stepTNode.nodeType)
            .put('label', stepTNode.label)
            .put('status', stepTNode.status)
            .put('startedAt', stepTNode.startedAt)
            .put('createdAt', stepTNode.createdAt)
            .put('stepNodeId', stepTNode.stepNodeId!)
            .put('stepNodeType', stepTNode.stepNodeType!);
          
          // Create SPAWNED relationship from parent
          if (context.parentTNodeId) {
            tx(context.parentTNodeId).link(EARS.RelKind.SPAWNED, stepTNode.id);
          }
          
          // Emit event about spawned step
          if (context.systemActor) {
            context.systemActor.system.get(bus).send(emit(brain, {
              type: 'EVENT_TNODE_SPAWNED',
              tNode: stepTNode,
            }));
          }
          
          return stepTNode.id;
        }
      }),
      
      executeStep: ({ context, self }) => {
        console.log(`Executing step: ${context.node.label} (${context.node.nodeType})`);
        
        // Handle different node types
        switch (context.node.nodeType) {
          case 'fire':
            // Fire nodes emit events
            const fireNode = context.node as any;
            if (fireNode.eventType && context.systemActor) {
              // For now, just log - in real implementation would emit to appropriate scope
              console.log(`Firing event: ${fireNode.eventType}`);
              setTimeout(() => {
                self.send({ type: 'COMPLETE', result: { eventFired: fireNode.eventType } });
              }, 100);
            }
            break;
            
          case 'keep_alive':
            // Keep alive nodes just maintain the flow active
            console.log('Keep alive node - flow will remain active');
            // Don't complete - keeps the flow running
            break;
            
          default:
            // Simulate async execution for other node types
            setTimeout(() => {
              self.send({ type: 'COMPLETE', result: { executed: true } });
            }, 1000);
        }
      },
      
      markCompleted: ({ context }) => {
        if (context.tNodeId) {
          updateTNodeStatus(context.tNodeId, 'completed', context.systemActor);
        }
      },
      
      markFailed: ({ context }) => {
        if (context.tNodeId) {
          updateTNodeStatus(context.tNodeId, 'failed', context.systemActor);
        }
      },
      
      notifyParent: sendParent(({ context }) => {
        // Get next node(s) via TRANSITIONS_TO relation
        const nextLinks = qx(context.node.id!)
          .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);
        
        let nextNode = undefined;
        if (nextLinks.length > 0) {
          nextNode = qx(nextLinks[0].id)
            .pickOne(["id", "nodeType", "label"]) as NodeEntity;
        }
        
        return {
          type: 'CHILD_COMPLETED',
          childId: context.node.id,
          result: context.executionContext,
          nextNode,
          parentTNodeId: context.parentTNodeId,
        };
      }),
    },
  }).createMachine({
    id: `step-machine`,
    initial: 'preparing',
    context: ({ input }) => input,
    states: {
      preparing: {
        entry: 'createStepTNode',
        always: 'executing',
      },
      executing: {
        entry: 'executeStep',
        on: {
          COMPLETE: {
            target: 'completed',
            actions: assign({
              executionContext: ({ context, event }) => ({
                ...context.executionContext,
                [`${context.node.id}_result`]: event.result,
              }),
            }),
          },
          ERROR: {
            target: 'failed',
          },
        },
      },
      completed: {
        entry: ['markCompleted', 'notifyParent'],
        type: 'final',
      },
      failed: {
        entry: ['markFailed', 'notifyParent'],
        type: 'final',
      },
    },
  });
}

/**
 * Spawn a state machine for a step node
 */
function spawnStepMachine(
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

/**
 * Main brain runner that starts when CLIENT_CONNECTED
 */
export function startBrainRunner(systemActor: any) {
  try {
    const { rootFlow, eventNodes, entryNode } = getRootFlowData();
    
    console.log('Starting brain runner with root flow:', rootFlow.label);
    console.log('Event nodes:', eventNodes.map(n => ({ 
      id: n.id, 
      eventType: n.eventType, 
      mode: n.mode 
    })));
    
    // Create root flow TNode
    const rootFlowTNode: TNodeEntity = {
      id: `TNode-1` as EARS.EntityId, // Use consistent ID for root
      entityType: EARS.Entity.TNode,
      nodeType: 'flow',
      label: rootFlow.label,
      status: 'active',
      startedAt: Date.now(),
      createdAt: Date.now(),
    };
    
    // Create root TNode in database
    tx(rootFlowTNode.id)
      .put('entityType', EARS.Entity.TNode)
      .put('nodeType', rootFlowTNode.nodeType)
      .put('label', rootFlowTNode.label)
      .put('status', rootFlowTNode.status)
      .put('startedAt', rootFlowTNode.startedAt)
      .put('createdAt', rootFlowTNode.createdAt)
      .link(EARS.RelKind.INSTANCE_OF, rootFlow.id)
      .grant(EARS.RoleKind.Custom("root_trace_node"));
    
    // Emit event about root TNode
    systemActor.system.get(bus).send(emit(brain, {
      type: 'EVENT_TNODE_SPAWNED',
      tNode: rootFlowTNode,
    }));
    
    // Create the root flow machine
    const rootFlowMachine = createFlowMachine(rootFlow.id, eventNodes);
    const rootActor = createActor(rootFlowMachine, {
      input: {
        flowId: rootFlow.id,
        parentTNodeId: rootFlowTNode.id,
        eventNodes,
        executionContext: {},
        systemActor,
      },
    });
    
    // Subscribe to completion
    rootActor.subscribe({
      complete: () => {
        console.log('Root flow completed');
        updateTNodeStatus(rootFlowTNode.id, 'completed', systemActor);
      },
      error: (error) => {
        console.error('Root flow failed:', error);
        updateTNodeStatus(rootFlowTNode.id, 'failed', systemActor);
      },
    });
    
    // Start the root flow machine
    rootActor.start();
    
    // Trigger the entry event to kick off processing
    rootActor.send({ type: entryNode.eventType });
    
    console.log('Brain runner started successfully');
    
    return rootActor;
  } catch (error) {
    console.error('Failed to start brain runner:', error);
    throw error;
  }
} 