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

export type AgentThreadRefreshData = {
    currentThread: AgentThreadData | null;
    threads: Partial<ThreadEntity>[];
    dashboardArtifacts: Partial<ArtifactEntity>[];
    tabs: Tab[];
};

// UI types for agent canvas
export interface Tab {
  id: string;
  label: string;
  artifacts: ArtifactItem[];
  selectedArtifactId?: string;
}

export type ArtifactType = 'text' | 'code' | 'review' | 'image' | 'kanban' | 'slack';

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
