import { BaseEntity } from "@/core/ears";
import type { EARS, ThreadExtendedData } from "@/types";
import { ThreadEntity, ArtifactEntity, BlockConfig } from "../threads/types";
import type { KeyboardShortcut } from "../settings/types";

export type AgentThreadData = {
  id?: ThreadEntity['id'];
  shortCode?: ThreadEntity['shortCode'];
  topic: ThreadEntity['topic'];
  instructions: ThreadEntity['instructions'];
  status: ThreadEntity['status'];
  timestamp: ThreadEntity['timestamp'];
  messages: ThreadExtendedData['messages'];
  artifacts: ArtifactEntity[];
  forcedMode?: ThreadEntity['forcedMode'];
}

export type RecentThreadRefreshData = {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
};

export interface AgentPhase {
  id: string;
  name: string;
  description: string;
}

export interface AgentMode {
  id: string;
  name: string;
  description: string;
  phases?: AgentPhase[];
  hidden?: boolean; // For modes that shouldn't appear in selector (e.g., birth)
}

export interface AgentSettings {
  modes: AgentMode[];
  hotkeys: {
    textToSpeech?: KeyboardShortcut | null;
    switchMode?: KeyboardShortcut | null;
    [key: string]: KeyboardShortcut | null | undefined;
  };
}

export type AgentConnectedData = {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
  tabs: Tab[];
  settings?: AgentSettings;
  hasRequiredApiKeys: boolean;
};

// UI types for agent canvas
export interface Tab {
  id: string;
  label: string;
  artifacts: ArtifactItem[];
  selectedArtifactId?: string;
}

export type ArtifactType =
  'text'
  | 'code'
  | 'review'
  | 'image'
  | 'slack'
  | 'todo'
  | 'workspace';

export interface ArtifactItem {
  id: string;
  type: ArtifactType;
  title: string;
  content: any; // Deprecated: Use blocks instead. Kept for backward compatibility.
  blocks?: BlockConfig[];
  blockResponse?: any;
  responseTimestamp?: number;
  metadata?: {
    createdAt: number;
    updatedAt?: number;
    [key: string]: any;
  };
}
