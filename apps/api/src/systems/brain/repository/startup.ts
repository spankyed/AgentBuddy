import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { BrainStartupData, TrackEntity, EventListenerEntity } from '../types';
import type { FlowEntity, NodeEntity, ListenNode } from '@/systems/flows/types';

// Mock data for now - in production this would come from actual state
const mockTracks: TrackEntity[] = [
  {
    id: 'Track-A182C3' as EARS.EntityId,
    entityType: EARS.Entity.Track,
    flowId: 'Flow-2' as EARS.EntityId,
    eventTag: 'chat.message',
    eventLabel: 'User Message',
    status: 'active',
    createdAt: Date.now() - 30000,
    startedAt: Date.now() - 30000,
    currentNodeId: 'Node-6' as EARS.EntityId,
    nodes: ['Node-1', 'Node-3', 'Node-4', 'Node-5', 'Node-6'] as EARS.EntityId[]
  },
  {
    id: 'Track-D4E5F6' as EARS.EntityId,
    entityType: EARS.Entity.Track,
    flowId: 'Flow-2' as EARS.EntityId,
    eventTag: 'system.startup',
    eventLabel: 'System Event',
    status: 'completed',
    createdAt: Date.now() - 120000,
    startedAt: Date.now() - 120000,
    currentNodeId: 'Node-10' as EARS.EntityId,
    nodes: ['Node-2', 'Node-8', 'Node-9', 'Node-10'] as EARS.EntityId[]
  },
  {
    id: 'Track-G7H8I9' as EARS.EntityId,
    entityType: EARS.Entity.Track,
    flowId: 'Flow-2' as EARS.EntityId,
    eventTag: 'chat.command',
    eventLabel: 'User Message',
    status: 'paused',
    createdAt: Date.now() - 60000,
    startedAt: Date.now() - 60000,
    currentNodeId: 'Node-11' as EARS.EntityId,
    nodes: ['Node-1', 'Node-3', 'Node-11'] as EARS.EntityId[]
  },
  {
    id: 'Track-J1X2L3' as EARS.EntityId,
    entityType: EARS.Entity.Track,
    flowId: 'Flow-2' as EARS.EntityId,
    eventTag: 'chat.message',
    eventLabel: 'User Message',
    status: 'failed',
    createdAt: Date.now() - 45000,
    startedAt: Date.now() - 45000,
    currentNodeId: 'Node-3' as EARS.EntityId,
    nodes: ['Node-1', 'Node-3'] as EARS.EntityId[]
  },
  {
    id: 'Track-M4N506' as EARS.EntityId,
    entityType: EARS.Entity.Track,
    flowId: 'Flow-2' as EARS.EntityId,
    eventTag: 'system.error',
    eventLabel: 'System Event',
    status: 'completed',
    createdAt: Date.now() - 90000,
    startedAt: Date.now() - 90000,
    currentNodeId: 'Node-9' as EARS.EntityId,
    nodes: ['Node-2', 'Node-8', 'Node-9'] as EARS.EntityId[]
  }
];

export default function brainStartupData(flowId: EARS.EntityId): BrainStartupData {
  const flowCols = ["id", "label", "flowType", "status", "createdAt"] as const;

  // Get the flow
  const flow = qx(flowId)
    .pickOne(flowCols) as Partial<FlowEntity>;

  // Get all listener nodes in the flow
  const listenerNodes = qx(flowId)
    .linksPick(
      EARS.RelKind.CONTAINS,
      [EARS.Entity.Node],
      [
        'id',
        'label',
        'nodeType',
        'eventTag',
        'mode',
      ] as const,
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];

  // Convert to EventListenerEntity format
  const possibleEvents: EventListenerEntity[] = listenerNodes.map(node => ({
    id: `Event-${node.id}` as EARS.EntityId,
    nodeId: node.id!,
    eventTag: node.eventTag,
    label: node.label,
    mode: node.mode
  }));

  // Filter tracks for current flow
  const flowTracks = mockTracks.filter(track => track.flowId === flowId);

  // Get root flow
  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(flowCols) as Partial<FlowEntity> | undefined;

  return {
    rootFlowId: rootFlow?.id || 'Flow-2' as EARS.EntityId,
    currentFlowId: flowId,
    rootFlow: rootFlow || flow,
    tracks: flowTracks,
    possibleEvents,
    flowStack: [rootFlow?.id || 'Flow-2' as EARS.EntityId]
  };
} 