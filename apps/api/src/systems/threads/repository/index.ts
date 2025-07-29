import { EARS } from '@/core/types';
import { 
  findById, 
  findAll,
  createEntityWithDefaults,
  updateEntity,
  successResult,
  operationSuccess,
  errorResult,
  RepositoryError,
  RepositoryErrorCode,
  createRelation,
  type RepositoryResult,
  type OperationResult
} from '@/core/utils/repository';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import type {
  ThreadEntity, MessageEntity, TagEntity,
  ThreadCreateData, 
  ThreadExtendedData, 
  ThreadTypeCodes, 
  ThreadTypeShortCode,
  ThreadStartupData,
  ThreadTagItem
} from '../types';

/**
 * Threads Repository
 */

// Queries
export const threadQueries = {
  byId: (id: EARS.EntityId) => 
    findById<ThreadEntity>(id),
  
  all: () => 
    findAll<ThreadEntity>(EARS.Entity.Thread),
  
  allByRecency: () => {
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
    return threads.sort((a, b) => {
      const aTime = a.lastMessageTimestamp || a.timestamp;
      const bTime = b.lastMessageTimestamp || b.timestamp;
      return bTime - aTime;
    });
  },
  
  // Get thread messages
  messages: (threadId: EARS.EntityId) => 
    qx(threadId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Message)
      .pick(["text", "sender", "timestamp"] as const) as Partial<MessageEntity>[],
  
  // Get thread tags
  tags: (threadId: EARS.EntityId) =>
    qx(threadId)
      .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
      .pick(["name", "color"] as const) as ThreadTagItem[],
  
  // Get linked threads
  linkedThreads: (threadId: EARS.EntityId) =>
    qx(threadId)
      .linksPick(
        ["parent_of", "blocks", "blocked_by", "duplicates"],
        ["shortCode", "topic", "threadType", "status"] as const,
        EARS.Entity.Thread,
      ),
  
  // Get extended data
  extendedData: (
    threadId: EARS.EntityId,
    include?: keyof ThreadExtendedData | (keyof ThreadExtendedData)[]
  ): ThreadExtendedData => {
    const want = (k: keyof ThreadExtendedData) =>
      !include ? true : Array.isArray(include) ? include.includes(k) : include === k;

    return {
      messages: want("messages") ? threadQueries.messages(threadId) : [],
      tags: want("tags") ? threadQueries.tags(threadId) : [],
      linkedThreads: want("linkedThreads") ? threadQueries.linkedThreads(threadId) : [],
    };
  },
  
  // Get startup data
  startupData: (): ThreadStartupData => {
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
    const extendedThreads = threads.map(thread => ({
      ...thread,
      ...threadQueries.extendedData(thread.id),
    }));
    
    return {
      threads: extendedThreads,
      availableTags: findAll<TagEntity>(EARS.Entity.Tag),
    };
  },
} as const;

// Commands
export const threadCommands = {
  create: (input: ThreadCreateData): RepositoryResult<{ id: EARS.EntityId; shortCode: string; timestamp: number }> => {
    try {
      if (!input.topic?.trim()) {
        throw new RepositoryError('Topic is required', RepositoryErrorCode.VALIDATION_ERROR);
      }
      
      const ts = Date.now();
      const count = qx(EARS.Entity.Thread).count() + 1;
      const code: Record<ThreadEntity["threadType"], ThreadTypeCodes> = {
        "work-item": "WI",
        "project": "P",
        "user": "U",
      };
      const shortCode = `${code[input.threadType]}-${count}` as ThreadTypeShortCode;

      const id = tx(EARS.Entity.Thread)
        .put("status", "draft")
        .put("shortCode", shortCode)
        .put("timestamp", ts)
        .put("lastMessageTimestamp", ts)
        .put("createdAt", ts)
        .put("updatedAt", ts)
        .put("topic", input.topic)
        .put("instructions", input.instructions)
        .put("threadType", input.threadType)
        .id();

      // Create relationships
      for (const tag of input.tags ?? []) {
        tx(id).link(EARS.RelKind.HAS, tag.id);
      }
      for (const rel of input.linkedThreads ?? []) {
        tx(id).link(EARS.RelKind.Custom(rel.relation), rel.id);
      }

      return successResult({ id, shortCode, timestamp: ts });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  update: (id: EARS.EntityId, updates: {
    topic?: string;
    instructions?: string;
    status?: ThreadEntity['status'];
    tags?: ThreadTagItem[];
    linkedThreads?: any[];
  }): OperationResult => {
    try {
      if (!threadQueries.byId(id)) {
        throw new RepositoryError(`Thread ${id} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      const { tags, linkedThreads, ...fieldUpdates } = updates;
      
      // Update fields
      if (Object.keys(fieldUpdates).length > 0) {
        updateEntity(id, fieldUpdates);
      }
      
      // Update tags
      if (tags !== undefined) {
        tx(id).unlinkIf(EARS.RelKind.HAS);
        for (const tag of tags) {
          tx(id).link(EARS.RelKind.HAS, tag.id);
        }
      }
      
      // Update linked threads
      if (linkedThreads !== undefined) {
        // Remove all existing custom relations
        const existingLinks = qx(id).links(['parent_of', 'blocks', 'blocked_by', 'duplicates']);
        for (const link of existingLinks) {
          tx(id).unlinkIf(EARS.RelKind.Custom(link.relation), link.id);
        }
        
        // Add new relations
        for (const rel of linkedThreads) {
          tx(id).link(EARS.RelKind.Custom(rel.relation), rel.id);
        }
      }
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createTag: (name: string): RepositoryResult<EARS.EntityId> => {
    try {
      if (!name?.trim()) {
        throw new RepositoryError('Tag name is required', RepositoryErrorCode.VALIDATION_ERROR);
      }
      
      const id = tx(EARS.Entity.Tag)
        .put("name", name)
        .put("createdAt", Date.now())
        .put("updatedAt", Date.now())
        .id();
      
      return successResult(id);
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;
