import type { BaseEntity, EARS, Entity } from './utils/ears/types';

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
  source: string;
  kind: EARS.RelKind;
  target: string;
  info?: { [key: string]: any; }
}
