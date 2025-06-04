import type { CanvasContentEntity, ContextItemEntity, EARS, MessageEntity, Rows, TagEntity, ThreadEntity, ThreadExtendedData } from "@/types";

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

export type AgentStartupData = {
    currentThread: AgentThreadData;
    threads: Partial<ThreadEntity>[];
};

type Row = Rows['entity'][number]

export function byEntityType<
    K extends Row['entityType']
>(type: K): (r: Row) => r is Extract<Row, { entityType: K }> {
    return (r): r is Extract<Row, { entityType: K }> => r.entityType === type
}