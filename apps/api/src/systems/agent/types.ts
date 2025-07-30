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
};
