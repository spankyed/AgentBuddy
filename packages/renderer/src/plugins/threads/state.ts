import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, enqueueActions, fromPromise, spawnChild } from 'xstate';
import { type NavHistory, createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward } from '@/core/utils/nav-history';
import type { ActorRefFrom } from 'xstate';
import type {
  ThreadEntity, OutgoingThreadsEvents,
  ThreadCreateData, ThreadViewData, ThreadTagOption, ThreadEditFields, ThreadsSettings, EARS,
  MessageEntity, AgentThreadData, Tab,
  AgentSettings, AgentMode as AgentModeConfig, MessageReferences, CommandItem, BlockResponse,
} from '@app/api';
import { trpc } from '@/core/trpc';
import { Archive, Copy, Pin, Trash2 } from 'lucide-vue-next';
import { contextMenuFn } from '@/core/context-menu';
import type { Simplify } from '@/core/types/type-helpers';
import { navigateToPlugin } from '@/core/utils/navigate';
import { type HotkeyEvent, type HotkeysMap, createHotkeyProcessor } from '@/core/utils/hotkeys';
import type { ThreadTabGroup, TabGroupColor } from '@/plugins/threads/canvas/agent/tabs/types';
import { getNextAvailableColor } from '@/plugins/threads/canvas/agent/tabs/types';
import { saveThreadTabGroups, loadThreadTabGroups } from '@/plugins/threads/canvas/agent/tabs/tab-groups';

export const id = 'threads' as const;

// Module-level mouse position tracker (read when hotkey fires)
let mouseX = 0;
let mouseY = 0;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });

const THREADS_VIEW_KEY = 'threads-view-preference';

function getInitialView(): 'list' | 'kanban' | 'dashboard' {
  try {
    const stored = localStorage.getItem(THREADS_VIEW_KEY);
    if (stored === 'kanban') return 'kanban';
    if (stored === 'dashboard') return 'dashboard';
  } catch {}
  return 'list';
}

const THREADS_TABS_KEY = 'threads-open-tabs';

interface StoredTabData {
  tabs: { id: string; label: string; groupId?: string }[];
  activeTabId: string;
}

function saveTabsToStorage(tabs: Tab[], activeTabId: string) {
  try {
    localStorage.setItem(THREADS_TABS_KEY, JSON.stringify({
      tabs: tabs.filter(t => !t.pinned).map(t => ({ id: t.id, label: t.label, ...(t.groupId && { groupId: t.groupId }) })),
      activeTabId,
    } satisfies StoredTabData));
  } catch {}
}

function loadTabsFromStorage(): StoredTabData | null {
  try {
    const raw = localStorage.getItem(THREADS_TABS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Backward compat: old format stored tabIds as string[]
    if (parsed.tabIds && !parsed.tabs) {
      return {
        tabs: parsed.tabIds.map((id: string) => ({ id, label: '' })),
        activeTabId: parsed.activeTabId || '',
      };
    }
    return parsed;
  } catch { return null; }
}

function extractChatSettings(chatSettings: AgentSettings) {
  const hotkeys: HotkeysMap = {};
  if (chatSettings.hotkeys) {
    Object.entries(chatSettings.hotkeys).forEach(([key, value]) => {
      if (value) hotkeys[key] = value;
    });
  }
  return { chatSettings, hotkeys, modes: chatSettings.modes || [] };
}

export function resolveDefaultModePhase(
  settings: AgentSettings | undefined,
  modes: AgentModeConfig[],
  fallbackMode: string,
  fallbackPhase: string | undefined,
): { mode: string; phase: string | undefined } {
  const preferredMode = settings?.defaultMode
    ? modes.find(m => m.name === settings.defaultMode)
    : undefined;
  const fallbackModeConfig = modes.find(m => m.name === fallbackMode);
  const modeConfig = preferredMode && !preferredMode.hidden && !preferredMode.disabled
    ? preferredMode
    : fallbackModeConfig;
  const mode = modeConfig?.name ?? fallbackMode;

  const hasPhases = !!modeConfig?.phases?.length;
  const preferredPhase = settings?.defaultPhase
    ? modeConfig?.phases?.find(p => p.name === settings.defaultPhase)
    : undefined;
  const fallbackPhaseConfig = fallbackPhase
    ? modeConfig?.phases?.find(p => p.name === fallbackPhase)
    : undefined;
  const phase = hasPhases
    ? (preferredPhase?.name ?? fallbackPhaseConfig?.name ?? modeConfig!.phases![0].name)
    : fallbackPhase;

  return { mode, phase };
}

export type ThreadsState = ActorRefFrom<typeof threadsState>;

const defaultThread: ThreadCreateData | ThreadViewData = {
  topic: '',
  instructions: '',
  tags: [],
  linkedThreads: [],
}

const defaultChatThread: AgentThreadData = {
  id: undefined,
  shortCode: '',
  topic: '',
  instructions: '',
  status: 'backlog',
  timestamp: Date.now(),
  messages: [],
  artifacts: [],
};

type ChatState = 'idle' | 'working' | 'paused' | 'error' | 'success';

// ---- Event types ----

type SystemEvent =
  | OutgoingThreadsEvents
  | { type: 'THREAD_UPDATED'; threadId: string; updates: Partial<Pick<ThreadEntity, 'status' | 'tags' | 'context' | 'pinned' | 'topic' | 'instructions'>> }
  | { type: 'THREADS_SETTINGS_UPDATED'; settings: ThreadsSettings }
  | { type: 'THREAD_DELETED'; threadId: string }
  | { type: 'THREADS_EXPORTED'; filePath: string; threadCount: number }
  | { type: 'THREADS_EXPORT_FAILED'; errors: string[] }
  | { type: 'THREADS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'THREADS_IMPORT_FAILED'; errors: string[] }
  | { type: 'ARCHIVED_THREADS_DATA'; threads: any[] }

type UIEvent =
  // Thread management events
  | { type: 'OPEN_THREAD_CHAT'; threadId: string; restore?: boolean }
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SHOW_CREATE_FORM_AS_CHILD'; parentThreadId: string }
  | { type: 'VIEW_LIST' }
  | { type: 'VIEW_KANBAN' }
  | { type: 'VIEW_DASHBOARD' }
  | { type: 'UPDATE_THREAD_STATUS'; id: string; status: ThreadEntity['status'] }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD' }
  | { type: 'CANCEL_CREATE' }
  | { type: 'DELETE_THREAD'; threadId: string }
  | { type: 'ARCHIVE_THREAD'; threadId: string }
  | { type: 'UNARCHIVE_THREAD'; threadId: string }
  | { type: 'TOGGLE_VIEW_ARCHIVE' }
  | { type: 'UNPIN_THREAD'; threadId: string }
  | { type: 'PIN_THREAD'; threadId: string }
  | {
    type: 'UPDATE_THREAD_FIELD';
    key: keyof ThreadEditFields;
    value: ThreadEditFields[keyof ThreadEditFields];
    state: 'create' | 'view';
  }
  | { type: 'CLEAR_NEW_THREAD_FLAG'; id: string }
  | { type: 'TOGGLE_TAGS_SECTION'; show: boolean }
  | { type: 'TOGGLE_LINKED_SECTION'; show: boolean }
  | { type: 'TOGGLE_FILTER_STATUS'; status: string }
  | { type: 'TOGGLE_FILTER_TAG'; tag: string }
  | { type: 'TOGGLE_FILTER_CHAT_STATE'; chatState: string }
  | { type: 'SET_SEARCH'; keyword: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'TOGGLE_ROOT_ONLY_FILTER' }
  | { type: 'SELECT_THREAD_ITEMS'; itemIds: string[] }
  | { type: 'SET_THREAD_PARENT'; childIds: string[]; parentId: string }
  | { type: 'THREADS.IMPORT'; directory: string }
  | { type: 'THREADS.RESET_IMPORT_STATUS' }
  | { type: 'THREADS.EXPORT'; directory: string }
  | { type: 'THREADS.RESET_EXPORT_STATUS' }
  // Chat/agent events
  | { type: 'VIEW_THREAD'; threadId: string }
  | { type: 'SEND_MESSAGE'; text: string; references?: MessageReferences }
  | { type: 'SEND_COMMAND'; command: string; text: string; references?: MessageReferences }
  | { type: 'CLEAR_THREAD' }
  | { type: 'NEW_THREAD_IN_PROJECT'; directory: string }
  | { type: 'NEW_THREAD_NO_PROJECT' }
  | { type: 'CREATE_CHILD_THREAD'; parentThreadId: string }
  | { type: 'SET_CHAT_STATE'; threadId: string; chatState: string }
  | { type: 'CLEAR_CHAT_STATE_OVERRIDE'; threadId: string }
  | { type: 'SELECT_TAB'; tabId: string }
  | { type: 'OPEN_THREAD_TAB'; threadId: string; label: string; pinned?: boolean }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'CLOSE_ACTIVE_TAB' }
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'SET_MODE'; mode: string }
  | { type: 'SET_PHASE'; phase: string }
  | { type: 'UPDATE_TODO_TASK'; artifactId: string; taskId: string; completed: boolean }
  | { type: 'APPROVE_TODO_LIST'; artifactId: string; tasks: any[] }
  | { type: 'REJECT_TODO_LIST'; artifactId: string }
  | { type: 'RESPOND_TO_BLOCK_INTERACTION'; messageId: string; response: BlockResponse }
  | { type: 'UPDATE_MESSAGE_STATE'; messageId: string; responseTimestamp?: number; blockResponse?: BlockResponse; asideText?: string; context?: Record<string, unknown>; compacted?: boolean }
  | { type: 'MESSAGE_ADDED'; threadId: string; message: MessageEntity }
  | { type: 'HOTKEY_PRESSED'; } & HotkeyEvent
  | { type: 'TEXT_TO_SPEECH' }
  | { type: 'OPEN_QUICK_PROMPTS' }
  | { type: 'CLOSE_QUICK_PROMPTS' }
  | { type: 'TOGGLE_QUICK_PROMPTS' }
  | { type: 'NAVIGATE_TO_SECRETS' }
  | { type: 'API_KEYS_STATUS'; hasRequiredApiKeys: boolean }
  | { type: 'COMMANDS_UPDATED'; commands: CommandItem[] }
  | { type: 'FORK_THREAD'; messageId: string; threadId?: string; threadTopic?: string }
  | { type: 'REVERT_THREAD'; messageId: string; threadId: string; restoreFiles?: boolean; userCliUuid?: string }
  | { type: 'SUMMARIZE_THREAD'; messageId: string; threadId: string }
  | { type: 'PAUSE_TURN'; threadId: string }
  | { type: 'UNQUEUE_MESSAGE'; threadId: string; messageId: string }
  | { type: 'DISMISS_MESSAGE'; messageId: string }
  | { type: 'LOAD_MORE_MESSAGES' }
  | { type: 'TOKEN_STREAM'; token: string }
  | { type: 'LLM_DONE' }
  | { type: 'RENAME_THREAD'; threadId: string; topic: string }
  // Tab reorder & group events
  | { type: 'REORDER_TABS'; fromIndex: number; toIndex: number }
  | { type: 'PIN_TAB_AT'; tabId: string; targetTabId: string; side: 'left' | 'right' }
  | { type: 'UNPIN_TAB_AT'; tabId: string; targetTabId: string; side: 'left' | 'right' }
  | { type: 'CREATE_TAB_GROUP'; tabIds?: string[] }
  | { type: 'RENAME_TAB_GROUP'; groupId: string; name: string }
  | { type: 'CHANGE_TAB_GROUP_COLOR'; groupId: string; color: TabGroupColor }
  | { type: 'DELETE_TAB_GROUP'; groupId: string }
  | { type: 'TOGGLE_TAB_GROUP_COLLAPSE'; groupId: string }
  | { type: 'ADD_TAB_TO_GROUP'; tabId: string; groupId: string }
  | { type: 'ADD_TAB_TO_GROUP_AT'; tabId: string; groupId: string; targetTabId: string; side: 'left' | 'right' }
  | { type: 'REMOVE_TAB_FROM_GROUP'; tabId: string }
  | { type: 'UNGROUP_ALL_IN_GROUP'; groupId: string }
  | { type: 'CLOSE_ALL_IN_GROUP'; groupId: string }
  | { type: 'PIN_TAB_GROUP'; groupId: string }
  | { type: 'UNPIN_TAB_GROUP'; groupId: string }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' }

