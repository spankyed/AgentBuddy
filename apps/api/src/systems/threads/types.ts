import type { MessageEntity, TagEntity, ThreadEntity } from "@/types";

export type ThreadsViewData = {
  messages: Partial<MessageEntity>[];
  relatedThreads?: Partial<ThreadEntity>[];
  tags?: Partial<TagEntity>[];
}