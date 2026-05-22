import { registerRepository } from '@/repository';
import { EARS } from '@/core/types';
import {
  findById,
  findAll,
  updateEntity,
  RepositoryError,
  RepositoryErrorCode
} from '@/core/shared/repository';
import { wouldCreateCycle } from '@/core/ears/helpers/graph';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type {
  ThreadEntity, MessageEntity, ArtifactEntity, BlockConfig, MessageReferences,
  ThreadCreateData,
  ThreadExtendedData,
  ThreadTypeShortCode,
  ThreadConnectedData,
  ThreadTagOption,
  AgentThreadData, RecentThreadRefreshData, AgentConnectedData, Tab, ArtifactType, ArtifactItem,
} from '../types';
import type { ThreadsSettings } from '@/core/shared-types/settings';
import { repository } from '@/repository';

/**
 * Threads Repository
 */

// Queries
export const threadQueries = {
  byId: (id: EARS.EntityId) => 
    findById<ThreadEntity>(id),
  
  all: () =>
    findAll<ThreadEntity>(EARS.Entity.Thread).filter(t => !t.archived),

  allByRecency: () => {
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread).filter(t => !t.archived);
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
      .pick(["text", "sender", "timestamp", "compacted", "isCommand"] as const) as Partial<MessageEntity>[],
  
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
      // Core thread fields so SET_VIEW_DATA can populate the view fully
      topic: thread?.topic,
      instructions: thread?.instructions,
      status: thread?.status,
      pinned: thread?.pinned,
      shortCode: thread?.shortCode,
      timestamp: thread?.timestamp,
      tags: thread?.tags as string[] | undefined,
    };
  },

  archivedThreads: (): Partial<ThreadEntity>[] => {
    return getArchivedThreads();
  },

  kanbanItems: () => {
    // Get all threads and transform them into kanban work items
    const allThreads = (qx(EARS.Entity.Thread)
      .pick(['id', 'topic', 'status', 'updatedAt', 'createdAt', 'shortCode', 'archived'] as const) as any[])
      .filter((t: any) => !t.archived)
    
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
  
  // Get connected data — sends only thread metadata (no messages/linkedThreads).
  // Messages are fetched on demand via VIEW_THREAD / OPEN_THREAD_CHAT.
  connectedData: (): ThreadConnectedData => {
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread).filter(t => !t.archived);
    const extendedThreads = threads.map(thread => {
      // Compute parentId by finding threads that link to this one via 'parent_of' (reverse direction)
      const parentIds = qx(thread.id).linksTo('parent_of', EARS.Entity.Thread, false).ids();
      return {
        ...thread,
        ...(parentIds.length > 0 ? { parentId: parentIds[0] as string } : {}),
      };
    });

    // Sort by creation time (newest first)
    extendedThreads.sort((a, b) => {
      const aTime = (a.timestamp as number) || 0;
      const bTime = (b.timestamp as number) || 0;
      return bTime - aTime;
    });

    // Get tags from settings
    const threadsSettings = repository.settingsQueries.getPluginSettings('threads') as ThreadsSettings | undefined;
    const availableTags: ThreadTagOption[] = threadsSettings?.tags || [];

    // Build chat states map from thread entities directly
    const chatStates: Record<string, string> = {};
    for (const thread of extendedThreads) {
      const chatState = thread.chatState;
      if (typeof chatState === 'string') {
        chatStates[thread.id as string] = chatState;
      }
    }

    return {
      threads: extendedThreads,
      availableTags,
      chatStates,
    };
  },
} as const;

