// The threads plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { Simplify } from '@abuddy/sdk/helpers'
import type { HotkeysMap, NavHistory, PluginInbox } from '@abuddy/sdk/fe'
import type {
  AgentMode as AgentModeConfig, AgentSettings, AgentThreadData, CommandItem, Tab, ThreadCreateData,
  ThreadEntity, ThreadTagOption, ThreadViewData, ThreadsSettings,
} from '@/__generated__/types'
import type { ThreadTabGroup } from './canvas/agent/tabs/types'

export type ThreadListItem = Simplify<ThreadEntity & {
  tags?: string[];
  isNew?: boolean;
  parentId?: string;
}>;

export type ChatState = 'idle' | 'working' | 'paused' | 'error' | 'success';

export interface ThreadsContext {
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
  commands: CommandItem[];
  quickPromptCursor: { x: number; y: number } | null;
  pendingThreadCwd?: string;
  pendingForceDirectoryPicker?: boolean;
  navHistory: NavHistory<string>;
  messagePagination: { hasMore: boolean; nextCursor: string | null; isLoading: boolean };
  sidebarArchivedThreads: ThreadListItem[];
}

/** What the artifact viewers, the dashboard and the tiptap command items ask of the threads plugin */
export type ThreadsInboxEvent =
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'APPROVE_TODO_LIST'; artifactId: string; tasks: unknown[] }
  | { type: 'REJECT_TODO_LIST'; artifactId: string }
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
  | { type: 'VIEW_THREAD'; threadId: string }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'VIEW_DASHBOARD' }

export type Contract = {
  state: ThreadsContext
  inbox: PluginInbox<{ pack: ThreadsInboxEvent }>
}
