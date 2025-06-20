import { describe, it, expect } from 'vitest';
import { createFlowMachine } from '@/systems/brain/runner/machines/flow-machine';
import { createActor } from 'xstate';
import type { NodeEntity } from '@/systems/flows/types';

describe('Flow Completion', () => {
  it('should complete flow when last child completes with no next node', (done) => {
    const flowMachine = createFlowMachine('test-flow', [
      { id: 'event-1', eventType: 'entry_event', mode: 'entry', label: 'Entry' }
    ]);
    
    const actor = createActor(flowMachine, {
      input: {
        flowId: 'test-flow',
        parentTNodeId: 'parent-tnode',
        eventNodes: [{ id: 'event-1', eventType: 'entry_event', mode: 'entry', label: 'Entry' }],
        executionContext: {},
        systemActor: null,
        isRootFlow: false,
        parentActor: null,
      }
    });
    
    actor.subscribe({
      complete: () => {
        expect(true).toBe(true); // Flow completed
        done();
      }
    });
    
    actor.start();
    
    // Simulate child completion with no next node
    actor.send({ 
      type: 'CHILD_COMPLETED', 
      childId: 'child-1',
      result: {},
      nextNode: undefined,
      parentTNodeId: 'parent-tnode'
    });
  });
  
  it('should complete flow when child with final:true blueprint completes', (done) => {
    const flowMachine = createFlowMachine('test-flow', [
      { id: 'event-1', eventType: 'some_event', mode: 'internal', label: 'Event' }
    ]);
    
    // Create a node with final flag set in blueprint
    const finalNode: NodeEntity = {
      id: 'final-node-1' as any,
      entityType: 'node' as any,
      nodeType: 'fire',
      label: 'Exit Node',
      final: true,  // Blueprint-level final flag
      createdAt: Date.now()
    };
    
    const actor = createActor(flowMachine, {
      input: {
        flowId: 'test-flow',
        parentTNodeId: 'parent-tnode',
        eventNodes: [{ id: 'event-1', eventType: 'some_event', mode: 'internal', label: 'Event' }],
        executionContext: {},
        systemActor: null,
        isRootFlow: false,
        parentActor: null,
      }
    });
    
    actor.subscribe({
      complete: () => {
        expect(true).toBe(true); // Flow completed
        done();
      }
    });
    
    actor.start();
    
    // Add a child to activeChildren
    actor.getSnapshot().context.activeChildren.set('child-1', {} as any);
    
    // Simulate child completion with final flag from blueprint
    actor.send({ 
      type: 'CHILD_COMPLETED', 
      childId: 'child-1',
      result: { 
        final: true  // This comes from the blueprint node's final property
      },
      nextNode: undefined,
      parentTNodeId: 'parent-tnode'
    });
  });
}); 