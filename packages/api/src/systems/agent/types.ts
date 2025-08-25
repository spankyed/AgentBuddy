import { BaseEntity } from "@/core/utils/ears";
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
}

export type RecentThreadRefreshData = {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
};

export interface AgentMode {
  id: string;
  name: string;
  description: string;
}

export interface AgentSettings {
  modes: AgentMode[];
  hotkeys: {
    textToSpeech?: KeyboardShortcut | null;
    switchMode?: KeyboardShortcut | null;
    [key: string]: KeyboardShortcut | null | undefined;
  };
}

export type AgentStartupData = {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
  dashboardArtifacts: Partial<ArtifactEntity>[];
  tabs: Tab[];
  settings?: AgentSettings;
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
  | 'kanban'
  | 'slack'
  | 'todo';

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
