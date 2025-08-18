import { BaseEntity } from "@/core/utils/ears";
import type { EARS, ThreadExtendedData } from "@/types";
import { ThreadEntity, ArtifactEntity } from "../threads/types";

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

export interface AgentSettings {
    modes: Array<{
        id: string;
        name: string;
        description: string;
    }>;
    hotkeys: {
        textToSpeech?: { key: string; modifiers: string[] };
        switchMode?: { key: string; modifiers: string[]; global?: boolean };
        [key: string]: { key: string; modifiers: string[]; global?: boolean } | undefined;
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
