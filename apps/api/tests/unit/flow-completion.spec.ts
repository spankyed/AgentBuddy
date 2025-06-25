import { describe, it, expect } from 'vitest';
import { createFlowMachine } from '@/systems/brain/runner/machines/flow-machine';
import { createActor } from 'xstate';

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
    
    const actor = createActor(flowMachine, {
      input: {
        flowId: 'test-flow',
        parentTNodeId: 'parent-tnode',
        eventNodes: [{ id: 'event-1', eventType: 'some_event', mode: 'internal', label: 'Event' }],
        executionContext: {},
        systemActor: null,
      }
    });
    
    actor.subscribe({
      complete: () => {
        expect(true).toBe(true); // Flow completed
        done();
      }
    });
    
    actor.start();
    
    // Manually set activeChildrenCount to simulate an active child
    actor.getSnapshot().context.activeChildrenCount = 1;
    
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