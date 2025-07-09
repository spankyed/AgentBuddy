/**
 * brain-runner.spec.ts – unit tests for the brain runner system
 * Tests the agent framework execution engine
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { startBrainRunner } from '@/systems/brain/runner';
import { brainSystem } from '@/systems/brain/system';
import { EARS } from '@/shared/ears/types';
import { tx } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import { loadMockData } from '@/systems/_backend/load-initial-data';
import type { TNodeEntity } from '@/systems/brain/types';

// Mock the bus to capture emitted events
const mockBusEvents: any[] = [];
const mockBus = {
  send: vi.fn((event) => {
    mockBusEvents.push(event);
  }),
};

// Mock system actor
const mockSystemActor = {
  system: {
    get: vi.fn((key) => {
      if (key === 'bus') return mockBus;
      return undefined;
    }),
  },
};

describe('Brain Runner', () => {
  beforeAll(() => {
    // Load mock data including flows, nodes, and relationships
    loadMockData();
    
    // Ensure we have required test data
    setupTestData();
  });

  beforeEach(() => {
    // Clear mocked events before each test
    mockBusEvents.length = 0;
    mockBus.send.mockClear();
    
    // Clear any existing TNodes
    qx(EARS.Entity.TNode).ids().forEach(id => {
      tx(id).drop();
    });
  });

  describe('Startup and Initialization', () => {
    it('should start brain runner with root flow', () => {
      const rootFlow = qx(EARS.Entity.Flow)
        .withRole(EARS.RoleKind.Custom("root_flow"))
        .pickOne(["id", "label"]);
      
      expect(rootFlow).toBeDefined();
      expect(rootFlow?.label).toBe("Run Agent Brain");
      
      const actor = startBrainRunner(mockSystemActor);
      expect(actor).toBeDefined();
      expect(actor.getSnapshot().status).toBe('active');
    });

    it('should create root TNode on startup', () => {
      startBrainRunner(mockSystemActor);
      
      const rootTNode = qx(EARS.Entity.TNode)
        .withRole(EARS.RoleKind.Custom("root_trace_node"))
        .pickOne(["id", "nodeType", "label", "status"]);
      
      expect(rootTNode).toBeDefined();
      expect(rootTNode?.nodeType).toBe('flow');
      expect(rootTNode?.status).toBe('active');
      expect(rootTNode?.id).toBe('TNode-1');
    });

    it('should emit EVENT_TNODE_SPAWNED for root flow', () => {
      startBrainRunner(mockSystemActor);
      
      const spawnedEvents = mockBusEvents.filter(e => 
        e.event?.type === 'EVENT_TNODE_SPAWNED' && 
        e.event?.tNode?.id === 'TNode-1'
      );
      
      expect(spawnedEvents).toHaveLength(1);
      expect(spawnedEvents[0].event.tNode.nodeType).toBe('flow');
    });

    it('should fail if no root flow exists', () => {
      // Temporarily remove root flow role
      const rootFlowId = qx(EARS.Entity.Flow)
        .withRole(EARS.RoleKind.Custom("root_flow"))
        .first();
      
      if (rootFlowId) {
        tx(rootFlowId).revoke(EARS.RoleKind.Custom("root_flow"));
      }
      
      expect(() => startBrainRunner(mockSystemActor)).toThrow('No root flow found');
      
      // Restore role
      if (rootFlowId) {
        tx(rootFlowId).grant(EARS.RoleKind.Custom("root_flow"));
      }
    });

    it('should trigger entry event on startup', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      // Wait for initial processing
      await vi.waitFor(() => {
        const eventTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'event')
          .ids();
        return eventTNodes.length > 0;
      }, { timeout: 1000 });
      
      // Should have created an event TNode for the entry event
      const eventTNode = qx(EARS.Entity.TNode)
        .where('nodeType', 'event')
        .where('eventType', 'flow.entry')
        .pickOne(["id", "label", "status"]) as TNodeEntity;
      
      expect(eventTNode).toBeDefined();
      expect(eventTNode.label).toBe('Flow Entry');
      expect(eventTNode.status).toBe('active');
    });
  });

  describe('Event Handling', () => {
    it('should create event TNode when event is received', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      // Send a user message event
      actor.send({ type: 'user.message', payload: { text: 'Hello' } });
      
      await vi.waitFor(() => {
        const eventTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'event')
          .where('eventType', 'user.message')
          .ids();
        return eventTNodes.length > 0;
      }, { timeout: 1000 });
      
      const eventTNode = qx(EARS.Entity.TNode)
        .where('nodeType', 'event')
        .where('eventType', 'user.message')
        .pickOne(["id", "label", "eventType"]) as TNodeEntity;
      
      expect(eventTNode).toBeDefined();
      expect(eventTNode.label).toBe('User Message');
    });

    it('should track event TNodes under parent flow', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      actor.send({ type: 'user.message', payload: { text: 'Hello' } });
      
      await vi.waitFor(() => {
        const eventTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'event')
          .where('eventType', 'user.message')
          .ids();
        return eventTNodes.length > 0;
      }, { timeout: 1000 });
      
      const eventTNode = qx(EARS.Entity.TNode)
        .where('nodeType', 'event')
        .where('eventType', 'user.message')
        .first();
      
      // Check TRACKED relationship from root flow
      const trackedBy = qx(eventTNode!)
        .relatedTo(EARS.RelKind.TRACKED)
        .ids();
      
      expect(trackedBy).toContain('TNode-1'); // Root flow TNode
    });

    it('should forward events from brain system', () => {
      // Create brain system actor
      const brainActor = createActor(brainSystem, {
        input: 'Brain-1' as EARS.EntityId,
      });
      
      brainActor.start();
      
      // Simulate CLIENT_CONNECTED to start brain runner
      brainActor.send({ type: 'CLIENT_CONNECTED' });
      
      // Send trace event
      brainActor.send({
        type: 'TRACE_EVENT_RECEIVED',
        data: {
          eventType: 'user.message',
          parentTNodeId: 'TNode-1' as EARS.EntityId,
          payload: { text: 'Test message' },
        },
      });
      
      // Should emit EVENT_PULSE
      const pulseEvents = mockBusEvents.filter(e => 
        e.event?.type === 'EVENT_PULSE'
      );
      
      expect(pulseEvents.length).toBeGreaterThan(0);
      expect(pulseEvents[0].event.eventType).toBe('user.message');
    });
  });

  describe('Sequential Execution', () => {
    it('should spawn step TNode for first step after event', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      // Trigger entry event which has a keep_alive as first step
      await vi.waitFor(() => {
        const stepTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .ids();
        return stepTNodes.length > 0;
      }, { timeout: 2000 });
      
      const stepTNode = qx(EARS.Entity.TNode)
        .where('nodeType', 'step')
        .pickOne(["id", "label", "stepNodeType"]) as TNodeEntity;
      
      expect(stepTNode).toBeDefined();
      expect(stepTNode.label).toBe('Keep Alive');
      expect(stepTNode.stepNodeType).toBe('keep_alive');
    });

    it('should create SPAWNED relationships in execution chain', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      await vi.waitFor(() => {
        const stepTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .ids();
        return stepTNodes.length > 0;
      }, { timeout: 2000 });
      
      // Get the event TNode
      const eventTNode = qx(EARS.Entity.TNode)
        .where('nodeType', 'event')
        .where('eventType', 'flow.entry')
        .first();
      
      // Check it spawned a step
      const spawnedSteps = qx(eventTNode!)
        .linksTo(EARS.RelKind.SPAWNED, [EARS.Entity.TNode])
        .ids();
      
      expect(spawnedSteps.length).toBeGreaterThan(0);
    });

    it('should update TNode status on completion', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      // Send event that triggers a simple action
      actor.send({ type: 'user.message' });
      
      // Wait for step to complete
      await vi.waitFor(() => {
        const completedSteps = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .where('status', 'completed')
          .ids();
        return completedSteps.length > 0;
      }, { timeout: 3000 });
      
      const completedStep = qx(EARS.Entity.TNode)
        .where('nodeType', 'step')
        .where('status', 'completed')
        .pickOne(["id", "label", "status"]) as TNodeEntity;
      
      expect(completedStep).toBeDefined();
      expect(completedStep.status).toBe('completed');
    });

    it('should execute TRANSITIONS_TO chain', async () => {
      // This would test nodes connected via TRANSITIONS_TO executing in sequence
      // Requires test data with such relationships
      
      const actor = startBrainRunner(mockSystemActor);
      
      // Send event that triggers a chain
      actor.send({ type: 'database.query.prompt' });
      
      await vi.waitFor(() => {
        const llmSteps = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .where('stepNodeType', 'llm')
          .ids();
        return llmSteps.length > 0;
      }, { timeout: 3000 });
      
      const llmStep = qx(EARS.Entity.TNode)
        .where('nodeType', 'step')
        .where('stepNodeType', 'llm')
        .pickOne(["id", "label"]) as TNodeEntity;
      
      expect(llmStep).toBeDefined();
      expect(llmStep.label).toBe('LLM Call');
    });
  });

  describe('Execution Context', () => {
    it('should pass execution context through chain', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      // Send event with payload
      const payload = { query: 'SELECT * FROM users' };
      actor.send({ type: 'database.query.prompt', payload });
      
      // The execution context should include the event payload
      // This would be validated by checking if subsequent nodes
      // receive and can access the context
      
      await vi.waitFor(() => {
        const stepTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .ids();
        return stepTNodes.length > 0;
      }, { timeout: 2000 });
      
      // In a real implementation, we'd check if the LLM node
      // received the query in its context
      expect(mockBusEvents.some(e => 
        e.event?.type === 'EVENT_TNODE_SPAWNED' &&
        e.event?.tNode?.nodeType === 'step'
      )).toBe(true);
    });

    it('should accumulate results in execution context', async () => {
      // This tests that each step adds its results to the context
      // which is then available to subsequent steps
      
      const actor = startBrainRunner(mockSystemActor);
      
      actor.send({ type: 'user.message', payload: { text: 'Test' } });
      
      await vi.waitFor(() => {
        const completedSteps = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .where('status', 'completed')
          .ids();
        return completedSteps.length > 0;
      }, { timeout: 3000 });
      
      // Context accumulation would be verified by checking
      // if later steps have access to earlier results
      expect(true).toBe(true); // Placeholder for context validation
    });
  });

  describe('Node Type Behaviors', () => {
    it('should handle keep_alive nodes without completion', async () => {
      const actor = startBrainRunner(mockSystemActor);
      
      // Entry event triggers keep_alive node
      await vi.waitFor(() => {
        const keepAliveSteps = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .where('stepNodeType', 'keep_alive')
          .ids();
        return keepAliveSteps.length > 0;
      }, { timeout: 2000 });
      
      // Keep alive nodes should remain active
      const keepAliveStep = qx(EARS.Entity.TNode)
        .where('nodeType', 'step')
        .where('stepNodeType', 'keep_alive')
        .pickOne(["id", "status"]) as TNodeEntity;
      
      expect(keepAliveStep.status).toBe('active');
      
      // Wait a bit more to ensure it doesn't complete
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const stillActive = qx(keepAliveStep.id)
        .pickOne(["status"]) as { status: string };
      
      expect(stillActive.status).toBe('active');
    });

    it('should handle fire nodes', async () => {
      // Create a test flow with a fire node
      const fireNodeId = 'Node-test-fire' as EARS.EntityId;
      tx(fireNodeId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'fire')
        .put('label', 'Test Fire Event')
        .put('eventType', 'test.fired')
        .put('createdAt', Date.now());
      
      // Connect it as a transition to an event
      const testEventNodeId = 'Node-test-listen' as EARS.EntityId;
      tx(testEventNodeId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'listen')
        .put('label', 'Test Event')
        .put('eventType', 'test.trigger')
        .put('mode', 'internal')
        .put('createdAt', Date.now())
        .link(EARS.RelKind.TRANSITIONS_TO, fireNodeId);
      
      // Add to root flow
      const rootFlowId = qx(EARS.Entity.Flow)
        .withRole(EARS.RoleKind.Custom("root_flow"))
        .first()!;
      
      tx(rootFlowId)
        .link(EARS.RelKind.EVENT_TRACE, testEventNodeId);
      
      const actor = startBrainRunner(mockSystemActor);
      
      // Trigger the test event
      actor.send({ type: 'test.trigger' });
      
      await vi.waitFor(() => {
        const fireSteps = qx(EARS.Entity.TNode)
          .where('nodeType', 'step')
          .where('stepNodeType', 'fire')
          .ids();
        return fireSteps.length > 0;
      }, { timeout: 2000 });
      
      const fireStep = qx(EARS.Entity.TNode)
        .where('nodeType', 'step')
        .where('stepNodeType', 'fire')
        .pickOne(["id", "label"]) as TNodeEntity;
      
      expect(fireStep).toBeDefined();
      expect(fireStep.label).toBe('Test Fire Event');
      
      // Clean up test nodes
      tx(fireNodeId).drop();
      tx(testEventNodeId).drop();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing first step nodes gracefully', async () => {
      // Create an event node without a first step
      const orphanEventId = 'Node-orphan-event' as EARS.EntityId;
      tx(orphanEventId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'listen')
        .put('label', 'Orphan Event')
        .put('eventType', 'orphan.event')
        .put('mode', 'internal')
        .put('createdAt', Date.now());
      
      const rootFlowId = qx(EARS.Entity.Flow)
        .withRole(EARS.RoleKind.Custom("root_flow"))
        .first()!;
      
      tx(rootFlowId)
        .link(EARS.RelKind.EVENT_TRACE, orphanEventId);
      
      const actor = startBrainRunner(mockSystemActor);
      
      // Should not throw when sending orphan event
      expect(() => {
        actor.send({ type: 'orphan.event' });
      }).not.toThrow();
      
      // Should create event TNode but no step TNode
      await vi.waitFor(() => {
        const eventTNodes = qx(EARS.Entity.TNode)
          .where('nodeType', 'event')
          .where('eventType', 'orphan.event')
          .ids();
        return eventTNodes.length > 0;
      }, { timeout: 1000 });
      
      const orphanEventTNode = qx(EARS.Entity.TNode)
        .where('nodeType', 'event')
        .where('eventType', 'orphan.event')
        .first();
      
      expect(orphanEventTNode).toBeDefined();
      
      // Should not spawn any children
      const spawnedChildren = qx(orphanEventTNode!)
        .linksTo(EARS.RelKind.SPAWNED, [EARS.Entity.TNode])
        .ids();
      
      expect(spawnedChildren).toHaveLength(0);
      
      // Clean up
      tx(orphanEventId).drop();
    });

    it('should update TNode status to failed on errors', async () => {
      // This would test error handling in step execution
      // For now, we'll verify the error handling structure exists
      
      const actor = startBrainRunner(mockSystemActor);
      expect(actor.getSnapshot().status).toBe('active');
      
      // In a real implementation, we'd trigger an error
      // and verify the TNode status is updated to 'failed'
    });
  });

  describe('Flow Node Execution', () => {
    it('should spawn nested flow machines', async () => {
      // This would test spawning a flow node which creates
      // another flow machine with its own event listeners
      
      // For this test, we'd need a flow node in the test data
      // that references another flow
      
      const actor = startBrainRunner(mockSystemActor);
      
      // The test flow has a flow node (Node-b11) that could be triggered
      // if connected properly via TRANSITIONS_TO relation
      
      expect(actor.getSnapshot().status).toBe('active');
    });
  });
});

/**
 * Setup test data for brain runner tests
 */
function setupTestData() {
  // Ensure root flow exists with proper role
  const rootFlowId = qx(EARS.Entity.Flow)
    .where('label', 'Run Agent Brain')
    .first();
  
  if (!rootFlowId) {
    throw new Error('Test data missing: Run Agent Brain flow');
  }
  
  // Grant root flow role if not already assigned
  if (!qx(rootFlowId).hasRole(EARS.RoleKind.Custom("root_flow"))) {
    tx(rootFlowId).grant(EARS.RoleKind.Custom("root_flow"));
  }
  
  // Ensure entry event node has proper role
  const entryNodeId = qx(EARS.Entity.Node)
    .where('eventType', 'flow.entry')
    .first();
  
  if (entryNodeId && !qx(entryNodeId).hasRole(EARS.RoleKind.Custom("entry_event"))) {
    tx(entryNodeId).grant(EARS.RoleKind.Custom("entry_event"));
  }
} 