import type { EARS } from './ears/types';

export interface BaseEntity {
  id: string;
  entityType: string;
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
  sideTopics?: string[];
  timestamp: number;
  shortCode?: string;
  threadType: 'work-item' | 'project';
  status?: 'draft' | 'queued' | 'active' | 'inactive';
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

export type Entity = MessageEntity | ThreadEntity | ContextItemEntity | CanvasContentEntity | TagEntity;

export interface RoleAssignment {
  entityId: string;
  role: EARS.RoleKind;
}
export interface Relation {
  srcId: string;
  kind: EARS.RelKind;
  tgtId: string;
  info: string; // JSON string
}
export interface Rows {
  entity: Entity[];
  role: RoleAssignment[];
  relation: Relation[];
}