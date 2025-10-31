import { BaseEntity } from "@/core/ears";
import type { Simplify } from "@/core/utils/type-helpers";
import type { EARS } from "@/types";

// Block-based interaction system (composable architecture)
export type BlockType = 'prompt' | 'note' | 'file-picker' | 'choice' | 'text' | 'approval' | 'actions' | 'link';

export interface BlockConfig {
  type: BlockType;
  props: Record<string, any>;
}

// Link block types
export interface LinkEvent {
  target: 'application' | 'external' | string; // 'application', 'external', or plugin name
  data: any;
}

export type LinkIcon =
  | 'external-link'
  | 'file-text'
  | 'message-square'
  | 'settings'
  | 'link';

export interface LinkConfig {
  label: string;
  event: LinkEvent;
  icon?: LinkIcon; // Optional lucide icon name
}

export interface MessageEntity extends BaseEntity {
  entityType: EARS.Entity.Message;
  text: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: number;
  // Block-based interaction system
  responseTimestamp?: number; // Timestamp when the message was responded to
  blocks?: BlockConfig[];
  blockResponse?: any; // Response data for block-based interactions
}

export interface ThreadEntity extends BaseEntity {
  entityType: EARS.Entity.Thread;
  topic: string;
  instructions: string;
  sideTopics?: string[];
  timestamp: number;
  lastMessageTimestamp?: number;
  lastVisitedTimestamp?: number;
  shortCode?: string;
  status: string; // Dynamic statuses from settings
  tags?: string[]; // Tag names from settings
  forcedMode?: 'birth' | 'work' | 'chat' | 'note'; // Force a specific mode for this thread
}

export interface ArtifactEntity extends BaseEntity {
  entityType: EARS.Entity.Artifact;
  title?: string;
  // biome-ignore lint/suspicious/noExplicitAny: Content can be various types
  content: string | any;
  artifactType: 'text' | 'code' | 'image' | 'json' | 'graph' | 'table' | 'slack';
}

export const ThreadRelations = ['parent_of', 'blocks', 'blocked_by', 'duplicates'] as const;
export type ThreadLinkRelation = typeof ThreadRelations[number];

export type ThreadLinkItem = Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic'> & {
  relation: ThreadLinkRelation
};

export type ThreadEditFields = Simplify<
  Pick<ThreadEntity, 'topic' | 'instructions'>
  & { status?: ThreadEntity['status'] }
  & { tags?: string[] }  // Just tag names
  & ThreadLinkedFields
>;
export type ThreadLinkedFields = {
  linkedThreads?: ThreadLinkItem[];
}

export type ThreadCreateData = Simplify<ThreadEditFields>;
export type ThreadViewData = Simplify<
  ThreadCreateData
  & {
    id: ThreadEntity['id'];
    shortCode: ThreadEntity['shortCode'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    messages?: ThreadExtendedData['messages'];
  }
>;

export type ThreadExtended = Simplify<ThreadEntity & ThreadExtendedData>;
export type ThreadExtendedData = ThreadLinkedFields & {
  messages?: Partial<MessageEntity>[];
  tags?: string[];  // Tag names from thread entity
}

export type ThreadTypeShortCode = `T-${number}`;

import type { ThreadsSettings, ThreadTagOption } from '@/systems/settings/types';
export type { ThreadTagOption } from '@/systems/settings/types';

export type ThreadConnectedData = {
  threads: ThreadExtended[];
  availableTags: ThreadTagOption[];  // Tags from settings
  settings?: ThreadsSettings | null; // Full thread settings
}
