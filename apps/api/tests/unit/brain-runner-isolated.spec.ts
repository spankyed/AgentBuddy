/**
 * brain-runner-isolated.spec.ts – isolated tests for brain runner concepts
 * Tests individual components without full system integration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { EARS } from '@/shared/ears/types';
import { tx } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import type { TNodeEntity } from '@/systems/brain/types';
import type { FlowEntity, NodeEntity, ListenNode } from '@/systems/flows/types';

// Clear the store before tests
function clearStore() {
  const allEntities = qx().ids();
  allEntities.forEach(id => tx(id).drop());
}

describe('Brain Runner - Isolated Tests', () => {
  beforeEach(() => {
    clearStore();
  });

  describe('Core Concepts', () => {
    it('demonstrates flow with event listeners', () => {
      // Create a simple flow
      const flowId = 'Flow-test' as EARS.EntityId;
      tx(flowId)
        .put('entityType', EARS.Entity.Flow)
        .put('label', 'Test Flow')
        .put('flowType', 'workflow')
        .put('createdAt', Date.now())
        .grant(EARS.RoleKind.Custom("root_flow"));

      // Create event listener nodes
      const entryEventId = 'Node-entry' as EARS.EntityId;
      tx(entryEventId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'listen')
        .put('label', 'Entry Event')
        .put('eventType', 'flow.start')
        .put('mode', 'entry')
        .put('createdAt', Date.now())
        .grant(EARS.RoleKind.Custom("entry_event"));

      const userEventId = 'Node-user' as EARS.EntityId;
      tx(userEventId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'listen')
        .put('label', 'User Event')
        .put('eventType', 'user.action')
        .put('mode', 'internal')
        .put('createdAt', Date.now());

      // Connect events to flow via EVENT_TRACE
      tx(flowId)
        .link(EARS.RelKind.EVENT_TRACE, entryEventId)
        .link(EARS.RelKind.EVENT_TRACE, userEventId);

      // Verify flow has event listeners
      const eventNodes = qx(flowId)
        .linksPick(
          EARS.RelKind.EVENT_TRACE,
          ["id", "nodeType", "eventType", "mode"] as const,
          [EARS.Entity.Node]
        );

      expect(eventNodes).toHaveLength(2);
      expect(eventNodes.map(n => n.eventType)).toContain('flow.start');
      expect(eventNodes.map(n => n.eventType)).toContain('user.action');
    });

    it('demonstrates event to responder chain', () => {
      // Create event listener
      const listenerId = 'Node-listen' as EARS.EntityId;
      tx(listenerId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'listen')
        .put('label', 'Message Event')
        .put('eventType', 'message.received')
        .put('createdAt', Date.now());

      // Create action node
      const actionId = 'Node-action' as EARS.EntityId;
      tx(actionId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'action')
        .put('label', 'Process Message')
        .put('actionName', 'processMessage')
        .put('createdAt', Date.now());

      // Connect listener to action via RESPONDER
      tx(listenerId).link(EARS.RelKind.RESPONDER, actionId);

      // Verify responder connection
      const responders = qx(listenerId)
        .linksTo(EARS.RelKind.RESPONDER, [EARS.Entity.Node])
        .ids();

      expect(responders).toContain(actionId);
    });

    it('demonstrates sequential execution chain', () => {
      // Create a chain of nodes
      const step1Id = 'Node-step1' as EARS.EntityId;
      const step2Id = 'Node-step2' as EARS.EntityId;
      const step3Id = 'Node-step3' as EARS.EntityId;

      tx(step1Id)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'action')
        .put('label', 'Step 1')
        .put('createdAt', Date.now());

      tx(step2Id)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'transform')
        .put('label', 'Step 2')
        .put('createdAt', Date.now());

      tx(step3Id)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'fire')
        .put('label', 'Step 3')
        .put('eventType', 'process.complete')
        .put('createdAt', Date.now());

      // Connect via TRANSITIONS_TO
      tx(step1Id).link(EARS.RelKind.TRANSITIONS_TO, step2Id);
      tx(step2Id).link(EARS.RelKind.TRANSITIONS_TO, step3Id);

      // Verify chain
      const nextFromStep1 = qx(step1Id)
        .linksTo(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node])
        .ids();
      expect(nextFromStep1).toContain(step2Id);

      const nextFromStep2 = qx(step2Id)
        .linksTo(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node])
        .ids();
      expect(nextFromStep2).toContain(step3Id);
    });

    it('demonstrates TNode creation and tracking', () => {
      // Create flow TNode
      const flowTNodeId = 'TNode-flow' as EARS.EntityId;
      tx(flowTNodeId)
        .put('entityType', EARS.Entity.TNode)
        .put('nodeType', 'flow')
        .put('label', 'Main Flow')
        .put('status', 'active')
        .put('startedAt', Date.now())
        .put('createdAt', Date.now());

      // Create event TNode
      const eventTNodeId = 'TNode-event' as EARS.EntityId;
      tx(eventTNodeId)
        .put('entityType', EARS.Entity.TNode)
        .put('nodeType', 'event')
        .put('label', 'User Event')
        .put('eventType', 'user.clicked')
        .put('status', 'active')
        .put('startedAt', Date.now())
        .put('createdAt', Date.now());

      // Create step TNode
      const stepTNodeId = 'TNode-step' as EARS.EntityId;
      tx(stepTNodeId)
        .put('entityType', EARS.Entity.TNode)
        .put('nodeType', 'step')
        .put('label', 'Process Click')
        .put('stepNodeType', 'action')
        .put('status', 'completed')
        .put('startedAt', Date.now() - 1000)
        .put('createdAt', Date.now() - 1000);

      // Create relationships
      tx(flowTNodeId).link(EARS.RelKind.TRACKED, eventTNodeId);
      tx(eventTNodeId).link(EARS.RelKind.SPAWNED, stepTNodeId);

      // Verify tracking
      const trackedEvents = qx(flowTNodeId)
        .linksTo(EARS.RelKind.TRACKED, [EARS.Entity.TNode])
        .ids();
      expect(trackedEvents).toContain(eventTNodeId);

      const spawnedSteps = qx(eventTNodeId)
        .linksTo(EARS.RelKind.SPAWNED, [EARS.Entity.TNode])
        .ids();
      expect(spawnedSteps).toContain(stepTNodeId);

      // Verify status
      const step = qx(stepTNodeId).pickOne(["status"]) as { status: string };
      expect(step.status).toBe('completed');
    });

    it('demonstrates flow node spawning subflow', () => {
      // Create parent flow
      const parentFlowId = 'Flow-parent' as EARS.EntityId;
      tx(parentFlowId)
        .put('entityType', EARS.Entity.Flow)
        .put('label', 'Parent Flow')
        .put('createdAt', Date.now());

      // Create child flow
      const childFlowId = 'Flow-child' as EARS.EntityId;
      tx(childFlowId)
        .put('entityType', EARS.Entity.Flow)
        .put('label', 'Child Flow')
        .put('createdAt', Date.now());

      // Create flow node that references child
      const flowNodeId = 'Node-flow' as EARS.EntityId;
      tx(flowNodeId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'flow')
        .put('label', 'Run Subflow')
        .put('flowRef', childFlowId)
        .put('createdAt', Date.now());

      // Connect flow node to parent
      tx(parentFlowId).link(EARS.RelKind.CONTAINS, flowNodeId);

      // Create TNodes representing execution
      const parentTNodeId = 'TNode-parent' as EARS.EntityId;
      tx(parentTNodeId)
        .put('entityType', EARS.Entity.TNode)
        .put('nodeType', 'flow')
        .put('label', 'Parent Execution')
        .put('status', 'active')
        .put('createdAt', Date.now())
        .link(EARS.RelKind.INSTANCE_OF, parentFlowId);

      const childTNodeId = 'TNode-child' as EARS.EntityId;
      tx(childTNodeId)
        .put('entityType', EARS.Entity.TNode)
        .put('nodeType', 'flow')
        .put('label', 'Child Execution')
        .put('status', 'active')
        .put('createdAt', Date.now())
        .link(EARS.RelKind.INSTANCE_OF, childFlowId);

      // Parent spawned child
      tx(parentTNodeId).link(EARS.RelKind.SPAWNED, childTNodeId);

      // Verify instance relationships
      const parentInstance = qx(parentTNodeId)
        .linksTo(EARS.RelKind.INSTANCE_OF, [EARS.Entity.Flow])
        .ids();
      expect(parentInstance).toContain(parentFlowId);

      const childInstance = qx(childTNodeId)
        .linksTo(EARS.RelKind.INSTANCE_OF, [EARS.Entity.Flow])
        .ids();
      expect(childInstance).toContain(childFlowId);
    });
  });

  describe('Query Patterns', () => {
    it('finds all event nodes for a flow', () => {
      const flowId = 'Flow-1' as EARS.EntityId;
      tx(flowId)
        .put('entityType', EARS.Entity.Flow)
        .put('label', 'Test Flow')
        .put('createdAt', Date.now());

      // Add multiple event nodes
      ['event1', 'event2', 'event3'].forEach((event, i) => {
        const nodeId = `Node-${i}` as EARS.EntityId;
        tx(nodeId)
          .put('entityType', EARS.Entity.Node)
          .put('nodeType', 'listen')
          .put('eventType', event)
          .put('createdAt', Date.now());
        
        tx(flowId).link(EARS.RelKind.EVENT_TRACE, nodeId);
      });

      // Query all event nodes
      const eventNodes = qx(flowId)
        .linksPick(
          EARS.RelKind.EVENT_TRACE,
          ["id", "eventType"] as const,
          [EARS.Entity.Node]
        )
        .filter((n: any) => n.nodeType === 'listen');

      expect(eventNodes).toHaveLength(3);
      expect(eventNodes.map(n => n.eventType)).toContain('event1');
    });

    it('finds execution chain from TNode', () => {
      // Create execution chain
      const tnode1 = 'TNode-1' as EARS.EntityId;
      const tnode2 = 'TNode-2' as EARS.EntityId;
      const tnode3 = 'TNode-3' as EARS.EntityId;

      [tnode1, tnode2, tnode3].forEach((id, i) => {
        tx(id)
          .put('entityType', EARS.Entity.TNode)
          .put('nodeType', 'step')
          .put('label', `Step ${i + 1}`)
          .put('status', i < 2 ? 'completed' : 'active')
          .put('createdAt', Date.now() + i);
      });

      // Create chain
      tx(tnode1).link(EARS.RelKind.SPAWNED, tnode2);
      tx(tnode2).link(EARS.RelKind.SPAWNED, tnode3);

      // Find all spawned from first
      let current = tnode1;
      const chain: string[] = [current];
      
      while (true) {
        const spawned = qx(current)
          .linksTo(EARS.RelKind.SPAWNED, [EARS.Entity.TNode])
          .ids();
        
        if (spawned.length === 0) break;
        current = spawned[0];
        chain.push(current);
      }

      expect(chain).toEqual([tnode1, tnode2, tnode3]);
    });

    it('finds active TNodes', () => {
      // Create mix of TNodes
      ['active', 'completed', 'active', 'failed'].forEach((status, i) => {
        tx(`TNode-${i}` as EARS.EntityId)
          .put('entityType', EARS.Entity.TNode)
          .put('nodeType', 'step')
          .put('status', status)
          .put('createdAt', Date.now());
      });

      const activeTNodes = qx(EARS.Entity.TNode)
        .where('status', 'active')
        .ids();

      expect(activeTNodes).toHaveLength(2);
    });
  });

  describe('State Machine Concepts', () => {
    it('demonstrates dynamic event handler creation', () => {
      // Create event nodes
      const events = [
        { id: 'Node-1', eventType: 'user.login' },
        { id: 'Node-2', eventType: 'user.logout' },
        { id: 'Node-3', eventType: 'data.refresh' },
      ];

      events.forEach(({ id, eventType }) => {
        tx(id as EARS.EntityId)
          .put('entityType', EARS.Entity.Node)
          .put('nodeType', 'listen')
          .put('eventType', eventType)
          .put('createdAt', Date.now());
      });

      // Build dynamic event handlers
      const eventHandlers: Record<string, any> = {};
      
      events.forEach(({ eventType }) => {
        eventHandlers[eventType] = {
          actions: () => console.log(`Handling ${eventType}`),
        };
      });

      expect(Object.keys(eventHandlers)).toHaveLength(3);
      expect(eventHandlers).toHaveProperty('user.login');
      expect(eventHandlers).toHaveProperty('user.logout');
      expect(eventHandlers).toHaveProperty('data.refresh');
    });

    it('demonstrates execution context accumulation', () => {
      // Simulate context through execution
      let executionContext: Record<string, any> = {
        eventPayload: { userId: '123' },
      };

      // Step 1 adds result
      executionContext = {
        ...executionContext,
        'Node-1_result': { userData: { name: 'John' } },
      };

      // Step 2 adds result
      executionContext = {
        ...executionContext,
        'Node-2_result': { processed: true },
      };

      expect(executionContext.eventPayload.userId).toBe('123');
      expect(executionContext['Node-1_result'].userData.name).toBe('John');
      expect(executionContext['Node-2_result'].processed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles circular references gracefully', () => {
      // Create nodes with circular reference
      const node1 = 'Node-1' as EARS.EntityId;
      const node2 = 'Node-2' as EARS.EntityId;

      tx(node1)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'action')
        .put('createdAt', Date.now());

      tx(node2)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'action')
        .put('createdAt', Date.now());

      // Create circular transition
      tx(node1).link(EARS.RelKind.TRANSITIONS_TO, node2);
      tx(node2).link(EARS.RelKind.TRANSITIONS_TO, node1);

      // Detection would require cycle detection logic
      const visited = new Set<string>();
      let current = node1;
      
      while (!visited.has(current)) {
        visited.add(current);
        const next = qx(current)
          .linksTo(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node])
          .ids();
        
        if (next.length === 0) break;
        current = next[0];
      }

      expect(visited.size).toBe(2);
      expect(visited.has(node1)).toBe(true);
      expect(visited.has(node2)).toBe(true);
    });

    it('handles missing flow references', () => {
      // Create flow node with invalid reference
      const flowNodeId = 'Node-flow' as EARS.EntityId;
      tx(flowNodeId)
        .put('entityType', EARS.Entity.Node)
        .put('nodeType', 'flow')
        .put('flowRef', 'Flow-nonexistent')
        .put('createdAt', Date.now());

      // Query for referenced flow
      const flowRef = qx(flowNodeId).pickOne(["flowRef"]) as any;
      const referencedFlow = qx(flowRef.flowRef).exists();

      expect(referencedFlow).toBe(false);
    });
  });
});

describe('Brain Runner Integration Patterns', () => {
  beforeEach(() => {
    clearStore();
    setupTestFlow();
  });

  it('demonstrates complete flow execution pattern', async () => {
    // This shows the expected data structure after execution
    
    // Root flow TNode should exist
    const rootTNode = qx(EARS.Entity.TNode)
      .withRole(EARS.RoleKind.Custom("root_trace_node"))
      .pickOne(["id", "nodeType", "status"]);
    
    expect(rootTNode).toBeDefined();
    
    // Event TNodes should be tracked
    const eventTNodes = qx(rootTNode!.id)
      .linksTo(EARS.RelKind.TRACKED, [EARS.Entity.TNode])
      .pick(["nodeType", "eventType"]);
    
    // Each event should spawn execution chain
    eventTNodes.forEach(eventTNode => {
      const spawned = qx(eventTNode.id!)
        .linksTo(EARS.RelKind.SPAWNED, [EARS.Entity.TNode])
        .ids();
      
      // Event spawns steps
      expect(spawned.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Setup a test flow for integration tests
 */
