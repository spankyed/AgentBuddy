import { createActor } from 'xstate';
import { getRootFlowData } from './utils/flow-data';
import { createRootFlowTNode, updateTNodeStatus } from './utils/tnode-manager';
import { createFlowMachine } from './machines/flow-machine';
import './machines/spawners'; // Initialize spawners

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
    const rootFlowTNode = createRootFlowTNode(
      rootFlow.id,
      rootFlow.label,
      systemActor
    );
    
    // Create the root flow machine
    const rootFlowMachine = createFlowMachine(rootFlow.id, eventNodes);
    const rootActor = createActor(rootFlowMachine, {
      input: {
        flowId: rootFlow.id,
        parentTNodeId: rootFlowTNode.id,
        eventNodes,
        executionContext: {},
        systemActor,
        isRootFlow: true,
        parentActor: null, // Root flow has no parent
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