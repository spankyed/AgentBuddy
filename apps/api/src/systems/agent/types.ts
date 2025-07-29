import { BaseEntity } from "@/core/utils/ears";
import type { EARS, ThreadExtendedData } from "@/types";
import { ThreadEntity, ContextItemEntity, CanvasContentEntity } from "../threads/types";

export type AgentThreadData = {
    id?: ThreadEntity['id'];
    shortCode?: ThreadEntity['shortCode'];
    topic: ThreadEntity['topic'];
    instructions: ThreadEntity['instructions'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    messages: ThreadExtendedData['messages'];
    contextItems: ContextItemEntity[];
    canvasContent: CanvasContentEntity;
}

export type AgentStartupData = {
    currentThread: AgentThreadData | null;
    threads: Partial<ThreadEntity>[];
};
