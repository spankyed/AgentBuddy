import type { Simplify } from "@/shared/utils/type-helpers";
import type { CanvasContentEntity, ContextItemEntity, EARS, MessageEntity, TagEntity, ThreadEntity, ThreadExtendedData } from "@/types";

export type AgentThreadData = {
    id: ThreadEntity['id'];
    shortCode: ThreadEntity['shortCode'];
    topic: ThreadEntity['topic'];
    instructions: ThreadEntity['instructions'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    messages: ThreadExtendedData['messages'];
    contextItems: ContextItemEntity[];
    canvasContent: CanvasContentEntity;
}
