import { BaseEntity } from "@/core/ears";
import type { EARS, ThreadExtendedData } from "@/types";
import { ThreadEntity, ArtifactEntity } from "../threads/types";
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
  pinned?: boolean;
}

export type RecentThreadRefreshData = {
  recentThreads: Partial<ThreadEntity>[];
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
  disabled?: boolean; // For modes that appear in selector but are non-selectable
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
  pinned?: boolean;
}

export type ArtifactType =
  'text'
  | 'code'
  | 'review'
  | 'image'
  | 'slack'
  | 'todo'
  | 'project'
  | 'json';

export interface ArtifactItem {
  id: string;
  type: ArtifactType;
  title: string;
  content: any;
  metadata?: {
    createdAt: number;
    updatedAt?: number;
    [key: string]: any;
  };
}