type ThreadEvents =
  | UIEvent
  | SystemEvent
  | TrailClickEvent;

const typeOf = safeEvents<ThreadEvents>();

export type ThreadListItem = Simplify<ThreadEntity & {
  tags?: string[];
  isNew?: boolean;
  parentId?: string;
}>;

// ---- Context ----

interface ThreadsContext {
  // Thread management (normalized)
  threadMap: Record<string, ThreadListItem>;
  threadIds: string[];
  selectedThreadIds: string[];
  selectedThreadCode?: string;
  view: ThreadViewData;
  create: ThreadCreateData & {
    parentThreadId?: string;
    parentThread?: ThreadListItem;
    tagsExpanded?: boolean;
    linkedExpanded?: boolean;
  };
  availableTags: ThreadTagOption[];
  settings: ThreadsSettings | null;
  showArchived: boolean;
  filters: {
    statuses: string[];
    tags: string[];
    chatStates: string[];
    search: string;
    showRootOnly: boolean;
  };
  threadsImport: { status: 'idle' | 'importing' | 'success' | 'error'; errors: string[]; importedCount: number };
  threadsExport: { status: 'idle' | 'exporting' | 'success' | 'error'; errors: string[]; filePath: string; threadCount: number };
  // Chat/agent
  currentThread: AgentThreadData | null;
  recentThreadIds: string[];
  messageInput: string;
  pendingActionId?: string;
  chatStates: Record<string, ChatState>;
  chatStateOverrides: Record<string, { id: string; expiresAt: number }>;
  tabs: Tab[];
  activeTabId: string;
  tabGroups: ThreadTabGroup[];
  mode: string;
  phase: string;
  phaseByModeName: Record<string, string | undefined>;
  modes: AgentModeConfig[];
  hotkeys: HotkeysMap;
  chatSettings: AgentSettings;
  hasRequiredApiKeys: boolean;
  commands: CommandItem[];
  quickPromptCursor: { x: number; y: number } | null;
  pendingThreadCwd?: string;
  pendingForceDirectoryPicker?: boolean;
  navHistory: NavHistory<string>;
  messagePagination: { hasMore: boolean; nextCursor: string | null; isLoading: boolean };
  sidebarArchivedThreads: ThreadListItem[];
}

// ---- Helpers ----

type ThreadLike = Partial<ThreadEntity> & { id: string };

export function threadsFromStore<T>(threadMap: Record<string, T>, threadIds: string[]): T[] {
  return threadIds.map(id => threadMap[id]).filter((thread): thread is T => Boolean(thread));
}

function threadIdsFrom(threads: ThreadLike[]): string[] {
  return threads.map(t => t.id);
}

function mergeThreadMap(threadMap: Record<string, ThreadListItem>, threads: ThreadLike[]): Record<string, ThreadListItem> {
  const next = { ...threadMap };
  for (const thread of threads) {
    next[thread.id] = { ...(next[thread.id] || {}), ...thread } as ThreadListItem;
  }
  return next;
}

function appendThreadIds(threadIds: string[], threads: ThreadLike[]): string[] {
  const seen = new Set(threadIds);
  const next = [...threadIds];
  for (const thread of threads) {
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    next.push(thread.id);
  }
  return next;
}

function threadStoreFrom(threads: ThreadLike[]): { threadMap: Record<string, ThreadListItem>; threadIds: string[] } {
  return {
    threadMap: mergeThreadMap({}, threads),
    threadIds: threadIdsFrom(threads),
  };
}

function visibleThreadStore(ctx: ThreadsContext, threads: ThreadLike[]): { threadMap: Record<string, ThreadListItem>; threadIds: string[] } {
  return {
    threadMap: mergeThreadMap(ctx.threadMap, threads),
    threadIds: threadIdsFrom(threads),
  };
}

/** Update a single thread in the map (no-op if not found) */
function patchThread(ctx: ThreadsContext, threadId: string, patch: Partial<ThreadListItem>) {
  const existing = ctx.threadMap[threadId];
  if (!existing) return { threadMap: ctx.threadMap };
  return { threadMap: { ...ctx.threadMap, [threadId]: { ...existing, ...patch } } };
}

/** Remove a thread from the map and id list */
function removeThread(ctx: ThreadsContext, threadId: string) {
  const { [threadId]: _, ...rest } = ctx.threadMap;
  return { threadMap: rest, threadIds: ctx.threadIds.filter(id => id !== threadId) };
}

function optimisticFieldUpdate(context: ThreadsContext, threadId: string, key: string, value: unknown) {
  trpc.bus.send.mutate({ systemId: id, type: 'UPDATE_THREAD_FIELD', threadId, key, value });
  return {
    ...patchThread(context, threadId, { [key]: value } as any),
    tabs: context.tabs.map(t => t.id === threadId ? { ...t, [key]: value, ...(key === 'topic' ? { label: value as string } : {}) } : t),
    ...(context.currentThread?.id === threadId ? { currentThread: { ...context.currentThread, [key]: value } } : {}),
    ...(context.view.id === threadId ? { view: { ...context.view, [key]: value } } : {}),
  };
}