function setupTestFlow() {
  // Create test flow
  const flowId = 'Flow-test' as EARS.EntityId;
  tx(flowId)
    .put('entityType', EARS.Entity.Flow)
    .put('label', 'Test Integration Flow')
    .put('flowType', 'workflow')
    .put('createdAt', Date.now())
    .grant(EARS.RoleKind.Custom("root_flow"));

  // Create entry event
  const entryId = 'Node-entry' as EARS.EntityId;
  tx(entryId)
    .put('entityType', EARS.Entity.Node)
    .put('nodeType', 'listen')
    .put('label', 'Start')
    .put('eventType', 'flow.start')
    .put('mode', 'entry')
    .put('createdAt', Date.now())
    .grant(EARS.RoleKind.Custom("entry_event"));

  // Create action node
  const actionId = 'Node-action' as EARS.EntityId;
  tx(actionId)
    .put('entityType', EARS.Entity.Node)
    .put('nodeType', 'action')
    .put('label', 'Execute')
    .put('actionName', 'testAction')
    .put('createdAt', Date.now());

  // Create fire node
  const fireId = 'Node-fire' as EARS.EntityId;
  tx(fireId)
    .put('entityType', EARS.Entity.Node)
    .put('nodeType', 'fire')
    .put('label', 'Complete')
    .put('eventType', 'flow.complete')
    .put('createdAt', Date.now());

  // Connect nodes
  tx(flowId)
    .link(EARS.RelKind.EVENT_TRACE, entryId)
    .link(EARS.RelKind.CONTAINS, actionId)
    .link(EARS.RelKind.CONTAINS, fireId);

  tx(entryId).link(EARS.RelKind.RESPONDER, actionId);
  tx(actionId).link(EARS.RelKind.TRANSITIONS_TO, fireId);

  // Create example TNodes to show execution
  const flowTNode = 'TNode-1' as EARS.EntityId;
  tx(flowTNode)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', 'flow')
    .put('label', 'Test Flow Execution')
    .put('status', 'active')
    .put('createdAt', Date.now())
    .link(EARS.RelKind.INSTANCE_OF, flowId)
    .grant(EARS.RoleKind.Custom("root_trace_node"));
} 