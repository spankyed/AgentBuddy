import { FlowEntity, FlowEventEntity, StepEntity } from '@/systems/flows/types';
import type { EARS } from './ears/types';

export interface BaseEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity;
  createdAt: number;
}

export interface MessageEntity extends BaseEntity {
  entityType: EARS.Entity.Message;
  text: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: number;
}

export interface ThreadEntity extends BaseEntity {
  entityType: EARS.Entity.Thread;
  topic: string;
  instructions: string;
  sideTopics?: string[];
  timestamp: number;
  shortCode?: string;
  threadType: 'work-item' | 'project' | 'user';
  status: 'draft' | 'queued' | 'active' | 'inactive';
}

export interface ContextItemEntity extends BaseEntity {
  entityType: EARS.Entity.ContextItem;
  title: string;
  content: string;
  itemType: 'text' | 'code' | 'image' | 'json';
}

export interface CanvasContentEntity extends BaseEntity {
  entityType: EARS.Entity.CanvasItem;
  contentType: 'text' | 'code' | 'image' | 'graph' | 'table';
  // biome-ignore lint/suspicious/noExplicitAny: Content can be various types
  content: string | any;
}

export interface TagEntity extends BaseEntity {
  entityType: EARS.Entity.Tag;
  name: string;
  color?: string;
}


// ! remove after move from mock-data
export type Entity =
  MessageEntity | ThreadEntity | ContextItemEntity | CanvasContentEntity | TagEntity | FlowEntity | StepEntity | FlowEventEntity;
export interface Rows {
  entity: Entity[];
  role: RoleAssignment[];
  relation: Relation[];
}
interface RoleAssignment {
  entityId: string;
  role: EARS.RoleKind;
}
interface Relation {
  srcId: string;
  kind: EARS.RelKind;
  tgtId: string;
  info?: { [key: string]: any; }
}