// ---- State machine ----

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as ThreadEvents },
  actors: {
    clearNewThreadFlag: fromPromise<void, { id: string }>(async ({ input, system }) => {
      const ANIMATION_DURATION = 1000;
      await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION));
      system.get(id).send({ type: 'CLEAR_NEW_THREAD_FLAG', id: input.id });
    }),
    clearExpiredOverride: fromPromise<void, { threadId: string; durationMs: number }>(async ({ input, system }) => {
      await new Promise(resolve => setTimeout(resolve, input.durationMs));
      system.get(id).send({ type: 'CLEAR_CHAT_STATE_OVERRIDE', threadId: input.threadId });
    }),
  },
  actions: {
    // ---- Thread management actions ----
    openThreadChat: ({ self, event }) => {
      const { threadId, restore } = typeOf('OPEN_THREAD_CHAT', event);
      self.send({ type: 'VIEW_DASHBOARD' });
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_THREAD_CHAT',
        threadId,
        ...(restore && { restore }),
      });
    },
    setupParentThread: assign(({ event, context }) => {
      const typedEvent = typeOf('SHOW_CREATE_FORM_AS_CHILD', event);
      const parentThread = context.threadMap[typedEvent.parentThreadId];

      if (!parentThread) {
        console.warn(`Parent thread with id ${typedEvent.parentThreadId} not found`);
        return {};
      }

      return {
        create: {
          ...defaultThread,
          parentThreadId: parentThread.id,
          parentThread: parentThread
        }
      };
    }),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('THREAD_CONNECTED', event);

      return {
        ...threadStoreFrom(typedEvent.data.threads as ThreadListItem[]),
        selectedThreadIds: [],
        availableTags: typedEvent.data.availableTags,
        settings: typedEvent.data.settings,
        chatStates: (typedEvent.data.chatStates || {}) as Record<string, ChatState>,
      };
    }),
    addThenResetCreateForm: assign(({ context, event }) => {
      const typedEvent = typeOf('THREAD_CREATED', event);
      const newThread: ThreadListItem = {
        ...context.create,
        createdAt: typedEvent.timestamp,
        updatedAt: typedEvent.timestamp,
        status: '',
        tags: context.create.tags,
          isNew: true,
          ...typedEvent
      } as ThreadListItem;

      return {
        threadMap: { ...context.threadMap, [newThread.id]: newThread },
        threadIds: [newThread.id, ...context.threadIds],
        create: defaultThread,
      }
    }),
    sendCreateThread: ({ context }) => {
      const { parentThread, ...createData } = context.create;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_THREAD',
        ...createData,
        parentThreadId: context.create.parentThreadId
      });
    },
    sendViewThread: ({ event }) => {
      const threadId = typeOf('SELECT_THREAD', event).id;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'VIEW_THREAD',
        threadId,
      });
    },
    setViewData: assign(({ event, context }) => {
      const { id, data } = typeOf('SET_VIEW_DATA', event);

      return {
        view: {
          ...context.view,
          ...data,
          id,
        }
      }
    }),
    setSelectedThread: assign(({ event, context }) => {
      const typedEvent = typeOf(['SELECT_THREAD', 'THREAD_CREATED'], event);
      const selectedThread = context.threadMap[typedEvent.id];
      if (!selectedThread) {
        // Thread not in threadMap (e.g. archived, or tab restored from storage).
        // Reset view to defaults with the target id so SET_VIEW_DATA can populate it.
        return {
          selectedThreadCode: undefined,
          view: {
            ...defaultThread,
            id: typedEvent.id as ThreadEntity['id'],
            shortCode: '',
            status: '',
            timestamp: 0,
          },
        };
      }

      const { id, shortCode, status, timestamp, topic, instructions, tags, pinned } = selectedThread;

      return {
        selectedThreadCode: shortCode,
        view: {
          ...defaultThread,
          id, shortCode, status, timestamp, topic, instructions,
          tags: tags as string[],
          pinned,
        },
      };
    }),
    updateThreadData: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_FIELD', event);
      const { key, value, state } = typedEvent;

      return {
        [state]: {
          ...context[state],
          [key]: value,
        },
      } as Pick<typeof context, typeof state>;
    }),
    updateThreadInThreads: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_FIELD', event);

      const { messages, linkedThreads, ...rest } = context.view;
      (rest as any)[typedEvent.key] = typedEvent.value as any;
      const newThread = rest as ThreadListItem;
      return {
        threadMap: { ...context.threadMap, [context.view.id]: { ...(context.threadMap[context.view.id] || {}), ...newThread } },
      };
    }),
    updateCurrentThread: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_FIELD', event);
      if (!context.currentThread || context.currentThread.id !== context.view.id) return {};
      return {
        currentThread: {
          ...context.currentThread,
          [typedEvent.key]: typedEvent.value,
        },
      };
    }),
    clearNewThreadFlag: assign(({ context, event }) => {
      const clearId = typeOf('CLEAR_NEW_THREAD_FLAG', event).id;
      return patchThread(context, clearId, { isNew: false });
    }),
    updateThreadStatus: ({ event }) => {
      const typedEvent = typeOf('UPDATE_THREAD_STATUS', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_STATUS',
        threadId: typedEvent.id,
        status: typedEvent.status,
      });
    },
    updateThreadFromBackend: assign(({ event, context }) => {
      const typedEvent = typeOf('THREAD_UPDATED', event);
      const { threadId, updates } = typedEvent;

      return {
        ...patchThread(context, threadId, updates as Partial<ThreadListItem>),
        view: context.view.id === threadId
          ? { ...context.view, ...updates }
          : context.view,
        currentThread: context.currentThread?.id === threadId
          ? { ...context.currentThread, ...updates }
          : context.currentThread,
        ...(updates.topic !== undefined ? {
          tabs: context.tabs.map(t => t.id === threadId ? { ...t, label: updates.topic! } : t),
        } : {}),
      };
    }),
    sendUpdateThreadField: ({ event, context }) => {
      const { key, value } = typeOf('UPDATE_THREAD_FIELD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_FIELD',
        threadId: context.view.id,
        key,
        value,
      });
    },
    renameThread: assign(({ event, context }) => {
      const { threadId, topic } = typeOf('RENAME_THREAD', event);
      return optimisticFieldUpdate(context, threadId, 'topic', topic);
    }),
    setThreadsSettings: assign(({ event }) => {
      const ev = typeOf('THREADS_SETTINGS_UPDATED', event);
      const chat = (ev.settings as any)?.chat as AgentSettings | undefined;
      return {
        settings: ev.settings,
        availableTags: ev.settings?.tags || [],
        ...(chat ? extractChatSettings(chat) : {}),
      };
    }),
    deleteThread: ({ event }) => {
      const { threadId } = typeOf('DELETE_THREAD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_THREAD',
        threadId,
      });
    },
    archiveThread: ({ event }) => {
      const { threadId } = typeOf('ARCHIVE_THREAD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_FIELD',
        threadId,
        key: 'archived',
        value: true,
      });
    },
    unpinThread: assign(({ event, context }) => {
      const { threadId } = typeOf('UNPIN_THREAD', event);
      return optimisticFieldUpdate(context, threadId, 'pinned', false);
    }),
    pinThread: assign(({ event, context }) => {
      const { threadId } = typeOf('PIN_THREAD', event);
      return optimisticFieldUpdate(context, threadId, 'pinned', true);
    }),
    toggleViewArchive: assign(({ context }) => {
      const newShowArchived = !context.showArchived;
      if (newShowArchived) {
        trpc.bus.send.mutate({ systemId: id, type: 'GET_ARCHIVED_THREADS' });
      } else {
        trpc.bus.send.mutate({ systemId: id, type: 'REFRESH_THREADS' });
      }
      return {
        showArchived: newShowArchived,
        threadIds: [] as string[],
      };
    }),
    setArchivedThreads: assign(({ context, event }) => {
      const threads = typeOf('ARCHIVED_THREADS_DATA', event).threads as ThreadListItem[];
      return {
        sidebarArchivedThreads: threads,
        ...(context.showArchived ? visibleThreadStore(context, threads) : {}),
      };
    }),
    unarchiveThread: ({ event }) => {
      const { threadId } = typeOf('UNARCHIVE_THREAD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_FIELD',
        threadId,
        key: 'archived',
        value: false,
      });
    },
    removeUnarchivedThread: assign(({ event, context }) => {
      const { threadId } = typeOf('UNARCHIVE_THREAD', event);
      return removeThread(context, threadId);
    }),
    removeArchivedThread: assign(({ event, context }) => {
      const { threadId } = typeOf('ARCHIVE_THREAD', event);
      const tabs = context.tabs.filter(t => t.id !== threadId);
      const activeTabId = context.activeTabId === threadId
        ? (tabs[tabs.length - 1]?.id ?? '')
        : context.activeTabId;
      return {
        ...removeThread(context, threadId),
        tabs,
        activeTabId,
      };
    }),
    persistListView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'list'); } catch {} },
    persistKanbanView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'kanban'); } catch {} },
    persistDashboardView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'dashboard'); } catch {} },
    removeThreadFromList: assign(({ event, context }) => {
      const { threadId } = typeOf('THREAD_DELETED', event);
      const tabs = context.tabs.filter(t => t.id !== threadId);
      const activeTabId = context.activeTabId === threadId
        ? (tabs[tabs.length - 1]?.id ?? '')
        : context.activeTabId;
      return {
        ...removeThread(context, threadId),
        tabs,
        activeTabId,
        view: context.view.id === threadId ? { ...defaultThread, id: '' as EARS.EntityId, shortCode: '', status: '', timestamp: 0 } as ThreadViewData : context.view,
        selectedThreadCode: context.view.id === threadId ? undefined : context.selectedThreadCode,
      };
    }),

    /* ── Threads Import actions ────────────────────────────── */
    setImportingThreads: assign(({ context }) => ({
      threadsImport: { ...context.threadsImport, status: 'importing' as const },
    })),
    sendImportThreads: ({ event }) => {
      if (event.type === 'THREADS.IMPORT') {
        trpc.bus.send.mutate({ systemId: id, type: 'IMPORT_THREADS', directory: event.directory } as any)
      }
    },
    handleThreadsImported: assign(({ event }) => {
      if (event.type === 'THREADS_IMPORTED') {
        return { threadsImport: { status: 'success' as const, errors: event.errors || [], importedCount: event.count } }
      }
      return {}
    }),
    handleThreadsImportFailed: assign(({ event }) => {
      if (event.type === 'THREADS_IMPORT_FAILED') {
        return { threadsImport: { status: 'error' as const, errors: event.errors, importedCount: 0 } }
      }
      return {}
    }),
    resetImportThreadsStatus: assign({
      threadsImport: { status: 'idle' as const, errors: [] as string[], importedCount: 0 },
    }),

    /* ── Threads Export actions ────────────────────────────── */
    setExportingThreads: assign(({ context }) => ({
      threadsExport: { ...context.threadsExport, status: 'exporting' as const },
    })),
    sendExportThreads: ({ event }) => {
      if (event.type === 'THREADS.EXPORT') {
        trpc.bus.send.mutate({ systemId: id, type: 'EXPORT_THREADS', directory: event.directory } as any)
      }
    },
    handleThreadsExported: assign(({ event }) => {
      if (event.type === 'THREADS_EXPORTED') {
        return { threadsExport: { status: 'success' as const, errors: [] as string[], filePath: event.filePath, threadCount: event.threadCount } }
      }
      return {}
    }),
    handleThreadsExportFailed: assign(({ event }) => {
      if (event.type === 'THREADS_EXPORT_FAILED') {
        return { threadsExport: { status: 'error' as const, errors: event.errors, filePath: '', threadCount: 0 } }
      }
      return {}
    }),
    resetExportThreadsStatus: assign({
      threadsExport: { status: 'idle' as const, errors: [] as string[], filePath: '', threadCount: 0 },
    }),

    /* ── Filter actions ────────────────────────────────────── */
    toggleFilterStatus: assign(({ context, event }) => {
      const status = typeOf('TOGGLE_FILTER_STATUS', event).status;
      const current = context.filters.statuses;
      return {
        filters: { ...context.filters, statuses: current.includes(status) ? current.filter(s => s !== status) : [...current, status] },
      };
    }),
    toggleFilterTag: assign(({ context, event }) => {
      const tag = typeOf('TOGGLE_FILTER_TAG', event).tag;
      const current = context.filters.tags;
      return {
        filters: { ...context.filters, tags: current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag] },
      };
    }),
    toggleFilterChatState: assign(({ context, event }) => {
      const chatState = typeOf('TOGGLE_FILTER_CHAT_STATE', event).chatState;
      const current = context.filters.chatStates;
      return {
        filters: { ...context.filters, chatStates: current.includes(chatState) ? current.filter(s => s !== chatState) : [...current, chatState] },
      };
    }),
    setSearch: assign(({ context, event }) => ({
      filters: { ...context.filters, search: typeOf('SET_SEARCH', event).keyword },
    })),
    clearFilters: assign(({ context }) => ({
      filters: { statuses: [] as string[], tags: [] as string[], chatStates: [] as string[], search: '', showRootOnly: context.filters.showRootOnly },
    })),

    refreshViewIfActive: ({ context }) => {
      // After a THREAD_CONNECTED refresh, re-fetch view data if we're viewing a thread
      if (context.view?.id) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'VIEW_THREAD',
          threadId: context.view.id,
        });
      }
    },

    /* ── Selection & drag-drop actions ─────────────────────── */
    selectThreadItems: assign(({ event }) => ({
      selectedThreadIds: typeOf('SELECT_THREAD_ITEMS', event).itemIds,
    })),
    toggleRootOnlyFilter: assign(({ context }) => ({
      filters: { ...context.filters, showRootOnly: !context.filters.showRootOnly },
    })),
    sendSetThreadParent: ({ event }) => {
      const { childIds, parentId } = typeOf('SET_THREAD_PARENT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'SET_THREAD_PARENT',
        childIds,
        parentId,
      });
    },

    // ---- Chat/agent actions ----
    requestThreadChatData: ({ event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_THREAD_CHAT',
        threadId,
      });
    },
    setChatState: assign(({ context, event }) => {
      const { threadId, chatState } = typeOf('SET_CHAT_STATE', event);
      return { chatStates: { ...context.chatStates, [threadId]: chatState } as Record<string, ChatState> };
    }),
    flashChatState: assign(({ context, event }) => {
      const { threadId, stateId, durationMs } = typeOf('FLASH_CHAT_STATE', event);
      const expiresAt = Date.now() + (durationMs ?? 3000);
      return { chatStateOverrides: { ...context.chatStateOverrides, [threadId]: { id: stateId, expiresAt } } };
    }),
    setMode: assign(({ context, event }) => {
      const newMode = typeOf('SET_MODE', event).mode;
      const modeConfig = context.modes.find(m => m.name === newMode);

      const updatedPhaseByModeName = { ...context.phaseByModeName, [context.mode]: context.phase };
      const newPhase = modeConfig?.phases?.length
        ? (newMode in updatedPhaseByModeName ? updatedPhaseByModeName[newMode] : modeConfig.phases[0].name)
        : undefined;

      return { mode: newMode, phase: newPhase, phaseByModeName: updatedPhaseByModeName };
    }),
    setPhase: assign(({ context, event }) => {
      const newPhase = typeOf('SET_PHASE', event).phase;
      return {
        phase: newPhase,
        phaseByModeName: { ...context.phaseByModeName, [context.mode]: newPhase }
      };
    }),
    navigateToSecrets: () => {
      navigateToPlugin('settings', [
        { type: 'TAB.SELECT', tab: 'general' },
        { type: 'GENERAL_NAV.SELECT', item: 'secrets' }
      ]);
    },
    updateApiKeyStatus: assign(({ event }) => ({
      hasRequiredApiKeys: typeOf('API_KEYS_STATUS', event).hasRequiredApiKeys
    })),
    sendMessage: enqueueActions(({ enqueue, context, event }) => {
      const { text, references } = typeOf('SEND_MESSAGE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'USER_MSG',
        text,
        mode: context.mode,
        phase: context.phase,
        threadId: context.currentThread?.id,
        ...(references && { references }),
        ...(context.pendingThreadCwd && { cwdOverride: context.pendingThreadCwd }),
        ...(context.pendingForceDirectoryPicker && { forceDirectoryPicker: true }),
      });
      if (context.pendingThreadCwd || context.pendingForceDirectoryPicker) {
        enqueue.assign({ pendingThreadCwd: undefined, pendingForceDirectoryPicker: undefined });
      }
    }),
    sendCommand: enqueueActions(({ enqueue, context, event }) => {
      const { command, text, references } = typeOf('SEND_COMMAND', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'USER_COMMAND',
        command,
        text,
        mode: context.mode,
        phase: context.phase,
        threadId: context.currentThread?.id,
        ...(references && { references }),
        ...(context.pendingThreadCwd && { cwdOverride: context.pendingThreadCwd }),
      });
      if (context.pendingThreadCwd) {
        enqueue.assign({ pendingThreadCwd: undefined });
      }
    }),
    clearThread: assign(({ context }) => {
      const { mode, phase } = resolveDefaultModePhase(
        context.chatSettings, context.modes, context.mode, context.phase,
      );
      return {
        currentThread: { ...defaultChatThread, messages: [] },
        mode,
        phase: phase ?? '',
        phaseByModeName: { ...context.phaseByModeName, [mode]: phase },
        pendingThreadCwd: undefined,
        pendingForceDirectoryPicker: undefined,
      };
    }),
    newThreadInProject: assign(({ context, event }) => {
      const { directory } = typeOf('NEW_THREAD_IN_PROJECT', event);
      const { mode, phase } = resolveDefaultModePhase(
        context.chatSettings, context.modes, context.mode, context.phase,
      );
      return {
        currentThread: { ...defaultChatThread, messages: [] },
        mode,
        phase: phase ?? '',
        phaseByModeName: { ...context.phaseByModeName, [mode]: phase },
        pendingThreadCwd: directory,
        pendingForceDirectoryPicker: undefined,
      };
    }),
    newThreadNoProject: assign(({ context }) => {
      const { mode, phase } = resolveDefaultModePhase(
        context.chatSettings, context.modes, context.mode, context.phase,
      );
      return {
        currentThread: { ...defaultChatThread, messages: [] },
        mode,
        phase: phase ?? '',
        phaseByModeName: { ...context.phaseByModeName, [mode]: phase },
        pendingThreadCwd: undefined,
        pendingForceDirectoryPicker: true,
      };
    }),
    handleTokenStream: assign(({ context, event }) => {
      const token = typeOf('TOKEN_STREAM', event).token;
      const { currentThread, pendingActionId } = context;
      const messages = currentThread?.messages || [];

      if (pendingActionId) {
        return {
          currentThread: {
            ...currentThread!,
            messages: messages.map((m: Partial<MessageEntity>) => m.id === pendingActionId ? { ...m, text: m.text + token } : m),
          }
        };
      }

      const newId = Date.now().toString();
      return {
        currentThread: {
          ...currentThread!,
          messages: [...messages, {
            id: newId,
            entityType: 'Message' as const,
            text: token,
            sender: 'assistant' as const,
            timestamp: Date.now(),
            createdAt: Date.now()
          } as MessageEntity]
        },
        pendingActionId: newId,
      };
    }),
    finishStream: assign(() => ({
      pendingActionId: undefined,
    })),
    setThreadChatData: assign(({ context, event }) => {
      const thread = typeOf('LOAD_CHAT_THREAD', event).data;
      const restore = (event as any).restore;
      const label = thread.topic || `Thread ${thread.shortCode || ''}`;

      if (thread.id && !restore) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'OPEN_THREAD_TAB',
          threadId: thread.id,
          label,
          ...(thread.pinned && { pinned: true }),
        });
      }

      const chatState: ChatState = (thread.chatState as ChatState) ?? 'idle';
      const base = {
        currentThread: thread,
        messagePagination: {
          hasMore: thread.hasMore ?? false,
          nextCursor: thread.nextCursor ?? null,
          isLoading: false,
        },
        ...(thread.id ? {
          threadMap: {
            ...context.threadMap,
            [thread.id]: { ...(context.threadMap[thread.id] || {}), ...thread } as ThreadListItem,
          },
        } : {}),
        chatStates: { ...context.chatStates, [thread.id as string]: chatState },
      };

      // On restore, create tab locally instead of round-tripping via OPEN_THREAD_TAB
      if (restore && thread.id) {
        const artifacts = (thread.artifacts || []) as any as Tab['artifacts'];
        const existing = context.tabs.find(t => t.id === thread.id);
        Object.assign(base, {
          tabs: existing
            ? context.tabs.map(t => t.id === thread.id ? { ...t, label, artifacts } : t)
            : [...context.tabs, { id: thread.id, label, artifacts, selectedArtifactId: artifacts[0]?.id, ...(thread.pinned && { pinned: true }) } as Tab],
          activeTabId: thread.id,
        });
      }

      if (thread.forcedMode) {
        const modeName = thread.forcedMode;
        const modeConfig = context.modes.find(m => m.name === modeName);
        const newPhase = modeConfig?.phases?.length
          ? (modeName in context.phaseByModeName ? context.phaseByModeName[modeName] : modeConfig.phases[0].name)
          : undefined;
        return { ...base, mode: modeName, phase: newPhase };
      }

      return base;
    }),
    setRefreshThreadsData: assign(({ context, event }) => {
      const typedEvent = typeOf('REFRESH_RECENT_THREADS', event);
      const recentThreads = typedEvent.data.recentThreads as ThreadEntity[];
      return {
        threadMap: mergeThreadMap(context.threadMap, recentThreads),
        recentThreadIds: threadIdsFrom(recentThreads),
      };
    }),
    setStartupData: enqueueActions(({ enqueue, context, event, self }) => {
      const typedEvent = typeOf('AGENT_CONNECTED', event);

      const currentThreadTab = typedEvent.data.tabs?.find(tab =>
        tab.id === typedEvent.data.currentThread?.id && tab.artifacts.length > 0
      );

      const extracted = extractChatSettings(typedEvent.data.settings || { modes: [], hotkeys: {} });

      const currentThread = typedEvent.data.currentThread;
      const startupChatState: ChatState = (currentThread as any)?.chatState ?? 'idle';
      const forcedMode = currentThread?.forcedMode;
      let modeUpdate = {};
      if (forcedMode) {
        const modeName = forcedMode;
        const modeConfig = extracted.modes.find(m => m.name === modeName);
        const newPhase = modeConfig?.phases?.length
          ? (modeName in context.phaseByModeName ? context.phaseByModeName[modeName] : modeConfig.phases[0].name)
          : undefined;
        modeUpdate = { mode: modeName, phase: newPhase };
      } else {
        const visibleModes = extracted.modes.filter(m => !m.hidden);
        const fallbackMode = visibleModes[0]?.name ?? context.mode;
        const fallbackPhase = visibleModes[0]?.phases?.[0]?.name;
        const { mode, phase } = resolveDefaultModePhase(
          extracted.chatSettings, extracted.modes, fallbackMode, fallbackPhase,
        );
        modeUpdate = { mode, phase };
      }

      // Restore previously open tabs from localStorage
      const backendTabs: Tab[] = typedEvent.data.tabs || [];
      const stored = loadTabsFromStorage();
      const backendTabIds = new Set(backendTabs.map(t => t.id));

      const recentThreadsData = (typedEvent.data.recentThreads || []) as ThreadEntity[];
      const visibleThreadsData = (typedEvent.data.threads || []) as ThreadEntity[];
      const startupThreadMap = mergeThreadMap(context.threadMap, [...recentThreadsData, ...visibleThreadsData]);
      const startupThreadIds = appendThreadIds(context.threadIds, visibleThreadsData);
      const recentThreadIds = threadIdsFrom(recentThreadsData);

      // Build lookup for tab labels from threadMap
      const threadLabelMap = new Map<string, string>(
        Object.entries(startupThreadMap).map(([tid, t]) => [tid, t.topic || `Thread ${t.shortCode || ''}`])
      );

      // Create tab entries for stored tabs not already in backend tabs
      let allTabs = [...backendTabs];
      const storedGroupIdMap = new Map<string, string>();
      if (stored) {
        for (const storedTab of stored.tabs) {
          if (storedTab.groupId) storedGroupIdMap.set(storedTab.id, storedTab.groupId);
          if (!backendTabIds.has(storedTab.id)) {
            const label = threadLabelMap.get(storedTab.id) || storedTab.label || 'Thread';
            allTabs.push({ id: storedTab.id, label, artifacts: [], ...(storedTab.groupId && { groupId: storedTab.groupId }) });
          }
        }
      }
      // Restore groupId on backend tabs from stored data
      if (storedGroupIdMap.size > 0) {
        allTabs = allTabs.map(t => {
          const gId = storedGroupIdMap.get(t.id);
          return gId && !t.groupId ? { ...t, groupId: gId } : t;
        });
      }

      // Load tab groups from localStorage
      const restoredTabGroups = loadThreadTabGroups();

      const activeTabId = (stored?.activeTabId && allTabs.some(t => t.id === stored.activeTabId))
        ? stored.activeTabId
        : (currentThreadTab?.id || backendTabs[0]?.id || '');

      enqueue(assign({
        currentThread,
        threadMap: startupThreadMap,
        threadIds: startupThreadIds,
        recentThreadIds,
        tabs: allTabs,
        activeTabId,
        tabGroups: restoredTabGroups,
        ...extracted,
        hasRequiredApiKeys: typedEvent.data.hasRequiredApiKeys ?? true,
        commands: typedEvent.data.commands || [],
        ...modeUpdate,
        ...(currentThread?.id ? { chatStates: { ...context.chatStates, [currentThread.id as string]: startupChatState } } : {}),
      }));

      // Fetch messages for the active thread (messages are deferred from startup payload)
      const threadToLoad = activeTabId || (currentThread?.id as string);
      if (threadToLoad) {
        enqueue(() => self.send({ type: 'OPEN_THREAD_CHAT', threadId: threadToLoad, restore: true }));
      }

      saveTabsToStorage(allTabs, activeTabId);
    }),
    handleChatSettingsUpdate: assign(({ event }) => {
      const typedEvent = typeOf('AGENT_SETTINGS_UPDATED', event);
      return extractChatSettings(typedEvent.settings);
    }),
    sendOpenThreadView: ({ self, event }) => {
      const threadId = typeOf('VIEW_THREAD', event).threadId;
      self.send({ type: 'SELECT_THREAD', id: threadId });
    },
    createChildThread: ({ self, event }) => {
      const parentThreadId = typeOf('CREATE_CHILD_THREAD', event).parentThreadId;
      self.send({ type: 'SHOW_CREATE_FORM_AS_CHILD', parentThreadId });
    },
    selectTab: assign(({ event }) => ({
      activeTabId: typeOf('SELECT_TAB', event).tabId
    })),
    openThreadTab: assign(({ context, event }) => {
      const { threadId, label, pinned } = typeOf('OPEN_THREAD_TAB', event) as { threadId: string; label: string; pinned?: boolean };
      const existingTab = context.tabs.find(t => t.id === threadId);

      if (existingTab) {
        if (pinned !== undefined && existingTab.pinned !== pinned) {
          return {
            tabs: context.tabs.map(t => t.id === threadId ? { ...t, pinned } : t),
            activeTabId: threadId
          };
        }
        return { activeTabId: threadId };
      }

      return {
        tabs: [...context.tabs, {
          id: threadId,
          label,
          artifacts: [],
          selectedArtifactId: undefined,
          ...(pinned && { pinned }),
        }],
        activeTabId: threadId
      };
    }),
    closeTab: enqueueActions(({ enqueue, context, event, self }) => {
      const tabId = typeOf('CLOSE_TAB', event).tabId;
      const tab = context.tabs.find(t => t.id === tabId);
      if (!tab || tab.pinned) return;

      const idx = context.tabs.findIndex(t => t.id === tabId);
      const newTabs = context.tabs.filter(t => t.id !== tabId);

      let newActiveTabId = context.activeTabId;
      if (context.activeTabId === tabId) {
        const nextTab = context.tabs[idx + 1] ?? context.tabs[idx - 1];
        newActiveTabId = nextTab?.id ?? '';
      }

      enqueue(assign({ tabs: newTabs, activeTabId: newActiveTabId }));
      if (context.activeTabId === tabId && newActiveTabId) {
        enqueue(() => self.send({ type: 'OPEN_THREAD_CHAT', threadId: newActiveTabId }));
      }
    }),
    closeActiveTab: enqueueActions(({ enqueue, context, self }) => {
      const tabId = context.activeTabId;
      if (!tabId) return;
      const tab = context.tabs.find(t => t.id === tabId);
      if (!tab || tab.pinned) return;

      const idx = context.tabs.findIndex(t => t.id === tabId);
      const newTabs = context.tabs.filter(t => t.id !== tabId);
      const nextTab = context.tabs[idx + 1] ?? context.tabs[idx - 1];
      const newActiveTabId = nextTab?.id ?? '';

      enqueue(assign({ tabs: newTabs, activeTabId: newActiveTabId }));
      if (newActiveTabId) {
        enqueue(() => self.send({ type: 'OPEN_THREAD_CHAT', threadId: newActiveTabId }));
      }
    }),
    removeStaleTab: assign(({ context, event }) => {
      const { threadId } = event as unknown as { type: 'THREAD_CHAT_ERROR'; threadId: string };
      const newTabs = context.tabs.filter(t => t.id !== threadId);
      let newActiveTabId = context.activeTabId;
      if (context.activeTabId === threadId) {
        const idx = context.tabs.findIndex(t => t.id === threadId);
        const nextTab = context.tabs[idx + 1] ?? context.tabs[idx - 1];
        newActiveTabId = nextTab?.id ?? '';
      }
      return { tabs: newTabs, activeTabId: newActiveTabId };
    }),
    persistTabs: ({ context }) => saveTabsToStorage(context.tabs, context.activeTabId),
    persistTabGroups: ({ context }) => saveThreadTabGroups(context.tabGroups),

    // ---- Tab reorder & group actions ----
    reorderTabs: assign(({ context, event }) => {
      const { fromIndex, toIndex } = typeOf('REORDER_TABS', event);
      const tabs = [...context.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    }),
    pinTabAt: assign(({ context, event }) => {
      const { tabId, targetTabId, side } = typeOf('PIN_TAB_AT', event);
      const tabs = context.tabs.map(t => t.id === tabId ? { ...t, pinned: true, groupId: undefined } : t);
      const sourceIdx = tabs.findIndex(t => t.id === tabId);
      const [moved] = tabs.splice(sourceIdx, 1);
      const targetIdx = tabs.findIndex(t => t.id === targetTabId);
      const insertIdx = side === 'left' ? targetIdx : targetIdx + 1;
      tabs.splice(insertIdx, 0, moved);
      return { tabs };
    }),
    unpinTabAt: assign(({ context, event }) => {
      const { tabId, targetTabId, side } = typeOf('UNPIN_TAB_AT', event);
      const tabs = context.tabs.map(t => t.id === tabId ? { ...t, pinned: false, groupId: undefined } : t);
      const sourceIdx = tabs.findIndex(t => t.id === tabId);
      const [moved] = tabs.splice(sourceIdx, 1);
      const targetIdx = tabs.findIndex(t => t.id === targetTabId);
      const insertIdx = side === 'left' ? targetIdx : targetIdx + 1;
      tabs.splice(insertIdx, 0, moved);
      return { tabs };
    }),
    createTabGroup: assign(({ context, event }) => {
      const { tabIds } = typeOf('CREATE_TAB_GROUP', event) as { type: string; tabIds?: string[] };
      const firstTab = tabIds?.[0] ? context.tabs.find(t => t.id === tabIds[0]) : undefined;
      const isPinned = firstTab?.pinned || false;
      const color = getNextAvailableColor(context.tabGroups, isPinned);
      const newGroup: ThreadTabGroup = {
        id: crypto.randomUUID(),
        name: 'New Group',
        color,
        isCollapsed: false,
        order: context.tabGroups.length,
        isPinned: isPinned || undefined,
      };
      const tabs = tabIds
        ? context.tabs.map(t => tabIds.includes(t.id) ? { ...t, groupId: newGroup.id } : t)
        : context.tabs;
      return { tabGroups: [...context.tabGroups, newGroup], tabs };
    }),
    renameTabGroup: assign(({ context, event }) => {
      const { groupId, name } = typeOf('RENAME_TAB_GROUP', event);
      return {
        tabGroups: context.tabGroups.map(g => g.id === groupId ? { ...g, name } : g),
      };
    }),
    changeTabGroupColor: assign(({ context, event }) => {
      const { groupId, color } = typeOf('CHANGE_TAB_GROUP_COLOR', event);
      return {
        tabGroups: context.tabGroups.map(g => g.id === groupId ? { ...g, color } : g),
      };
    }),
    deleteTabGroup: assign(({ context, event }) => {
      const { groupId } = typeOf('DELETE_TAB_GROUP', event);
      return {
        tabGroups: context.tabGroups.filter(g => g.id !== groupId),
        tabs: context.tabs.map(t => t.groupId === groupId ? { ...t, groupId: undefined } : t),
      };
    }),
    toggleTabGroupCollapse: assign(({ context, event }) => {
      const { groupId } = typeOf('TOGGLE_TAB_GROUP_COLLAPSE', event);
      return {
        tabGroups: context.tabGroups.map(g => g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g),
      };
    }),
    addTabToGroup: assign(({ context, event }) => {
      const { tabId, groupId } = typeOf('ADD_TAB_TO_GROUP', event);
      const group = context.tabGroups.find(g => g.id === groupId);
      if (!group) return {};
      return {
        tabs: context.tabs.map(t => t.id === tabId ? { ...t, groupId, pinned: group.isPinned || false } : t),
      };
    }),
    addTabToGroupAt: assign(({ context, event }) => {
      const { tabId, groupId, targetTabId, side } = typeOf('ADD_TAB_TO_GROUP_AT', event);
      const group = context.tabGroups.find(g => g.id === groupId);
      if (!group) return {};
      const tabs = context.tabs.map(t => t.id === tabId ? { ...t, groupId, pinned: group.isPinned || false } : t);
      const sourceIdx = tabs.findIndex(t => t.id === tabId);
      const [moved] = tabs.splice(sourceIdx, 1);
      const targetIdx = tabs.findIndex(t => t.id === targetTabId);
      const insertIdx = side === 'left' ? targetIdx : targetIdx + 1;
      tabs.splice(insertIdx, 0, moved);
      return { tabs };
    }),
    removeTabFromGroup: assign(({ context, event }) => {
      const { tabId } = typeOf('REMOVE_TAB_FROM_GROUP', event);
      return {
        tabs: context.tabs.map(t => t.id === tabId ? { ...t, groupId: undefined } : t),
      };
    }),
    ungroupAllInGroup: assign(({ context, event }) => {
      const { groupId } = typeOf('UNGROUP_ALL_IN_GROUP', event);
      return {
        tabGroups: context.tabGroups.filter(g => g.id !== groupId),
        tabs: context.tabs.map(t => t.groupId === groupId ? { ...t, groupId: undefined } : t),
      };
    }),
    closeAllInGroup: enqueueActions(({ enqueue, context, event, self }) => {
      const { groupId } = typeOf('CLOSE_ALL_IN_GROUP', event);
      const tabsInGroup = context.tabs.filter(t => t.groupId === groupId);
      const remainingTabs = context.tabs.filter(t => t.groupId !== groupId);
      const needNewActive = tabsInGroup.some(t => t.id === context.activeTabId);
      const newActiveTabId = needNewActive
        ? (remainingTabs[remainingTabs.length - 1]?.id ?? '')
        : context.activeTabId;

      enqueue(assign({
        tabs: remainingTabs,
        activeTabId: newActiveTabId,
        tabGroups: context.tabGroups.filter(g => g.id !== groupId),
      }));

      if (needNewActive && newActiveTabId) {
        enqueue(() => self.send({ type: 'OPEN_THREAD_CHAT', threadId: newActiveTabId }));
      }
    }),
    pinTabGroup: assign(({ context, event }) => {
      const { groupId } = typeOf('PIN_TAB_GROUP', event);
      return {
        tabGroups: context.tabGroups.map(g => g.id === groupId ? { ...g, isPinned: true } : g),
        tabs: context.tabs.map(t => t.groupId === groupId ? { ...t, pinned: true } : t),
      };
    }),
    unpinTabGroup: assign(({ context, event }) => {
      const { groupId } = typeOf('UNPIN_TAB_GROUP', event);
      return {
        tabGroups: context.tabGroups.map(g => g.id === groupId ? { ...g, isPinned: undefined } : g),
        tabs: context.tabs.map(t => t.groupId === groupId ? { ...t, pinned: false } : t),
      };
    }),
    cleanupEmptyGroups: assign(({ context }) => {
      const tabGroupIds = new Set(context.tabs.map(t => t.groupId).filter(Boolean));
      const tabGroups = context.tabGroups.filter(g => tabGroupIds.has(g.id));
      return { tabGroups };
    }),

    selectArtifact: assign(({ context, event }) => {
      const artifactId = typeOf('SELECT_ARTIFACT', event).artifactId;
      const tabs = context.tabs.map(tab =>
        tab.id === context.activeTabId ? { ...tab, selectedArtifactId: artifactId } : tab
      );
      return { tabs };
    }),
    addArtifact: assign(({ context, event }) => {
      const { tabId, artifact } = typeOf('ARTIFACT_ADDED', event);
      const tabs = context.tabs.map(tab => {
        if (tab.id !== tabId) return tab;
        const artifacts = [artifact, ...tab.artifacts];
        return { ...tab, artifacts, selectedArtifactId: artifact.id };
      });
      return { tabs };
    }),
    updateArtifact: assign(({ context, event }) => {
      // ARTIFACT_UPDATED carries a patch on .artifact — merge title/content
      // into the matching artifact in the target tab. Missing fields are
      // preserved so partial updates work.
      const typedEvent = typeOf('ARTIFACT_UPDATED', event) as any;
      const { tabId, artifact: patch } = typedEvent;
      const tabs = context.tabs.map(tab => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          artifacts: tab.artifacts.map(a => {
            if (a.id !== patch.id) return a;
            return {
              ...a,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.content !== undefined && { content: patch.content }),
              metadata: { ...a.metadata, ...(patch.metadata || {}) },
            };
          }),
        };
      });
      return { tabs };
    }),
    updateTodoTask: assign(({ context, event }) => {
      const { artifactId, taskId, completed } = typeOf('UPDATE_TODO_TASK', event);
      const tabs = context.tabs.map(tab => ({
        ...tab,
        artifacts: tab.artifacts.map(artifact => {
          if (artifact.id === artifactId && artifact.type === 'todo') {
            const tasks = artifact.content.tasks.map((task: any) =>
              task.id === taskId ? { ...task, completed } : task
            );
            return { ...artifact, content: { ...artifact.content, tasks } };
          }
          return artifact;
        })
      }));
      return { tabs };
    }),
    approveTodoList: async ({ event }) => {
      const { artifactId, tasks } = typeOf('APPROVE_TODO_LIST', event);
      trpc.bus.send.mutate({ systemId: id, type: 'APPROVE_TODO_LIST', artifactId, tasks });
    },
    rejectTodoList: async ({ event }) => {
      const { artifactId } = typeOf('REJECT_TODO_LIST', event);
      trpc.bus.send.mutate({ systemId: id, type: 'REJECT_TODO_LIST', artifactId });
    },
    handleHotkey: createHotkeyProcessor({
      quickPrompts: 'TOGGLE_QUICK_PROMPTS',
      closeTab: 'CLOSE_ACTIVE_TAB',
    }),
    openQuickPromptsAtCursor: assign(() => ({
      quickPromptCursor: { x: mouseX, y: mouseY },
    })),
    closeQuickPrompts: assign({ quickPromptCursor: null }),
    respondToBlockInteraction: ({ context, event }) => {
      const { messageId, response } = typeOf('RESPOND_TO_BLOCK_INTERACTION', event);

      if (!context.currentThread?.id) {
        console.error('Cannot respond to block interaction: no current thread');
        return;
      }

      trpc.bus.send.mutate({
        systemId: id,
        type: 'INTERACTIVE_MSG_RESPONSE',
        messageId,
        threadId: context.currentThread.id,
        response,
      });
    },
    updateMessageState: assign(({ context, event }) => {
      const typedEvent = typeOf('UPDATE_MESSAGE_STATE', event) as any;
      const { messageId } = typedEvent;

      if (!context.currentThread?.messages) return {};

      const updated = context.currentThread.messages.map(msg =>
        msg.id === messageId
          ? {
            ...msg,
            ...('text' in typedEvent && typedEvent.text !== undefined && { text: typedEvent.text }),
            ...('blocks' in typedEvent && typedEvent.blocks !== undefined && { blocks: typedEvent.blocks }),
            ...('responseTimestamp' in typedEvent && typedEvent.responseTimestamp !== undefined && { responseTimestamp: typedEvent.responseTimestamp }),
            ...('blockResponse' in typedEvent && typedEvent.blockResponse !== undefined && { blockResponse: typedEvent.blockResponse }),
            ...('status' in typedEvent && typedEvent.status !== undefined && { status: typedEvent.status }),
            ...('asideText' in typedEvent && typedEvent.asideText !== undefined && { asideText: typedEvent.asideText }),
            ...('forkable' in typedEvent && typedEvent.forkable !== undefined && { forkable: typedEvent.forkable }),
            ...('compacted' in typedEvent && typedEvent.compacted !== undefined && { compacted: typedEvent.compacted }),
            // Shallow-merge context so partial backend updates (e.g.
            // the stream-consumer writing only `cliUuid`) don't wipe
            // existing keys. Without this branch, `msg.context.cliUuid`
            // only ever shows up after a full thread reload — which is
            // why `chat.vue:doRevert` was reading `undefined` and the
            // revert+rewind path was bailing with "no CLI UUID".
            ...('context' in typedEvent && typedEvent.context !== undefined && {
              context: { ...((msg as any).context ?? {}), ...typedEvent.context },
            }),
          }
          : msg
      );

      // When a message becomes queued, move it to the end so it always
      // appears below the current agent turn in the conversation.
      if ('status' in typedEvent && typedEvent.status === 'queued') {
        const idx = updated.findIndex(m => m.id === messageId);
        if (idx !== -1 && idx < updated.length - 1) {
          const [queued] = updated.splice(idx, 1);
          updated.push(queued);
        }
      }

      return {
        currentThread: {
          ...context.currentThread,
          messages: updated,
        }
      };
    }),
    dismissMessage: assign(({ context, event }) => {
      const { messageId } = typeOf('DISMISS_MESSAGE', event);
      if (!context.currentThread?.messages) return {};
      return {
        currentThread: {
          ...context.currentThread,
          messages: context.currentThread.messages.filter(m => m.id !== messageId),
        }
      };
    }),
    addMessageToThread: assign(({ context, event }) => {
      const typedEvent = typeOf('MESSAGE_ADDED', event);
      const { threadId, message } = typedEvent;

      if (context.currentThread?.id !== threadId) return {};

      const messages = context.currentThread.messages ?? [];
      const firstQueuedIdx = messages.findIndex((m: any) => m.status === 'queued');

      // Insert before queued messages so they always stay at the bottom
      const updatedMessages = (firstQueuedIdx !== -1 && (message as any).status !== 'queued')
        ? [...messages.slice(0, firstQueuedIdx), message, ...messages.slice(firstQueuedIdx)]
        : [...messages, message];

      return {
        currentThread: {
          ...context.currentThread,
          messages: updatedMessages,
        }
      };
    }),
    requestOlderMessages: ({ context }) => {
      const { hasMore, nextCursor, isLoading } = context.messagePagination;
      if (!context.currentThread?.id || !hasMore || !nextCursor || isLoading) return;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'LOAD_MORE_MESSAGES',
        threadId: context.currentThread.id,
        cursor: nextCursor,
      });
    },
    setLoadingMore: assign(({ context }) => ({
      messagePagination: { ...context.messagePagination, isLoading: true },
    })),
    prependOlderMessages: assign(({ context, event }) => {
      const { threadId, messages, hasMore, nextCursor } = typeOf('OLDER_MESSAGES_LOADED', event);
      if (context.currentThread?.id !== threadId) return {};
      return {
        currentThread: {
          ...context.currentThread,
          messages: [...messages, ...(context.currentThread.messages ?? [])],
        },
        messagePagination: { hasMore, nextCursor, isLoading: false },
      };
    }),
    forkThread: ({ event }) => {
      const { messageId, threadId, threadTopic } = typeOf('FORK_THREAD', event);
      trpc.bus.send.mutate({ systemId: id, type: 'FORK_THREAD', messageId, threadId, threadTopic });
    },
    revertThread: ({ event }) => {
      const { messageId, threadId, restoreFiles, userCliUuid } = typeOf('REVERT_THREAD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REVERT_THREAD',
        messageId,
        threadId,
        ...(restoreFiles !== undefined && { restoreFiles }),
        ...(userCliUuid !== undefined && { userCliUuid }),
      });
    },
    summarizeThread: ({ event }) => {
      const { messageId, threadId } = typeOf('SUMMARIZE_THREAD', event);
      trpc.bus.send.mutate({ systemId: id, type: 'SUMMARIZE_THREAD', messageId, threadId });
    },
    pauseTurn: ({ event }) => {
      const { threadId } = typeOf('PAUSE_TURN', event);
      trpc.bus.send.mutate({ systemId: id, type: 'PAUSE_TURN', threadId });
    },
    unqueueMessage: ({ event }) => {
      const { threadId, messageId } = typeOf('UNQUEUE_MESSAGE', event);
      trpc.bus.send.mutate({ systemId: id, type: 'FORWARD_BRAIN_EVENT', eventType: 'user.thread.unqueue', payload: { threadId, messageId } });
    },
    persistDismissMessage: ({ event }) => {
      const { messageId } = typeOf('DISMISS_MESSAGE', event);
      trpc.bus.send.mutate({ systemId: id, type: 'DELETE_MESSAGE', messageId });
    },
  },
  guards: {
    targetIs,
    quickPromptsOpen: ({ context }) => context.quickPromptCursor !== null,
  }
}).createMachine({
  id,
  initial: getInitialView(),
  context: () => ({
    // Thread management (normalized)
    threadMap: {} as Record<string, ThreadListItem>,
    threadIds: [] as string[],
    selectedThreadIds: [],
    selectedThreadCode: undefined,
    view: {
      id: '' as ThreadEntity['id'],
      shortCode: '',
      status: '',
      timestamp: 0,
      ...defaultThread,
    } as ThreadViewData,
    create: { ...defaultThread },
    availableTags: [],
    settings: null,
    showArchived: false,
    filters: { statuses: [], tags: [], chatStates: [], search: '', showRootOnly: true },
    threadsImport: { status: 'idle' as const, errors: [], importedCount: 0 },
    threadsExport: { status: 'idle' as const, errors: [], filePath: '', threadCount: 0 },
    // Chat/agent
    currentThread: defaultChatThread,
    recentThreadIds: [] as string[],
    messageInput: "",
    pendingActionId: undefined,
    chatStates: {} as Record<string, ChatState>,
    chatStateOverrides: {} as Record<string, { id: string; expiresAt: number }>,
    tabs: [],
    activeTabId: '',
    tabGroups: [],
    mode: '',
    phase: '',
    phaseByModeName: {},
    modes: [],
    hotkeys: {},
    chatSettings: { modes: [], hotkeys: {} },
    hasRequiredApiKeys: true,
    commands: [],
    quickPromptCursor: null,
    navHistory: createNavHistory(getInitialView()),
    messagePagination: { hasMore: false, nextCursor: null, isLoading: false },
    sidebarArchivedThreads: [],
  }),
  on: {
    // Thread management events
    SHOW_CREATE_FORM: {
      target: '.create',
      actions: assign(({ context }) => ({
        create: { ...defaultThread },
        navHistory: pushNavHistory(context.navHistory, 'create'),
      }))
    },
    UPDATE_THREAD_STATUS: {
      actions: 'updateThreadStatus',
    },
    VIEW_LIST: { target: '.list', actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'list') })) },
    VIEW_KANBAN: { target: '.kanban', actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'kanban') })) },
    VIEW_DASHBOARD: { target: '.dashboard', actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'dashboard') })) },
    OPEN_THREAD_CHAT: {
      actions: 'openThreadChat'
    },
    CLEAR_NEW_THREAD_FLAG: {
      actions: 'clearNewThreadFlag'
    },
    THREAD_CREATED: {
      actions: [
        'addThenResetCreateForm',
        spawnChild('clearNewThreadFlag', {
          id: ({ event }) => `clear-new-thread-flag-${typeOf('THREAD_CREATED', event).id}`,
          input: ({ event }) => ({ id: typeOf('THREAD_CREATED', event).id })
        })
      ]
    },
    THREAD_CONNECTED: {
      guard: ({ context }) => !context.showArchived,
      actions: ['setPluginData', 'refreshViewIfActive']
    },
    SET_VIEW_DATA: {
      // Only apply if the response matches the currently viewed thread (prevents stale out-of-order responses)
      guard: ({ event, context }) => typeOf('SET_VIEW_DATA', event).id === context.view.id,
      actions: 'setViewData',
    },
    THREAD_UPDATED: {
      actions: 'updateThreadFromBackend',
    },
    RENAME_THREAD: {
      actions: 'renameThread',
    },
    THREADS_SETTINGS_UPDATED: {
      actions: 'setThreadsSettings',
    },
    DELETE_THREAD: {
      actions: 'deleteThread',
    },
    TOGGLE_VIEW_ARCHIVE: {
      actions: 'toggleViewArchive',
      target: '.list',
    },
    ARCHIVED_THREADS_DATA: {
      actions: 'setArchivedThreads',
    },
    ARCHIVE_THREAD: {
      actions: ['archiveThread', 'removeArchivedThread', 'cleanupEmptyGroups', 'persistTabs', 'persistTabGroups'],
    },
    UNARCHIVE_THREAD: {
      actions: ['unarchiveThread', 'removeUnarchivedThread'],
    },
    UNPIN_THREAD: {
      actions: 'unpinThread',
    },
    PIN_THREAD: {
      actions: 'pinThread',
    },
    THREAD_DELETED: {
      actions: ['removeThreadFromList', 'cleanupEmptyGroups', 'persistTabs', 'persistTabGroups'],
      target: '.list',
    },

    // Import/Export events
    'THREADS.IMPORT': {
      actions: ['setImportingThreads', 'sendImportThreads'],
    },
    'THREADS.RESET_IMPORT_STATUS': {
      actions: 'resetImportThreadsStatus',
    },
    THREADS_IMPORTED: {
      actions: 'handleThreadsImported',
    },
    THREADS_IMPORT_FAILED: {
      actions: 'handleThreadsImportFailed',
    },
    THREAD_CHAT_ERROR: {
      actions: ['removeStaleTab', 'cleanupEmptyGroups', 'persistTabs', 'persistTabGroups'],
    },
    'THREADS.EXPORT': {
      actions: ['setExportingThreads', 'sendExportThreads'],
    },
    'THREADS.RESET_EXPORT_STATUS': {
      actions: 'resetExportThreadsStatus',
    },
    THREADS_EXPORTED: {
      actions: 'handleThreadsExported',
    },
    THREADS_EXPORT_FAILED: {
      actions: 'handleThreadsExportFailed',
    },

    // Filter events
    TOGGLE_FILTER_STATUS: { actions: 'toggleFilterStatus' },
    TOGGLE_FILTER_TAG: { actions: 'toggleFilterTag' },
    TOGGLE_FILTER_CHAT_STATE: { actions: 'toggleFilterChatState' },
    SET_SEARCH: { actions: 'setSearch' },
    CLEAR_FILTERS: { actions: 'clearFilters' },
    TOGGLE_ROOT_ONLY_FILTER: { actions: 'toggleRootOnlyFilter' },
    SELECT_THREAD_ITEMS: { actions: 'selectThreadItems' },
    SET_THREAD_PARENT: { actions: 'sendSetThreadParent' },

    NAVIGATE_BACK: [
      {
        guard: ({ context }) => canGoBack(context.navHistory) && context.navHistory.stack[context.navHistory.index - 1].startsWith('view:'),
        target: '.view',
        actions: [
          assign(({ context }) => {
            const result = goBack(context.navHistory)!;
            const threadId = result.entry.replace('view:', '');
            const selectedThread = context.threadMap[threadId];
            return {
              navHistory: result.history,
              view: selectedThread
                ? { ...context.view, ...selectedThread, id: threadId }
                : { ...context.view, id: threadId },
            } as any;
          }),
          ({ context }) => {
            trpc.bus.send.mutate({ systemId: id, type: 'VIEW_THREAD', threadId: context.view.id });
          },
        ],
      },
      {
        guard: ({ context }) => canGoBack(context.navHistory) && context.navHistory.stack[context.navHistory.index - 1] === 'list',
        target: '.list',
        actions: assign(({ context }) => ({ navHistory: goBack(context.navHistory)!.history })),
      },
      {
        guard: ({ context }) => canGoBack(context.navHistory) && context.navHistory.stack[context.navHistory.index - 1] === 'kanban',
        target: '.kanban',
        actions: assign(({ context }) => ({ navHistory: goBack(context.navHistory)!.history })),
      },
      {
        guard: ({ context }) => canGoBack(context.navHistory) && context.navHistory.stack[context.navHistory.index - 1] === 'dashboard',
        target: '.dashboard',
        actions: assign(({ context }) => ({ navHistory: goBack(context.navHistory)!.history })),
      },
      {
        guard: ({ context }) => canGoBack(context.navHistory) && context.navHistory.stack[context.navHistory.index - 1] === 'create',
        target: '.create',
        actions: assign(({ context }) => ({ navHistory: goBack(context.navHistory)!.history })),
      },
    ],
    NAVIGATE_FORWARD: [
      {
        guard: ({ context }) => canGoForward(context.navHistory) && context.navHistory.stack[context.navHistory.index + 1].startsWith('view:'),
        target: '.view',
        actions: [
          assign(({ context }) => {
            const result = goForward(context.navHistory)!;
            const threadId = result.entry.replace('view:', '');
            const selectedThread = context.threadMap[threadId];
            return {
              navHistory: result.history,
              view: selectedThread
                ? { ...context.view, ...selectedThread, id: threadId }
                : { ...context.view, id: threadId },
            } as any;
          }),
          ({ context }) => {
            trpc.bus.send.mutate({ systemId: id, type: 'VIEW_THREAD', threadId: context.view.id });
          },
        ],
      },
      {
        guard: ({ context }) => canGoForward(context.navHistory) && context.navHistory.stack[context.navHistory.index + 1] === 'list',
        target: '.list',
        actions: assign(({ context }) => ({ navHistory: goForward(context.navHistory)!.history })),
      },
      {
        guard: ({ context }) => canGoForward(context.navHistory) && context.navHistory.stack[context.navHistory.index + 1] === 'kanban',
        target: '.kanban',
        actions: assign(({ context }) => ({ navHistory: goForward(context.navHistory)!.history })),
      },
      {
        guard: ({ context }) => canGoForward(context.navHistory) && context.navHistory.stack[context.navHistory.index + 1] === 'dashboard',
        target: '.dashboard',
        actions: assign(({ context }) => ({ navHistory: goForward(context.navHistory)!.history })),
      },
      {
        guard: ({ context }) => canGoForward(context.navHistory) && context.navHistory.stack[context.navHistory.index + 1] === 'create',
        target: '.create',
        actions: assign(({ context }) => ({ navHistory: goForward(context.navHistory)!.history })),
      },
    ],
    // Breadcrumb trail clicks
    TRAIL_CLICK: [
      {
        guard: { type: 'targetIs', params: { view: 'list' } },
        target: '.list',
        actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'list') })),
      },
      {
        guard: { type: 'targetIs', params: { view: 'kanban' } },
        target: '.kanban',
        actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'kanban') })),
      },
      {
        guard: { type: 'targetIs', params: { view: 'create' } },
        target: '.create',
        actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'create') })),
      },
      {
        guard: { type: 'targetIs', params: { view: 'view' } },
        target: '.view',
      },
      {
        guard: { type: 'targetIs', params: { view: 'dashboard' } },
        target: '.dashboard',
        actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, 'dashboard') })),
      },
    ],
    SELECT_THREAD: {
      target: '.view',
      actions: [
        'setSelectedThread',
        'sendViewThread',
        assign(({ context, event }) => ({
          navHistory: pushNavHistory(context.navHistory, `view:${typeOf('SELECT_THREAD', event).id}`),
        })),
      ],
    },

    // ---- Chat/agent events (always active regardless of view state) ----
    HOTKEY_PRESSED: { actions: ['handleHotkey'] },
    OPEN_QUICK_PROMPTS: { actions: 'openQuickPromptsAtCursor' },
    CLOSE_QUICK_PROMPTS: { actions: 'closeQuickPrompts' },
    TOGGLE_QUICK_PROMPTS: [
      { guard: 'quickPromptsOpen', actions: 'closeQuickPrompts' },
      { actions: 'openQuickPromptsAtCursor' },
    ],
    VIEW_THREAD: { actions: 'sendOpenThreadView' },
    LOAD_CHAT_THREAD: { target: '.dashboard', actions: 'setThreadChatData' },
    REFRESH_RECENT_THREADS: { actions: 'setRefreshThreadsData' },
    AGENT_CONNECTED: { actions: 'setStartupData' },
    AGENT_SETTINGS_UPDATED: { actions: 'handleChatSettingsUpdate' },
    NAVIGATE_TO_SECRETS: { actions: 'navigateToSecrets' },
    API_KEYS_STATUS: { actions: 'updateApiKeyStatus' },
    COMMANDS_UPDATED: {
      actions: assign(({ event }) => ({
        commands: typeOf('COMMANDS_UPDATED', event).commands
      }))
    },
    UPDATE_TODO_TASK: { actions: 'updateTodoTask' },
    APPROVE_TODO_LIST: { actions: 'approveTodoList' },
    REJECT_TODO_LIST: { actions: 'rejectTodoList' },
    RESPOND_TO_BLOCK_INTERACTION: {
      actions: [
        'respondToBlockInteraction',
      ],
    },
    UPDATE_MESSAGE_STATE: { actions: 'updateMessageState' },
    MESSAGE_ADDED: { actions: 'addMessageToThread' },
    LOAD_MORE_MESSAGES: { actions: ['setLoadingMore', 'requestOlderMessages'] },
    OLDER_MESSAGES_LOADED: { actions: 'prependOlderMessages' },
    SEND_MESSAGE: { actions: 'sendMessage' },
    SEND_COMMAND: { actions: 'sendCommand' },
    SET_CHAT_STATE: { actions: 'setChatState' },
    FLASH_CHAT_STATE: {
      actions: [
        'flashChatState',
        spawnChild('clearExpiredOverride', {
          input: ({ event }: any) => ({
            threadId: event.threadId,
            durationMs: event.durationMs ?? 3000,
          }),
        }),
      ],
    },
    CLEAR_CHAT_STATE_OVERRIDE: {
      actions: assign(({ context, event }) => {
        const { threadId } = typeOf('CLEAR_CHAT_STATE_OVERRIDE', event);
        const { [threadId]: _, ...rest } = context.chatStateOverrides;
        return { chatStateOverrides: rest };
      }),
    },
    SET_MODE: { actions: 'setMode' },
    SET_PHASE: { actions: 'setPhase' },
    CLEAR_THREAD: { actions: 'clearThread' },
    NEW_THREAD_IN_PROJECT: { actions: 'newThreadInProject' },
    NEW_THREAD_NO_PROJECT: { actions: 'newThreadNoProject' },
    CREATE_CHILD_THREAD: { actions: 'createChildThread' },
    FORK_THREAD: { actions: 'forkThread' },
    REVERT_THREAD: { actions: 'revertThread' },
    SUMMARIZE_THREAD: { actions: 'summarizeThread' },
    PAUSE_TURN: {
      actions: 'pauseTurn',
    },
    UNQUEUE_MESSAGE: {
      actions: 'unqueueMessage',
    },
    DISMISS_MESSAGE: { actions: ['dismissMessage', 'persistDismissMessage'] },
    TOKEN_STREAM: { actions: 'handleTokenStream' },
    LLM_DONE: {
      actions: 'finishStream',
    },
    SELECT_TAB: { actions: ['selectTab', 'persistTabs'] },
    OPEN_THREAD_TAB: { actions: ['openThreadTab', 'persistTabs'] },
    CLOSE_TAB: { actions: ['closeTab', 'cleanupEmptyGroups', 'persistTabs', 'persistTabGroups'] },
    CLOSE_ACTIVE_TAB: { actions: ['closeActiveTab', 'cleanupEmptyGroups', 'persistTabs', 'persistTabGroups'] },
    // Tab reorder & group events
    REORDER_TABS: { actions: ['reorderTabs', 'persistTabs'] },
    PIN_TAB_AT: { actions: ['pinTabAt', 'persistTabs'] },
    UNPIN_TAB_AT: { actions: ['unpinTabAt', 'persistTabs'] },
    CREATE_TAB_GROUP: { actions: ['createTabGroup', 'persistTabs', 'persistTabGroups'] },
    RENAME_TAB_GROUP: { actions: ['renameTabGroup', 'persistTabGroups'] },
    CHANGE_TAB_GROUP_COLOR: { actions: ['changeTabGroupColor', 'persistTabGroups'] },
    DELETE_TAB_GROUP: { actions: ['deleteTabGroup', 'persistTabs', 'persistTabGroups'] },
    TOGGLE_TAB_GROUP_COLLAPSE: { actions: ['toggleTabGroupCollapse', 'persistTabGroups'] },
    ADD_TAB_TO_GROUP: { actions: ['addTabToGroup', 'persistTabs', 'persistTabGroups'] },
    ADD_TAB_TO_GROUP_AT: { actions: ['addTabToGroupAt', 'persistTabs', 'persistTabGroups'] },
    REMOVE_TAB_FROM_GROUP: { actions: ['removeTabFromGroup', 'persistTabs'] },
    UNGROUP_ALL_IN_GROUP: { actions: ['ungroupAllInGroup', 'persistTabs', 'persistTabGroups'] },
    CLOSE_ALL_IN_GROUP: { actions: ['closeAllInGroup', 'persistTabs', 'persistTabGroups'] },
    PIN_TAB_GROUP: { actions: ['pinTabGroup', 'persistTabs', 'persistTabGroups'] },
    UNPIN_TAB_GROUP: { actions: ['unpinTabGroup', 'persistTabs', 'persistTabGroups'] },
    SELECT_ARTIFACT: { actions: 'selectArtifact' },
    ARTIFACT_ADDED: { actions: 'addArtifact' },
    ARTIFACT_UPDATED: { actions: 'updateArtifact' },
    THREAD_TAB_REQUESTED: {
      actions: [
        assign(({ context, event }) => {
          const { threadId, topic, artifacts, pinned } = typeOf('THREAD_TAB_REQUESTED', event);
          const existingTab = context.tabs.find(t => t.id === threadId);
          const selectedArtifactId =
            existingTab?.selectedArtifactId && artifacts.some(a => a.id === existingTab.selectedArtifactId)
              ? existingTab.selectedArtifactId
              : artifacts[0]?.id;
          const patch = { label: topic, artifacts, selectedArtifactId };

          return {
            tabs: existingTab
              ? context.tabs.map(tab =>
                  tab.id === threadId ? { ...tab, ...patch, ...(pinned !== undefined && { pinned }) } : tab
                )
              : [...context.tabs, { id: threadId, ...patch, ...(pinned && { pinned }) }],
            activeTabId: threadId,
          };
        }),
        'persistTabs',
      ]
    },
  },
  states: {
    'dashboard': {
      entry: 'persistDashboardView',
      meta: { ...breadcrumb('dashboard', 'Dashboard') },
      on: {},
    },
    'list': {
      entry: 'persistListView',
      meta: { ...breadcrumb('list', 'Threads', true) },
      on: {},
    },
    'kanban': {
      entry: 'persistKanbanView',
      meta: { ...breadcrumb('kanban', 'Board') },
      on: {
        UPDATE_THREAD_STATUS: {
          actions: 'updateThreadStatus',
        },
      },
    },
    'create': {
      meta: { ...breadcrumb('create', 'New Thread') },
      on: {
        CREATE_THREAD: {
          target: 'list',
          actions: 'sendCreateThread',
        },
        CANCEL_CREATE: { target: 'list' },
        UPDATE_THREAD_FIELD: {
          actions: 'updateThreadData',
        },
        TOGGLE_TAGS_SECTION: {
          actions: assign({
            create: ({ context, event }) => ({
              ...context.create,
              tagsExpanded: typeOf('TOGGLE_TAGS_SECTION', event).show
            })
          })
        },
        TOGGLE_LINKED_SECTION: {
          actions: assign({
            create: ({ context, event }) => ({
              ...context.create,
              linkedExpanded: typeOf('TOGGLE_LINKED_SECTION', event).show
            })
          })
        },
      },
    },
    'view': {
      meta: {
        ...breadcrumbWithParams<ThreadsContext>({
          target: 'view',
          getLabel: (ctx) => ctx.view.topic || 'Untitled Thread'
        }),
        ...contextMenuFn<ThreadsContext>((ctx) => {
          if (!ctx.view?.id) return []
          return [
            ...(ctx.view.pinned ? [{
              label: 'Unpin Thread',
              icon: Pin,
              event: { type: 'UNPIN_THREAD' as const, threadId: ctx.view.id },
            }] : [{
              label: 'Pin Thread',
              icon: Pin,
              event: { type: 'PIN_THREAD' as const, threadId: ctx.view.id },
            }]),
            ...(ctx.view.archived ? [{
              label: 'Unarchive Thread',
              icon: Archive,
              event: { type: 'UNARCHIVE_THREAD' as const, threadId: ctx.view.id },
            }] : !ctx.view.pinned ? [{
              label: 'Archive Thread',
              icon: Archive,
              event: { type: 'ARCHIVE_THREAD' as const, threadId: ctx.view.id },
              confirm: `Archive thread "${ctx.view.topic || 'Untitled'}"? It will be hidden from all lists.`,
            }] : []),
            ...(!ctx.view.pinned ? [{
              label: 'Delete Thread',
              icon: Trash2,
              event: { type: 'DELETE_THREAD' as const, threadId: ctx.view.id },
              iconColor: 'text-red-400',
              confirm: `Are you sure you want to delete thread "${ctx.view.topic || 'Untitled'}"? This will permanently delete all messages and other data associated.`,
            }] : []),
            {
              label: 'Copy Id',
              icon: Copy,
              event: { type: 'APP_COPY_TO_CLIPBOARD' as const, text: ctx.view.id },
              separator: true,
            },
          ]
        }),
      },
      on: {
        SHOW_CREATE_FORM_AS_CHILD: {
          target: 'create',
          actions: 'setupParentThread'
        },
        UPDATE_THREAD_FIELD: {
          actions: ['updateThreadData', 'updateThreadInThreads', 'updateCurrentThread', 'sendUpdateThreadField'],
        },
      },
    },
  },
});

export default threadsState;
