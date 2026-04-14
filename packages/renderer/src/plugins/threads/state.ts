import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log, fromPromise, spawnChild } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type {
  ThreadConnectedData, ThreadEntity, ThreadExtended, OutgoingThreadsEvents,
  ThreadCreateData, ThreadViewData, ThreadTagOption, ThreadEditFields, ThreadsSettings, EARS,
  MessageEntity, ArtifactEntity, AgentThreadData, Tab, ArtifactItem, ArtifactType,
  AgentSettings, AgentMode as AgentModeConfig, MessageReferences, CommandItem, BlockResponse,
} from '@app/api';
import { trpc } from '@/core/trpc';
import { Trash2 } from 'lucide-vue-next';
import { contextMenuFn } from '@/core/context-menu';
import type { Simplify } from '@/core/types/type-helpers';
import { application } from '@/core/actors/application';
import { type HotkeyEvent, type HotkeysMap, createHotkeyProcessor } from '@/core/utils/hotkeys';

export const id = 'threads' as const;

// Module-level mouse position tracker (read when hotkey fires)
let mouseX = 0;
let mouseY = 0;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });

const THREADS_VIEW_KEY = 'threads-view-preference';

function getInitialView(): 'list' | 'kanban' {
  try {
    const stored = localStorage.getItem(THREADS_VIEW_KEY);
    if (stored === 'kanban') return 'kanban';
  } catch {}
  return 'list';
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

type StatusColor = 'bg-zinc-500' | 'bg-yellow-500' | 'bg-green-500';

// ---- Event types ----

type SystemEvent =
  | OutgoingThreadsEvents
  | { type: 'THREAD_UPDATED'; threadId: string; updates: Partial<Pick<ThreadEntity, 'status' | 'tags'>> }
  | { type: 'THREADS_SETTINGS_UPDATED'; settings: ThreadsSettings }
  | { type: 'THREAD_DELETED'; threadId: string }
  | { type: 'THREADS_EXPORTED'; filePath: string; threadCount: number }
  | { type: 'THREADS_EXPORT_FAILED'; errors: string[] }
  | { type: 'THREADS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'THREADS_IMPORT_FAILED'; errors: string[] }

type UIEvent =
  // Thread management events
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
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
  | { type: 'SET_SEARCH'; keyword: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'THREADS.IMPORT'; directory: string }
  | { type: 'THREADS.RESET_IMPORT_STATUS' }
  | { type: 'THREADS.EXPORT'; directory: string }
  | { type: 'THREADS.RESET_EXPORT_STATUS' }
  // Chat/agent events
  | { type: 'VIEW_THREAD'; threadId: string }
  | { type: 'SEND_MESSAGE'; text: string; references?: MessageReferences }
  | { type: 'SEND_COMMAND'; command: string; text: string; references?: MessageReferences }
  | { type: 'CLEAR_THREAD' }
  | { type: 'CREATE_CHILD_THREAD'; parentThreadId: string }
  | { type: 'SET_STATUS_COLOR'; color: StatusColor }
  | { type: 'RESET_STATUS_COLOR'; }
  | { type: 'SELECT_TAB'; tabId: string }
  | { type: 'OPEN_THREAD_TAB'; threadId: string; label: string; pinned?: boolean }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'SET_MODE'; mode: string }
  | { type: 'SET_PHASE'; phase: string }
  | { type: 'UPDATE_TODO_TASK'; artifactId: string; taskId: string; completed: boolean }
  | { type: 'APPROVE_TODO_LIST'; artifactId: string; tasks: any[] }
  | { type: 'REJECT_TODO_LIST'; artifactId: string }
  | { type: 'RESPOND_TO_BLOCK_INTERACTION'; messageId: string; response: BlockResponse }
  | { type: 'UPDATE_MESSAGE_STATE'; messageId: string; responseTimestamp: number; blockResponse?: BlockResponse; asideText?: string }
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
  | { type: 'REVERT_THREAD'; messageId: string; threadId: string }
  | { type: 'PAUSE_TURN'; threadId: string }
  | { type: 'UPDATE_CLAUDE_PERMISSION_MODE'; threadId: string; mode: string }
  | { type: 'UPDATE_CLAUDE_WORKTREE'; threadId: string; useWorktree: boolean }
  | { type: 'TOKEN_STREAM'; token: string }
  | { type: 'LLM_DONE' }

type ThreadEvents =
  | UIEvent
  | SystemEvent
  | TrailClickEvent;

const typeOf = safeEvents<ThreadEvents>();

export type ThreadListItem = Simplify<ThreadEntity & {
  tags?: string[];
  isNew?: boolean;
}>;

// ---- Context ----

interface ThreadsContext {
  // Thread management
  threads: ThreadListItem[];
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
  filters: {
    statuses: string[];
    tags: string[];
    search: string;
  };
  threadsImport: { status: 'idle' | 'importing' | 'success' | 'error'; errors: string[]; importedCount: number };
  threadsExport: { status: 'idle' | 'exporting' | 'success' | 'error'; errors: string[]; filePath: string; threadCount: number };
  // Chat/agent
  currentThread: AgentThreadData | null;
  recentThreads: ThreadEntity[];
  messageInput: string;
  pendingActionId?: string;
  statusColor: StatusColor;
  tabs: Tab[];
  activeTabId: string;
  mode: string;
  phase: string;
  phaseByMode: Record<string, string | undefined>;
  modes: AgentModeConfig[];
  hotkeys: HotkeysMap;
  chatSettings: AgentSettings;
  hasRequiredApiKeys: boolean;
  commands: CommandItem[];
  quickPromptCursor: { x: number; y: number } | null;
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
    resetStatusColorAfterDelay: fromPromise<void, void>(async ({ system }) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      system.get(id).send({ type: 'RESET_STATUS_COLOR' });
    }),
  },
  actions: {
    // ---- Thread management actions ----
    openThreadChat: ({ self, event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId;
      // Navigate to dashboard view (replaces old agent canvas navigation)
      self.send({ type: 'VIEW_DASHBOARD' });
      // Request thread chat data from backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_THREAD_CHAT',
        threadId,
      });
    },
    setupParentThread: assign(({ event, context }) => {
      const typedEvent = typeOf('SHOW_CREATE_FORM_AS_CHILD', event);
      const parentThread = context.threads.find(t => t.id === typedEvent.parentThreadId);

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
        threads: typedEvent.data.threads,
        availableTags: typedEvent.data.availableTags,
        settings: typedEvent.data.settings,
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
        threads: [newThread, ...context.threads],
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
      const selectedThread = context.threads.find(t => t.id === typedEvent.id);
      if (!selectedThread) {
        console.warn(`Selected thread with id ${typedEvent.id} not found in context.`);
        return {};
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
        threads: context.threads.map(t => t.id === context.view.id ? newThread : t),
      };
    }),
    clearNewThreadFlag: assign(({ context, event }) => ({
      threads: context.threads.map(t => t.id === typeOf('CLEAR_NEW_THREAD_FLAG', event).id ? { ...t, isNew: false } : t),
    })),
    updateThreadStatus: ({ event, context }) => {
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
        threads: context.threads.map(t =>
          t.id === threadId ? { ...t, ...updates } : t
        ),
        view: context.view.id === threadId
          ? { ...context.view, ...updates }
          : context.view
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
    persistListView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'list'); } catch {} },
    persistKanbanView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'kanban'); } catch {} },
    removeThreadFromList: assign(({ event, context }) => {
      const { threadId } = typeOf('THREAD_DELETED', event);
      return {
        threads: context.threads.filter(t => t.id !== threadId),
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
    setSearch: assign(({ context, event }) => ({
      filters: { ...context.filters, search: typeOf('SET_SEARCH', event).keyword },
    })),
    clearFilters: assign({
      filters: { statuses: [] as string[], tags: [] as string[], search: '' },
    }),

    // ---- Chat/agent actions ----
    requestThreadChatData: ({ event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_THREAD_CHAT',
        threadId,
      });
    },
    setStatusColor: assign((_, params?: { color: StatusColor }) => {
      if (params?.color) return { statusColor: params.color };
      return { statusColor: 'bg-zinc-500' as StatusColor };
    }),
    setMode: assign(({ context, event }) => {
      const newMode = typeOf('SET_MODE', event).mode;
      const modeConfig = context.modes.find(m => m.id === newMode);

      const updatedPhaseByMode = { ...context.phaseByMode, [context.mode]: context.phase };
      const newPhase = modeConfig?.phases?.length
        ? (newMode in updatedPhaseByMode ? updatedPhaseByMode[newMode] : modeConfig.phases[0].id)
        : undefined;

      return { mode: newMode, phase: newPhase, phaseByMode: updatedPhaseByMode };
    }),
    setPhase: assign(({ context, event }) => {
      const newPhase = typeOf('SET_PHASE', event).phase;
      return {
        phase: newPhase,
        phaseByMode: { ...context.phaseByMode, [context.mode]: newPhase }
      };
    }),
    navigateToSecrets: ({ system }) => {
      system.get(application).send({ type: 'SELECT_PLUGIN', pluginId: 'settings' });
      const settingsActor = system.get('settings');
      if (settingsActor) {
        settingsActor.send({ type: 'TAB.SELECT', tab: 'general' });
        settingsActor.send({ type: 'GENERAL_NAV.SELECT', item: 'secrets' });
      }
    },
    updateApiKeyStatus: assign(({ event }) => ({
      hasRequiredApiKeys: typeOf('API_KEYS_STATUS', event).hasRequiredApiKeys
    })),
    sendMessage: ({ context, event }) => {
      const { text, references } = typeOf('SEND_MESSAGE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'USER_MSG',
        text,
        mode: context.mode,
        phase: context.phase,
        threadId: context.currentThread?.id,
        ...(references && { references }),
      });
    },
    sendCommand: ({ context, event }) => {
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
      });
    },
    clearThread: assign(() => ({
      currentThread: { ...defaultChatThread, messages: [] }
    })),
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

      if (thread.id) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'OPEN_THREAD_TAB',
          threadId: thread.id,
          label: thread.topic || `Thread ${thread.shortCode || ''}`,
          ...(thread.pinned && { pinned: true }),
        });
      }

      if (thread.forcedMode) {
        const modeConfig = context.modes.find(m => m.id === thread.forcedMode);
        const newPhase = modeConfig?.phases?.length
          ? (thread.forcedMode in context.phaseByMode ? context.phaseByMode[thread.forcedMode] : modeConfig.phases[0].id)
          : undefined;

        return { currentThread: thread, mode: thread.forcedMode, phase: newPhase };
      }

      return { currentThread: thread };
    }),
    setRefreshThreadsData: assign(({ event }) => {
      const typedEvent = typeOf('REFRESH_RECENT_THREADS', event);
      return { recentThreads: typedEvent.data.recentThreads as ThreadEntity[] };
    }),
    setStartupData: assign(({ context, event }) => {
      const typedEvent = typeOf('AGENT_CONNECTED', event);

      const currentThreadTab = typedEvent.data.tabs?.find(tab =>
        tab.id === typedEvent.data.currentThread?.id && tab.artifacts.length > 0
      );

      const extracted = extractChatSettings(typedEvent.data.settings || { modes: [], hotkeys: {} });

      const currentThread = typedEvent.data.currentThread;
      const forcedMode = currentThread?.forcedMode;
      let modeUpdate = {};
      if (forcedMode) {
        const modeConfig = extracted.modes.find(m => m.id === forcedMode);
        const newPhase = modeConfig?.phases?.length
          ? (forcedMode in context.phaseByMode ? context.phaseByMode[forcedMode] : modeConfig.phases[0].id)
          : undefined;
        modeUpdate = { mode: forcedMode, phase: newPhase };
      } else {
        const visibleModes = extracted.modes.filter(m => !m.hidden);
        const defaultMode = visibleModes[0];
        if (defaultMode) {
          const defaultPhase = defaultMode.phases?.length ? defaultMode.phases[0].id : undefined;
          modeUpdate = { mode: defaultMode.id, phase: defaultPhase };
        }
      }

      return {
        currentThread,
        tabs: typedEvent.data.tabs || [],
        activeTabId: currentThreadTab?.id || typedEvent.data.tabs?.[0]?.id || 'dashboard',
        ...extracted,
        hasRequiredApiKeys: typedEvent.data.hasRequiredApiKeys ?? true,
        commands: typedEvent.data.commands || [],
        ...modeUpdate
      };
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
    closeTab: assign(({ context, event }) => {
      const tabId = typeOf('CLOSE_TAB', event).tabId;
      if (tabId === 'dashboard') return {};

      const tab = context.tabs.find(t => t.id === tabId);
      if (tab?.pinned) return {};

      const newTabs = context.tabs.filter(t => t.id !== tabId);
      const newActiveTabId = context.activeTabId === tabId ? 'dashboard' : context.activeTabId;

      return { tabs: newTabs, activeTabId: newActiveTabId };
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
      const tabs = context.tabs.map(tab =>
        tab.id === tabId ? { ...tab, artifacts: [...tab.artifacts, artifact] } : tab
      );
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
      textToSpeech: 'TEXT_TO_SPEECH',
      quickPrompts: 'TOGGLE_QUICK_PROMPTS',
    }),
    textToSpeech: () => {
      console.log('[Threads] Text-to-speech triggered (stub)');
    },
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

      return {
        currentThread: {
          ...context.currentThread,
          messages: context.currentThread.messages.map(msg =>
            msg.id === messageId
              ? {
                ...msg,
                ...('text' in typedEvent && typedEvent.text !== undefined && { text: typedEvent.text }),
                ...('blocks' in typedEvent && typedEvent.blocks !== undefined && { blocks: typedEvent.blocks }),
                ...('responseTimestamp' in typedEvent && typedEvent.responseTimestamp !== undefined && { responseTimestamp: typedEvent.responseTimestamp }),
                ...('blockResponse' in typedEvent && typedEvent.blockResponse !== undefined && { blockResponse: typedEvent.blockResponse }),
                ...('status' in typedEvent && typedEvent.status !== undefined && { status: typedEvent.status }),
                ...('asideText' in typedEvent && typedEvent.asideText !== undefined && { asideText: typedEvent.asideText })
              }
              : msg
          )
        }
      };
    }),
    addMessageToThread: assign(({ context, event }) => {
      const typedEvent = typeOf('MESSAGE_ADDED', event);
      const { threadId, message } = typedEvent;

      if (context.currentThread?.id !== threadId) return {};

      return {
        currentThread: {
          ...context.currentThread,
          messages: [...(context.currentThread.messages ?? []), message]
        }
      };
    }),
    forkThread: ({ event }) => {
      const { messageId, threadId, threadTopic } = typeOf('FORK_THREAD', event);
      trpc.bus.send.mutate({ systemId: id, type: 'FORK_THREAD', messageId, threadId, threadTopic });
    },
    updateClaudePermissionMode: ({ event }) => {
      const typedEvent = typeOf('UPDATE_CLAUDE_PERMISSION_MODE', event) as any;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_CLAUDE_PERMISSION_MODE',
        threadId: typedEvent.threadId,
        mode: typedEvent.mode,
      });
    },
    updateClaudeWorktree: ({ event }) => {
      const typedEvent = typeOf('UPDATE_CLAUDE_WORKTREE', event) as any;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_CLAUDE_WORKTREE',
        threadId: typedEvent.threadId,
        useWorktree: typedEvent.useWorktree,
      });
    },
    revertThread: ({ event }) => {
      const { messageId, threadId } = typeOf('REVERT_THREAD', event);
      trpc.bus.send.mutate({ systemId: id, type: 'REVERT_THREAD', messageId, threadId });
    },
    pauseTurn: ({ event }) => {
      const { threadId } = typeOf('PAUSE_TURN', event);
      trpc.bus.send.mutate({ systemId: id, type: 'PAUSE_TURN', threadId });
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
    // Thread management
    threads: [],
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
    filters: { statuses: [], tags: [], search: '' },
    threadsImport: { status: 'idle' as const, errors: [], importedCount: 0 },
    threadsExport: { status: 'idle' as const, errors: [], filePath: '', threadCount: 0 },
    // Chat/agent
    currentThread: defaultChatThread,
    recentThreads: [],
    messageInput: "",
    pendingActionId: undefined,
    statusColor: 'bg-zinc-500' as StatusColor,
    tabs: [],
    activeTabId: 'dashboard',
    mode: '',
    phase: '',
    phaseByMode: {},
    modes: [],
    hotkeys: {},
    chatSettings: { modes: [], hotkeys: {} },
    hasRequiredApiKeys: true,
    commands: [],
    quickPromptCursor: null,
  }),
  on: {
    // Thread management events
    SHOW_CREATE_FORM: {
      target: '.create',
      actions: assign(() => ({ create: { ...defaultThread } }))
    },
    UPDATE_THREAD_STATUS: {
      actions: 'updateThreadStatus',
    },
    VIEW_LIST: { target: '.list' },
    VIEW_KANBAN: { target: '.kanban' },
    VIEW_DASHBOARD: { target: '.dashboard' },
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
      actions: 'setPluginData'
    },
    SET_VIEW_DATA: {
      actions: 'setViewData',
    },
    THREAD_UPDATED: {
      actions: 'updateThreadFromBackend',
    },
    THREADS_SETTINGS_UPDATED: {
      actions: 'setThreadsSettings',
    },
    DELETE_THREAD: {
      actions: 'deleteThread',
    },
    THREAD_DELETED: {
      actions: 'removeThreadFromList',
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
    SET_SEARCH: { actions: 'setSearch' },
    CLEAR_FILTERS: { actions: 'clearFilters' },

    // Breadcrumb trail clicks
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.kanban', 'kanban'],
      ['.create', 'create'],
      ['.view', 'view'],
      ['.dashboard', 'dashboard'],
    ]),
    SELECT_THREAD: {
      target: '.view',
      actions: ['setSelectedThread', 'sendViewThread'],
    },

    // ---- Chat/agent events (always active regardless of view state) ----
    HOTKEY_PRESSED: { actions: ['handleHotkey'] },
    TEXT_TO_SPEECH: { actions: 'textToSpeech' },
    OPEN_QUICK_PROMPTS: { actions: 'openQuickPromptsAtCursor' },
    CLOSE_QUICK_PROMPTS: { actions: 'closeQuickPrompts' },
    TOGGLE_QUICK_PROMPTS: [
      { guard: 'quickPromptsOpen', actions: 'closeQuickPrompts' },
      { actions: 'openQuickPromptsAtCursor' },
    ],
    VIEW_THREAD: { actions: 'sendOpenThreadView' },
    LOAD_CHAT_THREAD: { actions: 'setThreadChatData' },
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
    RESPOND_TO_BLOCK_INTERACTION: { actions: 'respondToBlockInteraction' },
    UPDATE_MESSAGE_STATE: { actions: 'updateMessageState' },
    MESSAGE_ADDED: { actions: 'addMessageToThread' },
    SEND_MESSAGE: {
      actions: [
        'sendMessage',
        { type: 'setStatusColor', params: { color: 'bg-yellow-500' } },
      ],
    },
    SEND_COMMAND: {
      actions: [
        'sendCommand',
        { type: 'setStatusColor', params: { color: 'bg-yellow-500' } },
      ],
    },
    RESET_STATUS_COLOR: { actions: 'setStatusColor' },
    SET_MODE: { actions: 'setMode' },
    SET_PHASE: { actions: 'setPhase' },
    CLEAR_THREAD: { actions: 'clearThread' },
    CREATE_CHILD_THREAD: { actions: 'createChildThread' },
    FORK_THREAD: { actions: 'forkThread' },
    REVERT_THREAD: { actions: 'revertThread' },
    PAUSE_TURN: { actions: 'pauseTurn' },
    UPDATE_CLAUDE_PERMISSION_MODE: { actions: 'updateClaudePermissionMode' },
    UPDATE_CLAUDE_WORKTREE: { actions: 'updateClaudeWorktree' },
    TOKEN_STREAM: { actions: 'handleTokenStream' },
    LLM_DONE: {
      actions: [
        'finishStream',
        { type: 'setStatusColor', params: { color: 'bg-green-500' } },
        spawnChild('resetStatusColorAfterDelay'),
      ]
    },
    SELECT_TAB: { actions: 'selectTab' },
    OPEN_THREAD_TAB: { actions: 'openThreadTab' },
    CLOSE_TAB: { actions: 'closeTab' },
    SELECT_ARTIFACT: { actions: 'selectArtifact' },
    ARTIFACT_ADDED: { actions: 'addArtifact' },
    ARTIFACT_UPDATED: { actions: 'updateArtifact' },
    THREAD_TAB_REQUESTED: {
      actions: assign(({ context, event }) => {
        const { threadId, topic, artifacts, pinned } = typeOf('THREAD_TAB_REQUESTED', event);
        const label = topic;
        const existingTab = context.tabs.find(t => t.id === threadId);

        if (existingTab) {
          return {
            tabs: context.tabs.map(tab =>
              tab.id === threadId ? { ...tab, label, artifacts, ...(pinned !== undefined && { pinned }) } : tab
            ),
            activeTabId: threadId
          };
        }

        return {
          tabs: [...context.tabs, {
            id: threadId,
            label,
            artifacts,
            selectedArtifactId: artifacts[0]?.id,
            ...(pinned && { pinned }),
          }],
          activeTabId: threadId
        };
      })
    },
  },
  states: {
    'dashboard': {
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
          return (!ctx.view.pinned ? [{ label: 'Delete Thread', icon: Trash2, event: { type: 'DELETE_THREAD' as const, threadId: ctx.view.id }, iconColor: 'text-red-400', confirm: `Are you sure you want to delete thread "${ctx.view.topic || 'Untitled'}"? This will permanently delete all messages and other data associated.` }] : [])
        }),
      },
      on: {
        SHOW_CREATE_FORM_AS_CHILD: {
          target: 'create',
          actions: 'setupParentThread'
        },
        UPDATE_THREAD_FIELD: {
          actions: ['updateThreadData', 'updateThreadInThreads', 'sendUpdateThreadField'],
        },
      },
    },
  },
});

export default threadsState;
