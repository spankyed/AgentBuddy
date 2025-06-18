import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

export const brainRows: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Flow TNodes (instances of Flow blueprints) */
    {
      id: 'TNode-1',
      entityType: EARS.Entity.TNode,
      nodeType: 'flow',
      label: 'Run Brain',
      status: 'active',
      createdAt: nowMs - 120000,
      startedAt: nowMs - 120000,
    },
    {
      id: 'TNode-3',
      entityType: EARS.Entity.TNode,
      nodeType: 'flow',
      label: 'Chat Flow 2',
      status: 'completed',
      createdAt: nowMs - 240000,
      startedAt: nowMs - 240000,
    },

    /* Event TNodes */
    {
      id: 'TNode-2',
      entityType: EARS.Entity.TNode,
      nodeType: 'event',
      label: 'User Message',
      eventTag: 'chat.message',
      status: 'active',
      createdAt: nowMs - 30000,
      startedAt: nowMs - 30000,
    },
    {
      id: 'TNode-4',
      entityType: EARS.Entity.TNode,
      nodeType: 'event',
      label: 'System Startup',
      eventTag: 'system.startup',
      status: 'completed',
      createdAt: nowMs - 120000,
      startedAt: nowMs - 120000,
    },
    {
      id: 'TNode-5',
      entityType: EARS.Entity.TNode,
      nodeType: 'event',
      label: 'User Command',
      eventTag: 'chat.command',
      status: 'paused',
      createdAt: nowMs - 60000,
      startedAt: nowMs - 60000,
    },

    /* Step TNodes */
    {
      id: 'TNode-6',
      entityType: EARS.Entity.TNode,
      nodeType: 'step',
      label: 'Listen: User Message',
      stepNodeId: 'Node-1', // ! Should use INSTANCE_OF relation instead
      stepNodeType: 'listen',
      status: 'completed',
      createdAt: nowMs - 30000,
      startedAt: nowMs - 30000,
    },
    {
      id: 'TNode-7',
      entityType: EARS.Entity.TNode,
      nodeType: 'step',
      label: 'Decision: Message Type',
      stepNodeId: 'Node-3',
      stepNodeType: 'decision',
      status: 'completed',
      createdAt: nowMs - 29000,
      startedAt: nowMs - 29000,
    },
    {
      id: 'TNode-8',
      entityType: EARS.Entity.TNode,
      nodeType: 'step',
      label: 'Create Context',
      stepNodeId: 'Node-4',
      stepNodeType: 'create',
      status: 'completed',
      createdAt: nowMs - 28000,
      startedAt: nowMs - 28000,
    },
    {
      id: 'TNode-9',
      entityType: EARS.Entity.TNode,
      nodeType: 'step',
      label: 'Update Context',
      stepNodeId: 'Node-5',
      stepNodeType: 'update',
      status: 'completed',
      createdAt: nowMs - 27000,
      startedAt: nowMs - 27000,
    },
    {
      id: 'TNode-10',
      entityType: EARS.Entity.TNode,
      nodeType: 'step',
      label: 'Send Response',
      stepNodeId: 'Node-6',
      stepNodeType: 'fire',
      status: 'active',
      createdAt: nowMs - 26000,
      startedAt: nowMs - 26000,
    },
    {
      id: 'TNode-11',
      entityType: EARS.Entity.TNode,
      nodeType: 'step',
      label: 'Command Handler',
      stepNodeId: 'Node-11',
      stepNodeType: 'flow',
      status: 'paused',
      createdAt: nowMs - 59000,
      startedAt: nowMs - 59000,
    },
  ],

  /*──────────────────────────────────────────*
   * Role assignments                         *
   *──────────────────────────────────────────*/
  role: [
    // Mark the current flow instance
    // {
    //   entityId: 'TNode-1',
    //   role: EARS.RoleKind.Custom('current_flow_instance'),
    // },
    {
      entityId: "TNode-1",
      role: EARS.RoleKind.Custom("root_trace_node"),
    },
  ],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────────────────*/
  relation: [
    /* Flow TNodes are instances of Flow blueprints */
    { source: 'TNode-1', kind: EARS.RelKind.Custom('INSTANCE_OF'), target: 'Flow-2', info: {} },
    { source: 'TNode-2', kind: EARS.RelKind.Custom('INSTANCE_OF'), target: 'Flow-3', info: {} },
    
    /* Flow TNodes contain Event TNodes */
    { source: 'TNode-1', kind: EARS.RelKind.TRACKED, target: 'TNode-2', info: {} },
    { source: 'TNode-1', kind: EARS.RelKind.TRACKED, target: 'TNode-4', info: {} },
    { source: 'TNode-1', kind: EARS.RelKind.TRACKED, target: 'TNode-5', info: {} },
    
    /* Event TNodes spawn Step TNodes in sequence */
    // TNode-2 (event) spawns first step TNode-6
    { source: 'TNode-2', kind: EARS.RelKind.SPAWNED, target: 'TNode-6', info: {} },
    
    // Each step spawns the next step in sequence
    { source: 'TNode-6', kind: EARS.RelKind.SPAWNED, target: 'TNode-7', info: {} },
    { source: 'TNode-7', kind: EARS.RelKind.SPAWNED, target: 'TNode-8', info: {} },
    { source: 'TNode-8', kind: EARS.RelKind.SPAWNED, target: 'TNode-9', info: {} },
    { source: 'TNode-9', kind: EARS.RelKind.SPAWNED, target: 'TNode-10', info: {} },
    
    // TNode-10 spawns TNode-3 (flow node)
    { source: 'TNode-10', kind: EARS.RelKind.SPAWNED, target: 'TNode-3', info: {} },
    
    // TNode-5 (event) spawns step TNode-11
    { source: 'TNode-5', kind: EARS.RelKind.SPAWNED, target: 'TNode-11', info: {} },
  ],
};

