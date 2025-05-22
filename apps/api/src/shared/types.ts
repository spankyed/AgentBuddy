import type { EARS } from './ears/types';

// New interfaces for the EARS entity/role/relation structure

// Base entity interface with common properties
export interface BaseEntity {
  id: string;
  entityType: string;
  createdAt: number;
}

// Message entity
export interface MessageEntity extends BaseEntity {
  entityType: 'Message';
  content: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: number;
}

// Thread entity
export interface ThreadEntity extends BaseEntity {
  entityType: 'Thread';
  title: string;
  timestamp: number;
}

// ContextItem entity
export interface ContextItemEntity extends BaseEntity {
  entityType: 'ContextItem';
  title: string;
  content: string;
  itemType: 'text' | 'code' | 'image' | 'json';
}

// CanvasContent entity
export interface CanvasContentEntity extends BaseEntity {
  entityType: 'CanvasContent';
  contentType: 'text' | 'code' | 'image' | 'graph' | 'table';
  // biome-ignore lint/suspicious/noExplicitAny: Content can be various types
  content: string | any;
}

// Union type for all entity types
export type Entity = MessageEntity | ThreadEntity | ContextItemEntity | CanvasContentEntity;

// Role assignment
export interface RoleAssignment {
  entityId: string;
  role: EARS.RoleKind;
}

// Relation between entities
export interface Relation {
  srcId: string;
  kind: EARS.RelKind;
  tgtId: string;
  info: string; // JSON string
}

// The complete rows structure
export interface Rows {
  entity: Entity[];
  role: RoleAssignment[];
  relation: Relation[];
}