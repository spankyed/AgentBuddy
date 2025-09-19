import { EARS } from '@/core/types';
import { 
  findById, 
  findAll,
  createEntityWithDefaults,
  updateEntity,
  createRelation,
  RepositoryError,
  RepositoryErrorCode
} from '@/core/utils/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type {
  ThreadEntity, MessageEntity,
  ThreadCreateData, 
  ThreadExtendedData, 
  ThreadTypeShortCode,
  ThreadConnectedData,
  ThreadTagOption
} from '../types';
import type { ThreadsSettings } from '@/systems/settings/types';
import { settingsQueries } from '@/systems/settings/repository';

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
  
  // Get linked threads
  linkedThreads: (threadId: EARS.EntityId) =>
    qx(threadId)
      .linksPick(
        ["parent_of", "blocks", "blocked_by", "duplicates"],
        ["shortCode", "topic", "status"] as const,
        EARS.Entity.Thread,
      ),
  
  // Get extended data
  extendedData: (
    threadId: EARS.EntityId,
    include?: keyof ThreadExtendedData | (keyof ThreadExtendedData)[]
  ): ThreadExtendedData => {
    const want = (k: keyof ThreadExtendedData) =>
      !include ? true : Array.isArray(include) ? include.includes(k) : include === k;

    const thread = threadQueries.byId(threadId);
    return {
      messages: want("messages") ? threadQueries.messages(threadId) : [],
      linkedThreads: want("linkedThreads") ? threadQueries.linkedThreads(threadId) : [],
    };
  },
  
  // Get connected data
  connectedData: (): ThreadConnectedData => {
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
    const extendedThreads = threads.map(thread => ({
      ...thread,
      ...threadQueries.extendedData(thread.id),
    }));
    
    // Get tags from settings
    const threadsSettings = settingsQueries.getPluginSettings('threads') as ThreadsSettings | undefined;
    const availableTags: ThreadTagOption[] = threadsSettings?.tags || [];
    
    return {
      threads: extendedThreads,
      availableTags,
    };
  },
} as const;

// Commands
export const threadCommands = {
  create: (input: ThreadCreateData): { id: EARS.EntityId; shortCode: string; timestamp: number, status: string } => {
    if (!input.topic?.trim()) {
      throw new RepositoryError('Topic is required', RepositoryErrorCode.VALIDATION_ERROR);
    }
    
    const ts = Date.now();
    const count = qx(EARS.Entity.Thread).count() + 1;
    const shortCode = `T-${count}` as ThreadTypeShortCode;

    const id = tx(EARS.Entity.Thread).id();

    const status = settingsQueries.getPluginSettings('threads')?.statuses[0]?.label || "Backlog";
    tx(id).updateBatch({
      status: status,
      shortCode: shortCode,
      timestamp: ts,
      lastMessageTimestamp: ts,
      createdAt: ts,
      updatedAt: ts,
      topic: input.topic,
      instructions: input.instructions,
      tags: input.tags || []  // Store tags as array of names
    });

    // Create relationships for linked threads only
    for (const rel of input.linkedThreads ?? []) {
      tx(id).link(EARS.RelKind.Custom(rel.relation), rel.id);
    }

    return { id, shortCode, timestamp: ts, status };
  },
  
  update: (id: EARS.EntityId, updates: {
    topic?: string;
    instructions?: string;
    status?: string; // Dynamic status from settings
    tags?: string[];  // Tag names from settings
    linkedThreads?: any[];
    lastMessageTimestamp?: number;
  }): void => {
    if (!threadQueries.byId(id)) {
      throw new RepositoryError(`Thread ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    
    const { linkedThreads, ...fieldUpdates } = updates;
    
    // Update fields (including tags as a direct field)
    if (Object.keys(fieldUpdates).length > 0) {
      updateEntity(id, fieldUpdates);
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
  },
} as const;
