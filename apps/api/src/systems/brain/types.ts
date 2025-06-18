import type { BaseEntity } from '@/shared/types';
import { EARS } from '@/shared/ears/types';
import type { NodeEntity, EdgeEntity, FlowEntity } from '@/systems/flows/types';

export interface TrackEntity extends BaseEntity {
  entityType: EARS.Entity.Track;
  flowId: EARS.EntityId;
  eventTag: string;
  eventLabel: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  startedAt: number;
  currentNodeId?: EARS.EntityId;
  nodes: EARS.EntityId[]; // ordered list of executed nodes
}

export interface EventListenerEntity {
  id: EARS.EntityId;
  nodeId: EARS.EntityId;
  eventTag: string;
  label: string;
  mode: 'entry' | 'internal';
}

export interface BrainStartupData {
  rootFlowId: EARS.EntityId;
  currentFlowId: EARS.EntityId;
  rootFlow: Partial<FlowEntity>;
  tracks: TrackEntity[];
  possibleEvents: EventListenerEntity[];
  flowStack: EARS.EntityId[]; // for navigation history
}

export interface TrackUpdate {
  trackId: EARS.EntityId;
  nodeId: EARS.EntityId;
  status: TrackEntity['status'];
}

export interface EventReceived {
  eventTag: string;
  flowId: EARS.EntityId;
  payload?: any;
} 