// Commands
export const threadCommands = {
  create: (input: ThreadCreateData & { id?: string }): { id: EARS.EntityId; shortCode: string; timestamp: number, status: string } => {
    if (!input.topic?.trim()) {
      throw new RepositoryError('Topic is required', RepositoryErrorCode.VALIDATION_ERROR);
    }

    const ts = Date.now();
    const count = qx(EARS.Entity.Thread).count() + 1;
    const shortCode = `T-${count}` as ThreadTypeShortCode;

    const id = input.id
      ? tx(input.id as EARS.EntityId, true).id()
      : tx(EARS.Entity.Thread).id();

    const status = input.status || repository.settingsQueries.getPluginSettings('threads')?.statuses[0]?.label || '';
    tx(id).updateBatch({
      status,
      shortCode: shortCode,
      timestamp: ts,
      lastMessageTimestamp: ts,
      createdAt: ts,
      updatedAt: ts,
      topic: input.topic,
      instructions: input.instructions,
      tags: input.tags || [],  // Store tags as array of names
      ...(input.forcedMode && { forcedMode: input.forcedMode }),  // Set forced mode if provided
      ...(input.pinned && { pinned: input.pinned })
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
    forcedMode?: ThreadEntity['forcedMode'] | null;
    context?: ThreadEntity['context'];  // Free-form per-feature state (ThreadContext)
    archived?: boolean;
    chatState?: string;
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

  linkFork: (sourceThreadId: EARS.EntityId, forkedThreadId: EARS.EntityId): void => {
    tx(forkedThreadId).link(EARS.RelKind.Custom('forked_from'), sourceThreadId);
  },

  forkCount: (sourceThreadId: EARS.EntityId): number => {
    return qx(sourceThreadId).linksTo('forked_from', EARS.Entity.Thread, false).ids().length;
  },

  setParent: (parentId: EARS.EntityId, childIds: EARS.EntityId[]): { reparented: string[]; skipped: string[] } => {
    const reparented: string[] = [];
    const skipped: string[] = [];

    for (const childId of childIds) {
      // Skip if trying to parent to self
      if (childId === parentId) {
        skipped.push(childId);
        continue;
      }

      // Check for cycles: would adding parentId -> childId create a loop?
      if (wouldCreateCycle(parentId, childId, [EARS.RelKind.PARENT_OF])) {
        skipped.push(childId);
        continue;
      }

      // Remove existing parent link (reverse direction: find who has parent_of pointing to this child)
      const oldParentIds = qx(childId).linksTo('parent_of', EARS.Entity.Thread, false).ids();
      for (const oldParentId of oldParentIds) {
        tx(oldParentId).unlinkIf(EARS.RelKind.PARENT_OF, childId);
      }

      // Create new parent_of link
      tx(parentId).link(EARS.RelKind.PARENT_OF, childId);
      reparented.push(childId);
    }

    return { reparented, skipped };
  },

  delete: (id: EARS.EntityId): void => {
    const thread = threadQueries.byId(id);
    if (!thread) {
      throw new RepositoryError(`Thread ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    if (thread.pinned) {
      throw new RepositoryError(`Cannot delete pinned thread ${id}`, RepositoryErrorCode.VALIDATION_ERROR);
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

// ---- Chat queries & commands (merged from agent system) ----

const THREAD_TOPIC_MAX_LENGTH = 40;
const RECENT_THREADS_FALLBACK_LIMIT = 7;

function getConfiguredRecentThreadsLimit(): number {
  const configured = repository.settingsQueries.getPluginSettings('threads')?.recentThreadsLimit;
  return typeof configured === 'number' && configured > 0
    ? configured
    : RECENT_THREADS_FALLBACK_LIMIT;
}

function getConfiguredSortOrder(): 'created' | 'visited' | 'message' {
  const configured = repository.settingsQueries.getPluginSettings('threads')?.recentThreadsSortOrder;
  return configured === 'visited' || configured === 'message' ? configured : 'created';
}

function getSortTimestamp(thread: Partial<ThreadEntity>, sortOrder: 'created' | 'visited' | 'message'): number {
  switch (sortOrder) {
    case 'visited': return thread.lastVisitedTimestamp || thread.timestamp || 0;
    case 'message': return thread.lastMessageTimestamp || thread.timestamp || 0;
    case 'created':
    default: return thread.timestamp || 0;
  }
}

function getRecentThreads(limit: number = getConfiguredRecentThreadsLimit()): Partial<ThreadEntity>[] {
  const threadFields = [
    "shortCode", "topic", "instructions", "status", "timestamp",
    "lastMessageTimestamp", "lastVisitedTimestamp", "forcedMode", "pinned", "archived", "chatState", "context",
  ] as const;

  const allThreads = (qx(EARS.Entity.Thread).pick(threadFields) as Partial<ThreadEntity>[])
    .filter(t => !t.archived);

  const sortOrder = getConfiguredSortOrder();

  return allThreads
    .sort((a, b) => getSortTimestamp(b, sortOrder) - getSortTimestamp(a, sortOrder))
    .slice(0, limit);
}

function getArchivedThreads(): Partial<ThreadEntity>[] {
  const threadFields = [
    "shortCode", "topic", "instructions", "status", "timestamp",
    "lastMessageTimestamp", "lastVisitedTimestamp", "forcedMode", "pinned", "archived", "chatState", "context",
  ] as const;

  return (qx(EARS.Entity.Thread).pick(threadFields) as Partial<ThreadEntity>[])
    .filter(t => t.archived)
    .sort((a, b) => getSortTimestamp(b, getConfiguredSortOrder()) - getSortTimestamp(a, getConfiguredSortOrder()));
}

function getThreadsWithCurrent(limit: number = getConfiguredRecentThreadsLimit()): {
  threads: Partial<ThreadEntity>[];
  currentThread: AgentThreadData | null;
} {
  const threads = getRecentThreads(limit);

  if (threads.length === 0) {
    return { threads, currentThread: null };
  }

  const mostRecentThread = threads[0];

  // Send only thread metadata — messages are loaded on demand via OPEN_THREAD_CHAT
  const currentThread: AgentThreadData = {
    id: mostRecentThread.id,
    shortCode: mostRecentThread.shortCode,
    topic: mostRecentThread.topic || '',
    instructions: mostRecentThread.instructions || '',
    status: mostRecentThread.status || 'backlog',
    timestamp: mostRecentThread.timestamp || Date.now(),
    forcedMode: mostRecentThread.forcedMode,
    chatState: mostRecentThread.chatState,
    context: mostRecentThread.context,
    messages: [],
    artifacts: mostRecentThread.id
      ? getThreadArtifacts(mostRecentThread.id) as any as ArtifactEntity[]
      : [],
  };

  return { threads, currentThread };
}

function getThreadArtifacts(threadId: EARS.EntityId): ArtifactItem[] {
  const artifacts = qx().relatedTo(threadId).ofType(EARS.Entity.Artifact)
    .pick(['id', 'title', 'content', 'artifactType', 'createdAt'] as const);

  if (!artifacts || artifacts.length === 0) return [];

  return artifacts
    .map(artifact => ({
      id: artifact.id,
      type: (artifact.artifactType || 'text') as ArtifactType,
      title: String(artifact.title || ''),
      content: artifact.content,
      metadata: { createdAt: (artifact.createdAt as number) || 0 }
    }))
    .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
}

export const chatQueries = {
  hasRequiredApiKeys: (): boolean => {
    const secrets = repository.settingsQueries.getGeneralSettings().secrets;
    const required = ['openai', 'anthropic'];
    return required.some(provider => {
      const secretId = secrets[provider as keyof typeof secrets];
      return secretId !== null && secretId !== undefined && secretId !== '';
    });
  },

  threadArtifacts: (threadId: EARS.EntityId) => {
    return getThreadArtifacts(threadId);
  },

  threadData: (threadId: EARS.EntityId): AgentThreadData | null => {
    const thread = qx(threadId)
      .orderBy('timestamp', 'desc')
      .limit(4)
      .pick(["shortCode", "topic", "instructions", "status", "timestamp", "forcedMode", "pinned", "chatState", "context"] as const);

    if (!thread[0]) return null;

    return {
      ...thread[0] as AgentThreadData,
      messages: (qx(threadId)
        .linksPick(
          EARS.RelKind.CONTAINS,
          ["id", "text", "sender", "timestamp", "blocks", "blockResponse", "responseTimestamp", "forkable", "references", "isCommand", "command", "deleted", "context", "autoHide", "asUser", "asideText", "asideContext", "status", "compacted"] as const,
          EARS.Entity.Message,
        ) ?? [])
        .filter((m: any) => !m.deleted)
        .sort((a: any, b: any) => {
          // Safety net: queued messages always appear last
          if (a.status === 'queued' && b.status !== 'queued') return 1;
          if (b.status === 'queued' && a.status !== 'queued') return -1;
          return 0;
        }) as Partial<MessageEntity>[],
      artifacts: getThreadArtifacts(threadId) as any as ArtifactEntity[],
    };
  },

  refreshThreadsData: (): RecentThreadRefreshData => {
    return { recentThreads: getRecentThreads() };
  },

  connectedData: (): AgentConnectedData => {
    const { threads, currentThread } = getThreadsWithCurrent();
    const tabs: Tab[] = [];

    const pinnedThreads = (qx(EARS.Entity.Thread)
      .where('pinned', true)
      .pick(["id", "shortCode", "topic", "archived"] as const) as Partial<ThreadEntity>[])
      .filter(t => !t.archived);
    const pinnedIds = new Set(pinnedThreads.map(t => t.id));

    if (currentThread?.id) {
      const artifacts = getThreadArtifacts(currentThread.id);
      const threadTab: Tab = {
        id: currentThread.id,
        label: currentThread.topic || `Thread ${currentThread.shortCode || ''}`,
        artifacts,
        selectedArtifactId: artifacts[0]?.id,
        ...(pinnedIds.has(currentThread.id) && { pinned: true }),
      };
      tabs.push(threadTab);
    }

    for (const pt of pinnedThreads) {
      if (!pt.id || pt.id === currentThread?.id) continue;
      const ptArtifacts = getThreadArtifacts(pt.id);
      tabs.unshift({
        id: pt.id,
        label: pt.topic || 'No topic',
        artifacts: ptArtifacts,
        selectedArtifactId: ptArtifacts[0]?.id,
        pinned: true,
      });
    }

    const allSettings = repository.settingsQueries.getSettings();
    const chatSettings = allSettings?.plugins?.threads?.chat ?? allSettings?.plugins?.agent;

    return {
      currentThread,
      threads,
      recentThreads: getRecentThreads(),
      tabs,
      settings: chatSettings,
      hasRequiredApiKeys: chatQueries.hasRequiredApiKeys(),
    };
  },

  messageById: (messageId: EARS.EntityId): MessageEntity | null => {
    const message = qx(messageId).pickOne([
      'id', 'text', 'sender', 'timestamp', 'blocks', 'blockResponse',
      'responseTimestamp', 'createdAt', 'updatedAt', 'autoHide', 'asUser', 'asideText', 'asideContext',
      'forkable', 'references', 'isCommand', 'command', 'status', 'context', 'compacted'
    ] as const);

    if (!message) return null;

    return { ...message, entityType: EARS.Entity.Message } as MessageEntity;
  }
} as const;

/**
 * Move a message to the end of its thread's CONTAINS relation list.
 * Used to keep queued messages at the bottom of the conversation.
 */
function relinkMessageToEnd(threadId: EARS.EntityId, messageId: EARS.EntityId): void {
  tx(threadId).unlinkIf(EARS.RelKind.CONTAINS, messageId);
  tx(messageId).unlinkIf(EARS.RelKind.CONTAINS, threadId);
  tx(threadId).link(EARS.RelKind.CONTAINS, messageId);
  tx(messageId).link(EARS.RelKind.CONTAINS, threadId);
}

export const chatCommands = {
  addMessage: (params: {
    threadId: EARS.EntityId;
    text: string;
    sender: 'user' | 'assistant' | 'system' | 'marker';
    blocks?: BlockConfig[];
    forkable?: boolean;
    references?: MessageReferences;
    isCommand?: boolean;
    command?: string;
    autoHide?: boolean;
    asUser?: boolean;
    asideContext?: string;
    blockResponse?: any;
    responseTimestamp?: number;
    asideText?: string;
    compacted?: boolean;
    context?: Record<string, unknown>;
    skipRelink?: boolean;
  }): {
    id: EARS.EntityId;
    threadId: EARS.EntityId;
    text: string;
    sender: string;
    timestamp: number;
  } => {
    const { threadId, text, sender, blocks, forkable, references, isCommand, command, autoHide, asUser, asideContext, blockResponse, responseTimestamp, asideText, compacted, context, skipRelink } = params;

    const thread = qx(threadId).id();
    if (!thread) {
      throw new RepositoryError(`Thread ${threadId} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    const validSenders = ['user', 'assistant', 'system', 'marker'];
    if (!validSenders.includes(sender)) {
      throw new RepositoryError(
        `Invalid sender type. Must be one of: ${validSenders.join(', ')}`,
        RepositoryErrorCode.VALIDATION_ERROR
      );
    }

    const timestamp = Date.now();
    const messageTx = tx(EARS.Entity.Message)
      .put('text', text.trim())
      .put('timestamp', timestamp)
      .put('sender', sender)
      .put('createdAt', timestamp)
      .put('updatedAt', timestamp);

    if (blocks) messageTx.put('blocks', blocks);
    if (forkable !== undefined) messageTx.put('forkable', forkable);
    if (references) messageTx.put('references', references);
    if (isCommand) messageTx.put('isCommand', isCommand);
    if (command) messageTx.put('command', command);
    if (autoHide) messageTx.put('autoHide', autoHide);
    if (asUser) messageTx.put('asUser', asUser);
    if (asideContext) messageTx.put('asideContext', asideContext);
    if (blockResponse) messageTx.put('blockResponse', blockResponse);
    if (responseTimestamp) messageTx.put('responseTimestamp', responseTimestamp);
    if (asideText) messageTx.put('asideText', asideText);
    if (compacted) messageTx.put('compacted', compacted);
    if (context) messageTx.put('context', context);

    const messageId = messageTx.link(EARS.RelKind.CONTAINS, threadId).id();

    tx(threadId).link(EARS.RelKind.CONTAINS, messageId);
    tx(threadId).update('lastMessageTimestamp', timestamp);

    // Keep queued messages at the end of the relation list so they always
    // render below the current agent turn — even after a thread reload.
    // Skipped during bulk import (no queued messages in imported data).
    if (!skipRelink) {
      const siblings = qx(threadId)
        .linksPick(EARS.RelKind.CONTAINS, ['id', 'status'] as const, EARS.Entity.Message);
      if (siblings) {
        for (const sib of siblings) {
          if ((sib as any).status === 'queued' && sib.id !== messageId) {
            relinkMessageToEnd(threadId, sib.id!);
          }
        }
      }
    }

    return { id: messageId, threadId, text: text.trim(), sender, timestamp };
  },

  createThreadFromMessage: (text: string): {
    threadId: EARS.EntityId;
    threadData: ReturnType<typeof threadCommands.create>;
  } => {
    const threadData = threadCommands.create({
      topic: text.substring(0, THREAD_TOPIC_MAX_LENGTH),
      instructions: '',
    });

    return { threadId: threadData.id, threadData };
  },

  updateMessageBlockResponse: (params: {
    messageId: EARS.EntityId;
    response: any;
  }): {
    messageId: EARS.EntityId;
    responseTimestamp: number;
    updatedAt: number;
    blocks?: BlockConfig[];
  } => {
    const { messageId, response } = params;

    const message = qx(messageId).id();
    if (!message) {
      throw new RepositoryError(`Message ${messageId} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    const now = Date.now();

    tx(messageId)
      .put('blockResponse', response)
      .put('responseTimestamp', now)
      .put('updatedAt', now);

    let updatedBlocks: BlockConfig[] | undefined;
    const fullMessage = qx(messageId).pickOne(['blocks']);

    if (fullMessage?.blocks && response.buttonId) {
      let buttonToggled = false;
      const newBlocks = fullMessage.blocks.map((block: BlockConfig) => {
        if (block.type === 'button-group') {
          const updatedButtons = block.props.buttons.map((button: any) => {
            if (button.toggleStates && button.id === response.buttonId) {
              buttonToggled = true;
              return { ...button, state: button.state === 'on' ? 'off' : 'on' };
            }
            return button;
          });
          return { ...block, props: { ...block.props, buttons: updatedButtons } };
        }
        return block;
      });

      if (buttonToggled) {
        updatedBlocks = newBlocks;
        tx(messageId).put('blocks', newBlocks).put('updatedAt', now);
      }
    }

    return {
      messageId,
      responseTimestamp: now,
      updatedAt: now,
      ...(updatedBlocks && { blocks: updatedBlocks })
    };
  },

  updateMessageState: (params: {
    messageId: EARS.EntityId;
    updates: Partial<Pick<MessageEntity, 'text' | 'blocks' | 'blockResponse' | 'responseTimestamp' | 'forkable' | 'status' | 'context' | 'compacted'>>;
  }): {
    messageId: EARS.EntityId;
    updatedAt: number;
    updates: typeof params.updates;
  } => {
    const { messageId, updates } = params;

    const message = qx(messageId).id();
    if (!message) {
      throw new RepositoryError(`Message ${messageId} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    const now = Date.now();
    const updateData: Record<string, any> = { ...updates, updatedAt: now };
    tx(messageId).updateBatch(updateData);

    // When a message becomes queued, move it to the end of its thread's
    // CONTAINS relation so it always appears last — even after a reload.
    if (updates.status === 'queued') {
      const threadLinks = qx(messageId).links(EARS.RelKind.CONTAINS, EARS.Entity.Thread);
      for (const { id: tid } of threadLinks) {
        relinkMessageToEnd(tid, messageId);
      }
    }

    return { messageId, updatedAt: now, updates };
  },

  createMarkerMessage: (params: {
    threadId: EARS.EntityId;
    text: string;
  }): {
    id: EARS.EntityId;
    threadId: EARS.EntityId;
    text: string;
    sender: string;
    timestamp: number;
    compactedMessageIds: EARS.EntityId[];
  } => {
    const { threadId, text } = params;

    const thread = qx(threadId).id();
    if (!thread) {
      throw new RepositoryError(`Thread ${threadId} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    // Collect eligible messages: exclude markers and already-compacted messages
    const allMessages = threadQueries.messages(threadId);
    const eligible = allMessages.filter(
      (m: any) => m.sender !== 'marker' && !m.compacted && m.id
    );

    const timestamp = Date.now();
    const markerTx = tx(EARS.Entity.Message)
      .put('text', text.trim())
      .put('timestamp', timestamp)
      .put('sender', 'marker')
      .put('createdAt', timestamp)
      .put('updatedAt', timestamp);

    const markerId = markerTx.link(EARS.RelKind.CONTAINS, threadId).id();
    tx(threadId).link(EARS.RelKind.CONTAINS, markerId);
    tx(threadId).update('lastMessageTimestamp', timestamp);

    // Link marker to eligible messages and set compacted flag
    const compactedMessageIds: EARS.EntityId[] = [];
    for (const msg of eligible) {
      const msgId = (msg as any).id as EARS.EntityId;
      tx(markerId).link(EARS.RelKind.Custom('compacts'), msgId);
      tx(msgId).put('compacted', true);
      compactedMessageIds.push(msgId);
    }

    return { id: markerId, threadId, text: text.trim(), sender: 'marker', timestamp, compactedMessageIds };
  },

  toggleMarkerCompacted: (markerId: EARS.EntityId, compacted: boolean): EARS.EntityId[] => {
    const marker = qx(markerId).id();
    if (!marker) {
      throw new RepositoryError(`Marker ${markerId} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    const messageIds = (qx(markerId)
      .linksTo(EARS.RelKind.Custom('compacts'), EARS.Entity.Message)
      .pick([] as const) ?? []).map((m: any) => m.id) as EARS.EntityId[];

    for (const msgId of messageIds) {
      tx(msgId).put('compacted', compacted);
    }

    return messageIds;
  },

  copyMessagesUpTo: (params: {
    sourceThreadId: EARS.EntityId;
    targetThreadId: EARS.EntityId;
    upToMessageId: string;
  }): void => {
    const { sourceThreadId, targetThreadId, upToMessageId } = params;
    const sourceData = chatQueries.threadData(sourceThreadId);
    if (!sourceData) return;
    const sourceMessages = sourceData.messages || [];

    const copyableKeys = ['blocks', 'forkable', 'references', 'isCommand', 'command', 'autoHide', 'asUser', 'asideText', 'asideContext', 'blockResponse', 'responseTimestamp', 'status', 'context', 'compacted'] as const;

    for (const msg of sourceMessages) {
      const optional: Record<string, any> = {};
      for (const key of copyableKeys) {
        if (msg[key] !== undefined) optional[key] = msg[key];
      }

      chatCommands.addMessage({
        threadId: targetThreadId,
        text: msg.text || '',
        sender: (msg.sender as 'user' | 'assistant' | 'system') || 'user',
        ...optional,
      });

      if (msg.id === upToMessageId) break;
    }
  },

  softDeleteMessagesAfter: (params: {
    threadId: EARS.EntityId;
    messageId: EARS.EntityId;
  }): { deletedCount: number; deletedIds: string[] } => {
    const { threadId, messageId } = params;

    const messages = qx(threadId)
      .linksPick(EARS.RelKind.CONTAINS, ["id", "deleted"] as const, EARS.Entity.Message) ?? [];

    const nonDeleted = messages.filter((m: any) => !m.deleted);
    const targetIndex = nonDeleted.findIndex((m: any) => m.id === messageId);

    if (targetIndex === -1) {
      throw new RepositoryError(`Message ${messageId} not found in thread ${threadId}`, RepositoryErrorCode.NOT_FOUND);
    }

    // Delete the target message AND everything after it — the user is
    // "undoing" their message. The message text is prefilled into the chat
    // input so they can re-send or edit it.
    const toDelete = nonDeleted.slice(targetIndex);
    const now = Date.now();
    const deletedIds: string[] = [];

    for (const msg of toDelete) {
      if (msg.id) {
        tx(msg.id as EARS.EntityId).put('deleted', true).put('deletedAt', now);
        deletedIds.push(msg.id as string);
      }
    }

    return { deletedCount: deletedIds.length, deletedIds };
  },

  createArtifact: (params: {
    artifactType: ArtifactType;
    title: string;
    content: any;
    threadId?: EARS.EntityId;
  }): { artifactId: EARS.EntityId } => {
    const { artifactType, title, content, threadId } = params;

    const artifactId = tx(EARS.Entity.Artifact)
      .put('entityType', EARS.Entity.Artifact)
      .put('title', title)
      .put('artifactType', artifactType)
      .put('content', content)
      .put('createdAt', Date.now())
      .id();

    if (threadId) {
      tx(threadId).link(EARS.RelKind.HAS, artifactId);
      tx(artifactId).link(EARS.RelKind.RELATES_TO, threadId);
    }

    return { artifactId };
  },

  /**
   * Patch an existing artifact's title and/or content in place.
   *
   * Used by `services.artifact.updateAndNotify` for artifacts that need to
   * mutate across turns (e.g. the Claude Code session card, which tracks
   * live status / cost / turn count).
   */
  updateArtifact: (
    artifactId: EARS.EntityId,
    patch: { title?: string; content?: unknown },
  ): void => {
    const txn = tx(artifactId);
    if (patch.title !== undefined) txn.put('title', patch.title);
    if (patch.content !== undefined) txn.put('content', patch.content);
    txn.put('updatedAt', Date.now()).id();
  },

  /**
   * Find an artifact by (thread, artifactType). Used by upsert helpers to
   * avoid creating duplicates on repeated turns. Returns the first match
   * (there should only ever be one for singleton types like claude-session).
   */
  findArtifactByType: (
    threadId: EARS.EntityId,
    artifactType: ArtifactType,
  ): ArtifactEntity | undefined => {
    const candidates = qx(threadId)
      .linksPick(
        EARS.RelKind.HAS,
        ['artifactType'] as const,
        EARS.Entity.Artifact,
      )
      .filter(({ artifactType: t }) => t === artifactType);
    const first = candidates[0];
    if (!first?.id) return undefined;
    return qx([first.id as EARS.EntityId]).pickAll()[0] as unknown as ArtifactEntity;
  },
} as const;

registerRepository('threadQueries', threadQueries);
registerRepository('threadCommands', threadCommands);
registerRepository('chatQueries', chatQueries);
registerRepository('chatCommands', chatCommands);
