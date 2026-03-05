import { EARS } from '@/core/types';
import {
  findById,
  findAll,
  createEntityWithDefaults,
  updateEntity,
  createRelation,
  RepositoryError,
  RepositoryErrorCode
} from '@/core/helpers/repository';
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
      // Priority: lastVisitedTimestamp > lastMessageTimestamp > timestamp
      const aTime = a.lastVisitedTimestamp || a.lastMessageTimestamp || a.timestamp;
      const bTime = b.lastVisitedTimestamp || b.lastMessageTimestamp || b.timestamp;
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

  kanbanItems: () => {
    // Get all threads and transform them into kanban work items
    const allThreads = qx(EARS.Entity.Thread)
      .pick(['id', 'topic', 'status', 'updatedAt', 'createdAt', 'shortCode'] as const)
    
    // Sort threads by most recent update (fallback to createdAt)
    const sortedThreads = allThreads.sort((a, b) => {
      const aTime = (a.updatedAt as number) || (a.createdAt as number) || 0;
      const bTime = (b.updatedAt as number) || (b.createdAt as number) || 0;  
      return bTime - aTime;
    }
    );
    
    // Transform threads into work items
    const workItems = sortedThreads.map((thread, index) => ({
      id: thread.id,
      name: String(thread.topic || `Thread ${thread.shortCode || index + 1}`),
      time: new Date((thread.updatedAt as number) || (thread.createdAt as number) || Date.now()).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      date: new Date((thread.updatedAt as number) || (thread.createdAt as number) || Date.now()).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
      priority: 1, // Default priority
      tags: [],
      status: thread.status || 'backlog',
      type: 'work-item' as const
    }));
    
    return {
      content: {
        workItems
      },
      metadata: {
        createdAt: Date.now()
      }
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
      tags: input.tags || [],  // Store tags as array of names
      ...(input.forcedMode && { forcedMode: input.forcedMode })  // Set forced mode if provided
    });

    // Grant role if provided
    if (input.role) {
      tx(id).grant(input.role);
    }

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
    lastVisitedTimestamp?: number;
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

  markAsVisited: (id: EARS.EntityId): void => {
    if (!threadQueries.byId(id)) {
      throw new RepositoryError(`Thread ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    updateEntity(id, {
      lastVisitedTimestamp: Date.now(),
      updatedAt: Date.now()
    });
  },

  delete: (id: EARS.EntityId): void => {
    if (!threadQueries.byId(id)) {
      throw new RepositoryError(`Thread ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    // 1. Delete all messages linked to this thread
    const messages = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Message).ids();
    for (const messageId of messages) {
      tx(messageId).destroy();
    }

    // 2. Remove all thread relationships (parent_of, blocks, blocked_by, duplicates)
    // First, unlink this thread from any threads it links to
    const existingLinks = qx(id).links(['parent_of', 'blocks', 'blocked_by', 'duplicates']);
    for (const link of existingLinks) {
      tx(id).unlinkIf(EARS.RelKind.Custom(link.relation), link.id);
    }

    // Also unlink any threads that link to this thread
    // Find threads that have this thread as a linked thread
    const allThreads = findAll<ThreadEntity>(EARS.Entity.Thread);
    for (const thread of allThreads) {
      const linkedToThis = qx(thread.id).links(['parent_of', 'blocks', 'blocked_by', 'duplicates']);
      for (const link of linkedToThis) {
        if (link.id === id) {
          tx(thread.id).unlinkIf(EARS.RelKind.Custom(link.relation), id);
        }
      }
    }

    // 3. Delete any artifacts linked to this thread
    const artifacts = qx().relatedTo(id).ofType(EARS.Entity.Artifact).ids();
    for (const artifactId of artifacts) {
      tx(artifactId).destroy();
    }

    // 4. Finally, delete the thread entity itself
    tx(id).destroy();
  },
} as const;
