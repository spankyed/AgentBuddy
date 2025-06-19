import { BaseEntity, EARS } from '@/shared/ears/types';
import type { NodeEntity, EdgeEntity, FlowEntity } from '@/systems/flows/types';

export interface TNodeEntity extends BaseEntity {
  entityType: EARS.Entity.TNode;
  nodeType: 'flow' | 'event' | 'step';
  label: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  startedAt: number;
  
  // For event nodes pulsing
  eventTag?: string;
  
  // For step nodes
  stepNodeId?: EARS.EntityId; // Reference to the Flow Node being executed
  stepNodeType?: string; // Type of the node being executed
}

export interface TrackEntity extends TNodeEntity {
  children: TrackEntity[];
}

export interface EventListenerEntity {
  id: EARS.EntityId;
  nodeId: EARS.EntityId;
  eventTag: string;
  label: string;
  mode: 'entry' | 'internal';
}

export interface FlowTNodeData {
  flowTNodeId: EARS.EntityId;
  tNodeTree: TrackEntity[];
  possibleEvents: EventListenerEntity[];
}

export interface TNodeUpdate {
  tNodeId: EARS.EntityId;
  status: TNodeEntity['status'];
  stepNodeId?: EARS.EntityId;
}

export interface EventReceived {
  eventTag: string;
  parentTNodeId: EARS.EntityId;
  payload?: any;
} 