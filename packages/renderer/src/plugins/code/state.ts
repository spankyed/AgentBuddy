import { setup, type ActorRefFrom, assign, enqueueActions } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';
import { type HotkeyEvent, type HotkeysMap, createHotkeyProcessor } from '@/core/utils/hotkeys';
import { saveOpenTabs, loadPersistedTabs, sortTabsByPinned } from './utils/persisted-tabs';
import { loadRecentFiles, addRecentFile } from './utils/recent-files';
import { pushTabViewHistory, nextActiveFromHistory } from './utils/tab-management';
import { saveTabGroups, loadTabGroups, getNextAvailableColor, ALL_COLORS, type TabGroupColor, type TabGroup } from '@/shared/tab-groups';
import { type NavHistory, createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward } from '@/core/utils/nav-history';
import type { OutgoingCodeEvents, CodeSettings, KeyboardShortcut } from '@app/api';

// Import child state machines
import { explorerState } from './features/explorer/state';
import { searchState } from './features/search/state';
import { commitState, type GitStatusFile, type GitDiff } from './features/commit/state';
import { pullRequestState } from './features/pull-request/state';
import { terminalState, type TerminalInfo } from './features/terminal/state';
import { actionsState, type ActionTab } from './features/actions/state';
import { promptsState, type PromptTab } from './features/prompts/state';

export const id = 'code' as const;

// Module-level callback for getting editor selection text.
// Set by canvas.vue so the state machine can read Monaco selection without Vue refs.
let _editorSelectionGetter: (() => string) | null = null;
export function setEditorSelectionGetter(getter: (() => string) | null) {
  _editorSelectionGetter = getter;
}

const ALL_PANELS: PanelType[] = ['explorer', 'search', 'commit', 'pr', 'actions', 'prompts'];

/** IDs of terminals currently open as canvas tabs */
function getTabbedTerminalIds(openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[]): Set<string> {
  return new Set(
    openFiles.filter((f: any) => f.isTerminal).map((f: any) => f.terminalInfo.id)
  )
}

export interface OpenFile {
  path: string
  content: string
  originalContent: string  // Content when file was opened or last saved
  modified: boolean
  isDiff?: boolean
  gitDiff?: GitDiff
  gitFile?: GitStatusFile
  externallyModified?: boolean
  externalModificationTime?: Date
  pendingSaveConflict?: boolean
  isImage?: boolean
  isVideo?: boolean
  isBinary?: boolean
  isRichText?: boolean
  _richTextBaselineSet?: boolean
  isPrDiff?: boolean
  isPinned?: boolean
  groupId?: string
  isPreview?: boolean
}

/** Unstaged diff tabs are editable (right side = working tree). PR diffs are read-only. */
export function isEditableDiff(file: OpenFile | { isDiff?: boolean; isPrDiff?: boolean; gitFile?: { staged: boolean } }): boolean {
  if ('isPrDiff' in file && file.isPrDiff) return false
  return file.isDiff === true && file.gitFile?.staged === false
}

export type { TabGroupColor, TabGroup };

export interface TerminalTab extends OpenFile {
  isTerminal: true
  terminalInfo: TerminalInfo
}

export type Context = {
  baseDirectory: string
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
  activeFilePath: string | null
  isLoading: boolean
  error: string | null
  selectedPanel: PanelType
  tabsRestored?: boolean
  pendingTabOrder?: Array<{ path: string; order: number }>  // Track desired tab order during restoration
  pendingPersistedMetadata?: Map<string, { groupId?: string; isPinned?: boolean; isPreview?: boolean }>  // Track metadata to apply after restoration
  // Tab groups state
  tabGroups: TabGroup[]
  // Quick open state
  isQuickOpenVisible: boolean
  quickOpenQuery: string
  quickOpenResults: QuickOpenResult[]
  quickOpenSelectedIndex: number
  quickOpenLoading: boolean
  recentlyOpenedFiles: string[]
  tabViewHistory: string[]
  hotkeys: HotkeysMap
  settings?: CodeSettings
  pendingRevealLine: { filePath: string; line: number; column: number; lineText?: string } | null
  searchFocusTrigger: number
  searchPrefillText: string
  panelTerminalId: string | null
  panelTerminalExpanded: boolean
  pendingTerminalTabIds?: string[]
  panelNavHistory: NavHistory<PanelType>
}

export interface QuickOpenResult {
  path: string
  relativePath: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  score?: number
  matchRanges?: Array<[number, number]> // For highlighting matches
}

export type Event =
  | OutgoingCodeEvents
  // Generic update event for child actors to update parent state
  | { type: 'UPDATE_STATE'; updates: Partial<Context> }
  | { type: 'ADD_TAB'; tab: any; replacePreview?: boolean; extraUpdates?: Partial<Context> }
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'SELECT_PANEL'; panel: PanelType }
  // Tab pinning events
  | { type: 'PIN_TAB'; path: string }
  | { type: 'UNPIN_TAB'; path: string }
  | { type: 'PIN_TAB_AT'; path: string; targetPath: string; side: 'left' | 'right' }
  | { type: 'UNPIN_TAB_AT'; path: string; targetPath: string; side: 'left' | 'right' }
  // Tab group events
  | { type: 'CREATE_GROUP'; name: string; tabPaths?: string[] }
  | { type: 'RENAME_GROUP'; groupId: string; name: string }
  | { type: 'CHANGE_GROUP_COLOR'; groupId: string; color: TabGroupColor }
  | { type: 'DELETE_GROUP'; groupId: string; closeTabsInGroup?: boolean }
  | { type: 'TOGGLE_GROUP_COLLAPSE'; groupId: string }
  | { type: 'ADD_TAB_TO_GROUP'; path: string; groupId: string }
  | { type: 'REMOVE_TAB_FROM_GROUP'; path: string }
  | { type: 'REORDER_GROUPS'; fromIndex: number; toIndex: number }
  | { type: 'PIN_GROUP'; groupId: string }
  | { type: 'UNPIN_GROUP'; groupId: string }
  // Hotkey events
  | HotkeyEvent
  | { type: 'OPEN_TERMINAL' }
  | { type: 'OPEN_TERMINAL_TAB' }
  | { type: 'NAVIGATE_PREV_PANEL' }
  | { type: 'NAVIGATE_NEXT_PANEL' }
  | { type: 'FOCUS_SEARCH'; selectedText?: string }
  // Quick open events
  | { type: 'TOGGLE_QUICK_OPEN' }
  | { type: 'SHOW_QUICK_OPEN' }
  | { type: 'HIDE_QUICK_OPEN' }
  | { type: 'UPDATE_QUICK_OPEN_QUERY'; query: string }
  | { type: 'SELECT_QUICK_OPEN_RESULT'; index: number }
  | { type: 'OPEN_QUICK_OPEN_RESULT'; path: string }
  | { type: 'SEARCH_IN_FOLDER'; folder: string }
  | { type: 'SAVE_ACTIVE_FILE' }
  | { type: 'CLOSE_ACTIVE_TAB' }
  | { type: 'CLOSE_TAB'; path: string }
  | { type: 'KILL_TERMINAL'; path: string }
  | { type: 'PROMOTE_PREVIEW_TAB'; path: string }
  // Panel terminal events
  | { type: 'SELECT_PANEL_TERMINAL'; terminalId: string }
  | { type: 'CLOSE_PANEL_TERMINAL' }
  | { type: 'OPEN_TERMINAL_IN_TAB'; terminalId: string }
  | { type: 'MOVE_TERMINAL_TO_PANEL'; path: string }
  | { type: 'TOGGLE_PANEL_TERMINAL' }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' };

export type CodeState = ActorRefFrom<typeof codeState>;

type PanelType = 'explorer' | 'search' | 'commit' | 'pr' | 'actions' | 'prompts';

// Shared tab removal logic (tab removal + group cleanup + explorer notify)
function removeTabLogic(context: Context, system: any, path: string) {
  const file = context.openFiles.find(f => f.path === path)
  const newOpenFiles = context.openFiles.filter(f => f.path !== path)
  const newActiveFilePath = context.activeFilePath === path
    ? nextActiveFromHistory(context.tabViewHistory, newOpenFiles)
    : context.activeFilePath

  const groupId = file && 'groupId' in file ? (file as any).groupId : undefined
  let newTabGroups = context.tabGroups
  if (groupId) {
    const remaining = newOpenFiles.filter(f => 'groupId' in f && (f as any).groupId === groupId)
    if (remaining.length === 0) newTabGroups = context.tabGroups.filter(g => g.id !== groupId)
  }

  system.get('explorer').send({ type: 'explorer.CLOSE_FILE', path })

  return { openFiles: newOpenFiles, activeFilePath: newActiveFilePath, tabGroups: newTabGroups }
}

// Close tab with terminal confirmation, then remove
function closeTabWithConfirmation(context: Context, system: any, path: string) {
  const file = context.openFiles.find(f => f.path === path)

  if (file && 'isTerminal' in file && (file as any).isTerminal) {
    const confirmClose = context.settings?.confirmTerminalClose ?? true
    if (confirmClose) {
      const terminalInfo = (file as any).terminalInfo
      const name = terminalInfo.customTitle || terminalInfo.cwd.split('/').filter(Boolean).pop() || terminalInfo.title
      if (!confirm(`Close terminal "${name}"?`)) return {}
    }
    if (context.settings?.closeTerminalOnTabClose ?? true) {
      system.get('terminal').send({ type: 'terminal.CLOSE', terminalId: (file as any).terminalInfo.id })
    }
  }

  return removeTabLogic(context, system, path)
}

// Directory will be loaded from backend EARS store

// Insert a newly-restored tab into its persisted slot. Non-persisted tabs (or
// tabs appearing after all persisted ones have been placed) go to the end.
function insertByPersistedOrder<T extends { path: string }>(
  openFiles: T[],
  newTab: T,
  pendingOrder: Array<{ path: string; order: number }>
): T[] {
  const orderMap = new Map(pendingOrder.map(t => [t.path, t.order]))
  const newOrder = orderMap.get(newTab.path)

  // Not a persisted tab — append at the end (unpinned section).
  if (newOrder === undefined) {
    return [...openFiles, newTab]
  }

  // Find the first existing tab whose persisted order is greater than newTab's.
  const insertAt = openFiles.findIndex(f => {
    const o = orderMap.get(f.path)
    return o !== undefined && o > newOrder
  })

  if (insertAt === -1) {
    return [...openFiles, newTab]
  }

  return [...openFiles.slice(0, insertAt), newTab, ...openFiles.slice(insertAt)]
}

// Helper to check and delete empty groups
function deleteEmptyGroups(
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[],
  tabGroups: TabGroup[],
  targetGroupId?: string
): TabGroup[] {
  if (!targetGroupId) return tabGroups

  const remainingTabsInGroup = openFiles.filter(
    f => 'groupId' in f && f.groupId === targetGroupId
  )

  if (remainingTabsInGroup.length === 0) {
    return tabGroups.filter(g => g.id !== targetGroupId)
  }

  return tabGroups
}

const codeState = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actors: {
    explorerState,
    searchState,
    commitState,
    pullRequestState,
    terminalState,
    actionsState,
    promptsState
  },
  actions: {
    spawnFeatureActors: enqueueActions(({ enqueue, context }) => {
      // Only spawn if not already
        enqueue.spawnChild('explorerState', { systemId: 'explorer' });
        enqueue.spawnChild('terminalState', { systemId: 'terminal' });
        enqueue.spawnChild('searchState', { systemId: 'search' });
        enqueue.spawnChild('commitState', { systemId: 'commit' });
        enqueue.spawnChild('pullRequestState', { systemId: 'pr' });
        enqueue.spawnChild('actionsState', { systemId: 'codeActions' });
        enqueue.spawnChild('promptsState', { systemId: 'codePrompts' });
    }),

    notifyDirectoryChange: ({ event, context, system }) => {
      const ev = event as { type: 'UPDATE_STATE'; updates: Partial<Context> }
      if (ev.updates.baseDirectory && ev.updates.baseDirectory !== context.baseDirectory) {
        // Don't send commit.REFRESH_STATUS or pr.REFRESH_STATUS here.
        // The backend handles refresh via notifyChildSystemsOfBaseChange after
        // SET_BASE_DIRECTORY is processed, avoiding a race condition where these
        // frontend-initiated refreshes hit the backend before the directory update.
        system.get('search')?.send({ type: 'search.DIRECTORY_CHANGED', baseDirectory: ev.updates.baseDirectory });
      }
    },
    saveTabsAction: ({ context }) => {
      // Don't save tabs until they've been restored (to avoid overwriting with empty array)
      if (!context.tabsRestored) {
        return
      }
      // Skip noisy per-tab saves while a restoration batch is still in flight,
      // and avoid persisting an incomplete tab list if the app exits mid-restore.
      // The save fires naturally on the LAST restoration arrival because addTab
      // clears pendingTabOrder when the final expected path lands.
      if (context.pendingTabOrder !== undefined) {
        return
      }
      saveOpenTabs(context.openFiles, context.activeFilePath, context.panelTerminalId, context.panelTerminalExpanded)
      saveTabGroups('code-plugin-tab-groups', context.tabGroups)
    },
    addTab: assign(({ event, context }) => {
      const ev = event as { type: 'ADD_TAB'; tab: any; replacePreview?: boolean; extraUpdates?: Partial<Context> }
      const enablePreview = context.settings?.enablePreview ?? true
      let openFiles = [...context.openFiles]

      // If this tab has persisted metadata waiting, this is a restore insertion.
      // Hydrate isPinned/groupId onto the incoming tab BEFORE it lands in openFiles.
      const persistedMetadata = context.pendingPersistedMetadata?.get(ev.tab.path)
      const incomingTab = persistedMetadata
        ? { ...ev.tab, groupId: persistedMetadata.groupId, isPinned: persistedMetadata.isPinned, isPreview: persistedMetadata.isPreview }
        : ev.tab
      const isRestoring = persistedMetadata !== undefined

      // Check if tab already exists
      const existingIndex = openFiles.findIndex((f: any) => f.path === incomingTab.path)

      if (existingIndex >= 0) {
        // Tab exists — update content, KEEP preview state unchanged
        openFiles[existingIndex] = { ...openFiles[existingIndex], ...incomingTab }
      } else {
        // New tab — parent decides preview state based on tab type.
        // Restored tabs must never come back as ephemeral previews.
        const isSpecialTab = incomingTab.isTerminal || incomingTab.isAction || incomingTab.isPrompt
        const shouldPreview = !isRestoring && enablePreview && !isSpecialTab && !ev.replacePreview

        // Remove old preview tab (only one preview at a time)
        if (shouldPreview || ev.replacePreview) {
          openFiles = openFiles.filter((f: any) => !f.isPreview)
        }

        const newTab = shouldPreview ? { ...incomingTab, isPreview: true } : incomingTab
        // During restore, place the tab in its persisted slot. Otherwise keep
        // the pinned-first invariant via sortTabsByPinned.
        openFiles = context.pendingTabOrder
          ? insertByPersistedOrder(openFiles, newTab, context.pendingTabOrder)
          : sortTabsByPinned([...openFiles, newTab])
      }

      // Consume the pending-metadata entry for this tab, if any. Treat the map
      // as immutable — clone before mutating.
      let pendingPersistedMetadata = context.pendingPersistedMetadata
      if (persistedMetadata && pendingPersistedMetadata) {
        const next = new Map(pendingPersistedMetadata)
        next.delete(incomingTab.path)
        pendingPersistedMetadata = next.size > 0 ? next : undefined
      }

      // Clear pendingTabOrder once every persisted path is now present in openFiles.
      let pendingTabOrder = context.pendingTabOrder
      if (pendingTabOrder) {
        const openPaths = new Set(openFiles.map(f => f.path))
        const allPlaced = pendingTabOrder.every(t => openPaths.has(t.path))
        if (allPlaced) pendingTabOrder = undefined
      }

      // During restore, don't bounce activeFilePath as tabs stream in — leave
      // the previously-active tab focused. For user-initiated opens, focus the
      // new tab as before.
      let activeFilePath = isRestoring
        ? context.activeFilePath
        : (ev.extraUpdates?.activeFilePath ?? incomingTab.path)

      // Restore-completion fallback: if the persisted active path's tab failed to
      // restore (file deleted, terminal rejected by backend), repoint to the first
      // open tab so the editor isn't left blank with a phantom selection.
      const justFinishedRestore = pendingTabOrder === undefined && context.pendingTabOrder !== undefined
      if (justFinishedRestore && openFiles.length > 0
          && !openFiles.some(f => f.path === activeFilePath)) {
        activeFilePath = openFiles[0].path
      }

      return {
        ...context,
        ...(ev.extraUpdates || {}),
        openFiles,
        activeFilePath,
        pendingPersistedMetadata,
        pendingTabOrder,
        tabViewHistory: activeFilePath
          ? pushTabViewHistory(context.tabViewHistory, activeFilePath)
          : context.tabViewHistory
      }
    }),
    updateState: assign(({ event, context }) => {
      const ev = event as { type: 'UPDATE_STATE'; updates: Partial<Context> }
      const updates = { ...context, ...ev.updates }

      // Auto-clean history when tabs are removed
      if (ev.updates.openFiles && ev.updates.openFiles.length < context.openFiles.length) {
        const openPaths = new Set(updates.openFiles.map((f: any) => f.path))
        updates.tabViewHistory = (updates.tabViewHistory ?? context.tabViewHistory)
          .filter((p: string) => openPaths.has(p))
      }

      // Auto-push to history when active tab changes
      if (updates.activeFilePath && updates.activeFilePath !== context.activeFilePath) {
        if (!ev.updates.tabViewHistory) {
          updates.tabViewHistory = pushTabViewHistory(
            updates.tabViewHistory ?? context.tabViewHistory,
            updates.activeFilePath
          )
        }
      }

      return updates
    }),
    assignFiles: assign({
      isLoading: false,
      error: null
    }),
    initializePlugin: ({ system }) => {
      // Explorer is initialized via the CODE_CONNECTED broadcast — no re-init needed here.
      system.get('terminal')?.send({ type: 'terminal.REFRESH_LIST' });
    },

    restorePersistedTabs: enqueueActions(({ enqueue }) => {
      const { tabs: persistedTabs, activeFilePath: persistedActive, panelTerminalId: persistedPanelTerminal, panelTerminalExpanded: persistedExpanded } = loadPersistedTabs()
      const persistedGroups = loadTabGroups('code-plugin-tab-groups')

      // Store the desired tab order
      const tabOrder = persistedTabs.map(tab => ({ path: tab.path, order: tab.order }))

      // Create a map of path -> metadata to apply after tabs are created.
      // Populate for ALL persisted tabs so the addTab action can detect restoration
      // and preserve their preview/permanent state.
      const metadataMap = new Map<string, { groupId?: string; isPinned?: boolean; isPreview?: boolean }>()
      persistedTabs.forEach(tab => {
        metadataMap.set(tab.path, {
          groupId: tab.groupId,
          isPinned: tab.isPinned,
          isPreview: tab.isPreview
        })
      })

      // Seed activeFilePath from persistence so addTab's "preserve context.activeFilePath
      // during restore" branch keeps the previously-active tab focused. If the persisted
      // active path no longer matches a tab (corrupt/stale storage, legacy shape),
      // fall back to the first persisted tab so the editor isn't blank on load.
      const persistedPaths = new Set(persistedTabs.map(t => t.path))
      const seededActive = persistedActive && persistedPaths.has(persistedActive)
        ? persistedActive
        : persistedTabs[0]?.path ?? null

      // Mark tabs as restored immediately (even if empty)
      // Collect terminal tab IDs to restore later (when TERMINALS_LISTED arrives from backend)
      const terminalTabIds = persistedTabs.filter(t => t.type === 'terminal').map(t => t.terminalId!)

      enqueue.assign({
        tabsRestored: true,
        pendingTabOrder: tabOrder.length > 0 ? tabOrder : undefined,
        pendingPersistedMetadata: metadataMap.size > 0 ? metadataMap : undefined,
        tabGroups: persistedGroups,
        activeFilePath: seededActive,
        panelTerminalId: persistedPanelTerminal,
        panelTerminalExpanded: persistedExpanded,
        pendingTerminalTabIds: terminalTabIds.length > 0 ? terminalTabIds : undefined
      })

      // If no persisted tabs, we're done
      if (persistedTabs.length === 0) {
        return
      }

      // Restore tabs
      enqueue(({ system }) => {
        const explorerActor = system.get('explorer')
        const actionsActor = system.get('codeActions')
        const promptsActor = system.get('codePrompts')

        // Filter tabs by type
        const fileTabs = persistedTabs.filter(tab => tab.type === 'file')
        const terminalTabs = persistedTabs.filter(tab => tab.type === 'terminal')
        const actionTabs = persistedTabs.filter(tab => tab.type === 'action')
        const promptTabs = persistedTabs.filter(tab => tab.type === 'prompt')

        console.log('[Code Plugin] tabs to restore:', {
          actionTabs,
          fileTabs,
          terminalTabs,
          promptTabs,
        })

        // Send file paths to restore
        if (fileTabs.length > 0 && explorerActor) {
          const filePaths = fileTabs.map(tab => tab.path)
          explorerActor.send({
            type: 'explorer.OPEN_FILES',
            paths: filePaths
          })
        }

        // Terminal tabs are NOT sent here — they're deferred to assignTerminals
        // (when TERMINALS_LISTED arrives) to avoid racing with backend restore.
        // See pendingTerminalTabIds in context.

        // Send action IDs to restore
        if (actionTabs.length > 0 && actionsActor) {
          const actionIds = actionTabs.map(tab => tab.actionId!)
          actionsActor.send({
            type: 'codeActions.OPEN_TABS',
            actionIds
          })
        }

        // Send prompt IDs to restore
        if (promptTabs.length > 0 && promptsActor) {
          const promptIds = promptTabs.map(tab => tab.promptId!)
          promptsActor.send({
            type: 'codePrompts.OPEN_TABS',
            promptIds
          })
        }
      })
    }),
    broadcastToAllFeatures: ({ event, system }) => {
      system.get('explorer')?.send(event);
      system.get('search')?.send(event);
      system.get('commit')?.send(event);
      system.get('pr')?.send(event);
      system.get('terminal')?.send(event);
      system.get('codeActions')?.send(event);
      system.get('codePrompts')?.send(event);
    },

    routeEvent: ({ event, system }) => {
      const eventType = event.type;

      // Route based on prefix - prefix matches system ID
      if (eventType.includes('.')) {
        const [prefix] = eventType.split('.');
        system.get(prefix)?.send(event);
      }
    },

    selectPanel: assign(({
      event,
      context,
      system
    }) => {
      const ev = event as { type: 'SELECT_PANEL'; panel: PanelType };

      // Guard against invalid panel types (e.g. persisted 'terminal' from before removal)
      if (!ALL_PANELS.includes(ev.panel)) {
        return { ...context, selectedPanel: 'explorer' as PanelType };
      }

      // Notify child machines if needed
      if (ev.panel === 'commit') {
        system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' });
      } else if (ev.panel === 'pr') {
        system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' });
      }
      // Actions and prompts are loaded by their respective main plugin actors
      return {
        ...context,
        selectedPanel: ev.panel,
        panelNavHistory: pushNavHistory(context.panelNavHistory, ev.panel),
      };
    }),

    // Quick open actions
    showQuickOpen: assign({
      isQuickOpenVisible: true,
      quickOpenQuery: '',
      quickOpenResults: [],
      quickOpenSelectedIndex: 0,
      quickOpenLoading: true
    }),

    hideQuickOpen: assign({
      isQuickOpenVisible: false,
      quickOpenQuery: '',
      quickOpenResults: [],
      quickOpenSelectedIndex: 0,
      quickOpenLoading: false
    }),

    toggleQuickOpen: assign(({ context }) => ({
      ...context,
      isQuickOpenVisible: !context.isQuickOpenVisible,
      quickOpenQuery: context.isQuickOpenVisible ? '' : context.quickOpenQuery,
      quickOpenResults: context.isQuickOpenVisible ? [] : context.quickOpenResults,
      quickOpenSelectedIndex: 0,
      quickOpenLoading: context.isQuickOpenVisible ? false : true
    })),

    updateQuickOpenQuery: assign(({ event }) => {
      const ev = event as { type: 'UPDATE_QUICK_OPEN_QUERY'; query: string };
      return {
        quickOpenQuery: ev.query,
        quickOpenSelectedIndex: 0
      };
    }),

    selectQuickOpenResult: assign(({ event, context }) => {
      const ev = event as { type: 'SELECT_QUICK_OPEN_RESULT'; index: number };
      const maxIndex = Math.max(0, context.quickOpenResults.length - 1);
      return {
        quickOpenSelectedIndex: Math.max(0, Math.min(ev.index, maxIndex))
      };
    }),

    openQuickOpenResult: ({ context, system, self, event }) => {
      const ev = event as { type: 'OPEN_QUICK_OPEN_RESULT'; path: string };

      // Track the file as recently opened
      const updatedRecentFiles = addRecentFile(context.recentlyOpenedFiles, ev.path);
      self.send({
        type: 'UPDATE_STATE',
        updates: { recentlyOpenedFiles: updatedRecentFiles }
      });

      // Open file through explorer
      system.get('explorer')?.send({
        type: 'explorer.OPEN_FILE',
        path: ev.path
      });
    },

    requestQuickOpenFiles: ({ context, system }) => {
      system.get('explorer')?.send({
        type: 'explorer.QUICK_OPEN_SEARCH',
        baseDirectory: context.baseDirectory
      });
    },

    handleCodeConnected: assign(({ event, context }) => {
      const ev = event as { type: 'CODE_CONNECTED'; data: { baseDirectory: string | null; settings?: CodeSettings } }

      // Extract hotkeys from settings - filter out undefined values
      const hotkeys: HotkeysMap = {};
      if (ev.data.settings?.hotkeys) {
        Object.entries(ev.data.settings.hotkeys).forEach(([key, value]) => {
          if (value) {
            hotkeys[key] = value as KeyboardShortcut;
          }
        });
      }

      // Update directory state from backend
      // Explorer child will receive CODE_CONNECTED via broadcastToAllFeatures and initialize itself
      return {
        ...context,
        baseDirectory: ev.data.baseDirectory || '',
        settings: ev.data.settings,
        hotkeys: Object.keys(hotkeys).length > 0 ? hotkeys : context.hotkeys
      }
    }),

    handleSettingsUpdate: assign(({ event, context }) => {
      const ev = event as { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }

      // Extract hotkeys from settings - filter out undefined values
      const hotkeys: HotkeysMap = {};
      if (ev.settings?.hotkeys) {
        Object.entries(ev.settings.hotkeys).forEach(([key, value]) => {
          if (value) {
            hotkeys[key] = value as KeyboardShortcut;
          }
        });
      }

      return {
        ...context,
        settings: ev.settings,
        hotkeys: Object.keys(hotkeys).length > 0 ? hotkeys : context.hotkeys
      }
    }),

    handleHotkey: createHotkeyProcessor({
      openTerminal: 'OPEN_TERMINAL',
      openTerminalTab: 'OPEN_TERMINAL_TAB',
      navigatePrevPanel: 'NAVIGATE_PREV_PANEL',
      navigateNextPanel: 'NAVIGATE_NEXT_PANEL',
      focusSearch: 'FOCUS_SEARCH',
      quickOpen: 'SHOW_QUICK_OPEN',
      saveFile: 'SAVE_ACTIVE_FILE',
      closeTab: 'CLOSE_ACTIVE_TAB',
    }),

    saveActiveFile: ({ context, system }) => {
      const activeFile = context.openFiles.find(f => f.path === context.activeFilePath)
      if (!activeFile) return

      if (activeFile.isDiff) {
        const file = activeFile as OpenFile
        if (!isEditableDiff(file)) return
        system.get('explorer').send({ type: 'explorer.WRITE_FILE', path: file.gitFile!.path, content: file.content })
        return
      }

      if ('isAction' in activeFile && (activeFile as any).isAction) {
        const actionId = activeFile.path.replace('action:', '')
        system.get('codeActions').send({ type: 'codeActions.SAVE_ACTION', actionId, content: activeFile.content })
      } else if ('isPrompt' in activeFile && (activeFile as any).isPrompt) {
        const promptId = activeFile.path.replace('prompt:', '')
        system.get('codePrompts').send({ type: 'codePrompts.SAVE_PROMPT', promptId, content: activeFile.content })
      } else {
        system.get('explorer').send({ type: 'explorer.WRITE_FILE', path: activeFile.path, content: activeFile.content })
      }
    },
    closeActiveTab: assign(({ context, system }) => {
      if (!context.activeFilePath) return {}
      return closeTabWithConfirmation(context, system, context.activeFilePath)
    }),
    closeTab: assign(({ context, system, event }) => {
      const { path } = event as { type: 'CLOSE_TAB'; path: string }
      return closeTabWithConfirmation(context, system, path)
    }),
    killTerminal: enqueueActions(({ enqueue, context, system, event }) => {
      const { path } = event as { type: 'KILL_TERMINAL'; path: string }
      const file = context.openFiles.find(f => f.path === path)
      if (!file || !('isTerminal' in file)) return
      enqueue(() => {
        system.get('terminal').send({ type: 'terminal.CLOSE', terminalId: (file as any).terminalInfo.id })
      })
      enqueue(assign(() => removeTabLogic(context, system, path)))
    }),
    openTerminal: enqueueActions(({ enqueue, context, system }) => {
      const terminals: TerminalInfo[] = system.get('terminal')?.getSnapshot()?.context?.terminals || []
      const tabbedIds = getTabbedTerminalIds(context.openFiles)

      if (terminals.length === 0) {
        // No terminals — create one (will be routed to panel by child actor)
        enqueue(() => {
          system.get('terminal')?.send({ type: 'terminal.CREATE', cwd: context.baseDirectory })
        })
        enqueue(assign({ panelTerminalExpanded: true }))
        return
      }

      if (!context.panelTerminalId) {
        // Terminals exist but none selected for panel — pick first non-tabbed
        const available = terminals.find(t => !tabbedIds.has(t.id))
        if (available) {
          enqueue(assign({ panelTerminalId: available.id, panelTerminalExpanded: true }))
          return
        }
        // All terminals are in tabs — create a new one
        enqueue(() => {
          system.get('terminal')?.send({ type: 'terminal.CREATE', cwd: context.baseDirectory })
        })
        enqueue(assign({ panelTerminalExpanded: true }))
        return
      }

      // Panel terminal already set — toggle expand/collapse
      enqueue(assign({ panelTerminalExpanded: !context.panelTerminalExpanded }))
    }),

    openTerminalTab: enqueueActions(({ enqueue, context, system }) => {
      enqueue(() => {
        system.get('terminal')?.send({ type: 'terminal.CREATE', cwd: context.baseDirectory, target: 'tab' })
      })
    }),

    selectPanelTerminal: assign(({ event }) => {
      const ev = event as { type: 'SELECT_PANEL_TERMINAL'; terminalId: string };
      return { panelTerminalId: ev.terminalId };
    }),

    closePanelTerminal: enqueueActions(({ enqueue, context, system }) => {
      if (context.panelTerminalId) {
        enqueue(() => {
          system.get('terminal')?.send({
            type: 'terminal.CLOSE',
            terminalId: context.panelTerminalId
          })
        })
      }
      enqueue(assign({ panelTerminalId: null, panelTerminalExpanded: false }))
    }),

    togglePanelTerminal: assign(({ context }) => {
      return { panelTerminalExpanded: !context.panelTerminalExpanded }
    }),

    openTerminalInTab: enqueueActions(({ enqueue, context, event, system }) => {
      const ev = event as { type: 'OPEN_TERMINAL_IN_TAB'; terminalId: string }
      const terminals: TerminalInfo[] = system.get('terminal')?.getSnapshot()?.context?.terminals || []
      const terminalInfo = terminals.find(t => t.id === ev.terminalId)

      if (!terminalInfo) return

      // Open as canvas tab
      enqueue(() => {
        system.get('terminal')?.send({ type: 'terminal.OPEN_TAB', terminalInfo })
      })

      // If this was the panel terminal, auto-select next available
      if (context.panelTerminalId === ev.terminalId) {
        const tabbedIds = new Set(
          context.openFiles.filter((f: any) => f.isTerminal).map((f: any) => f.terminalInfo.id)
        )
        tabbedIds.add(ev.terminalId)
        const next = terminals.find(t => !tabbedIds.has(t.id))
        enqueue(assign({ panelTerminalId: next?.id ?? null }))
      }
    }),

    moveTerminalToPanel: assign(({ context, event }) => {
      const { path } = event as { type: 'MOVE_TERMINAL_TO_PANEL'; path: string }
      const file = context.openFiles.find(f => f.path === path)
      if (!file || !('isTerminal' in file)) return {}
      const terminalId = (file as any).terminalInfo.id
      // Remove tab without killing the process, set as panel terminal
      const newOpenFiles = context.openFiles.filter(f => f.path !== path)
      const newActiveFilePath = context.activeFilePath === path
        ? nextActiveFromHistory(context.tabViewHistory, newOpenFiles)
        : context.activeFilePath
      return {
        openFiles: newOpenFiles,
        activeFilePath: newActiveFilePath,
        panelTerminalId: terminalId,
        panelTerminalExpanded: true
      }
    }),

    navigatePrevPanel: ({ context, self }) => {
      const currentIndex = ALL_PANELS.indexOf(context.selectedPanel);
      const newIndex = currentIndex === 0 ? ALL_PANELS.length - 1 : currentIndex - 1;
      self.send({ type: 'SELECT_PANEL', panel: ALL_PANELS[newIndex] });
    },

    navigateNextPanel: ({ context, self }) => {
      const currentIndex = ALL_PANELS.indexOf(context.selectedPanel);
      const newIndex = currentIndex === ALL_PANELS.length - 1 ? 0 : currentIndex + 1;
      self.send({ type: 'SELECT_PANEL', panel: ALL_PANELS[newIndex] });
    },

    focusSearch: assign(({ context, self }) => {
      const selectedText = _editorSelectionGetter?.() || '';
      self.send({ type: 'SELECT_PANEL', panel: 'search' });
      return {
        ...context,
        searchFocusTrigger: context.searchFocusTrigger + 1,
        searchPrefillText: selectedText,
      };
    }),

    searchInFolder: ({ event, context, self, system }) => {
      const ev = event as { type: 'SEARCH_IN_FOLDER'; folder: string }
      // Compute relative path and set as include pattern glob
      const relativePath = ev.folder.startsWith(context.baseDirectory)
        ? ev.folder.slice(context.baseDirectory.length + 1)
        : ev.folder
      system.get('search')?.send({
        type: 'search.UPDATE_OPTIONS',
        options: { includePattern: `${relativePath}/**` }
      })
      self.send({ type: 'SELECT_PANEL', panel: 'search' })
    },

    promotePreviewTab: assign(({ event, context }) => {
      const ev = event as { type: 'PROMOTE_PREVIEW_TAB'; path: string }
      return {
        ...context,
        openFiles: context.openFiles.map(file =>
          file.path === ev.path ? { ...file, isPreview: false } : file
        )
      }
    }),

    pinTab: assign(({ event, context }) => {
      const ev = event as { type: 'PIN_TAB'; path: string }

      // Get groupId before modifying
      const tab = context.openFiles.find(f => f.path === ev.path)
      const groupId = tab && 'groupId' in tab ? tab.groupId : undefined

      const updatedFiles = context.openFiles.map(file =>
        file.path === ev.path ? { ...file, isPinned: true, groupId: undefined, isPreview: false } : file
      )

      // Delete group if now empty
      const updatedGroups = deleteEmptyGroups(updatedFiles, context.tabGroups, groupId)

      // Sort tabs to put pinned tabs first
      const pinnedTabs = updatedFiles.filter(tab => tab.isPinned)
      const unpinnedTabs = updatedFiles.filter(tab => !tab.isPinned)

      return {
        ...context,
        openFiles: [...pinnedTabs, ...unpinnedTabs],
        tabGroups: updatedGroups
      }
    }),

    unpinTab: assign(({ event, context }) => {
      const ev = event as { type: 'UNPIN_TAB'; path: string }

      // Get groupId before modifying
      const tab = context.openFiles.find(f => f.path === ev.path)
      const groupId = tab && 'groupId' in tab ? tab.groupId : undefined

      const updatedFiles = context.openFiles.map(file =>
        file.path === ev.path ? { ...file, isPinned: false, groupId: undefined } : file
      )

      // Delete group if now empty
      const updatedGroups = deleteEmptyGroups(updatedFiles, context.tabGroups, groupId)

      return {
        ...context,
        openFiles: updatedFiles,
        tabGroups: updatedGroups
      }
    }),

    pinTabAt: assign(({ event, context }) => {
      const ev = event as { type: 'PIN_TAB_AT'; path: string; targetPath: string; side: 'left' | 'right' }
      const tab = context.openFiles.find(f => f.path === ev.path)
      if (!tab) return context
      const groupId = 'groupId' in tab ? tab.groupId : undefined

      const remaining = context.openFiles.filter(f => f.path !== ev.path)
      const movedTab = { ...tab, isPinned: true, groupId: undefined, isPreview: false }

      const targetIndex = remaining.findIndex(f => f.path === ev.targetPath)
      const insertAt = targetIndex === -1
        ? remaining.filter(t => t.isPinned).length
        : ev.side === 'right' ? targetIndex + 1 : targetIndex

      remaining.splice(insertAt, 0, movedTab)

      const tabGroups = deleteEmptyGroups(remaining, context.tabGroups, groupId as string | undefined)
      return { ...context, openFiles: remaining, tabGroups }
    }),

    unpinTabAt: assign(({ event, context }) => {
      const ev = event as { type: 'UNPIN_TAB_AT'; path: string; targetPath: string; side: 'left' | 'right' }
      const tab = context.openFiles.find(f => f.path === ev.path)
      if (!tab) return context
      const groupId = 'groupId' in tab ? tab.groupId : undefined

      const remaining = context.openFiles.filter(f => f.path !== ev.path)
      const movedTab = { ...tab, isPinned: false, groupId: undefined }

      const targetIndex = remaining.findIndex(f => f.path === ev.targetPath)
      const insertAt = targetIndex === -1
        ? remaining.length
        : ev.side === 'right' ? targetIndex + 1 : targetIndex

      remaining.splice(insertAt, 0, movedTab)

      const tabGroups = deleteEmptyGroups(remaining, context.tabGroups, groupId as string | undefined)
      return { ...context, openFiles: remaining, tabGroups }
    }),

    pinGroup: assign(({ event, context }) => {
      const ev = event as { type: 'PIN_GROUP'; groupId: string }
      const updatedGroups = context.tabGroups.map(group =>
        group.id === ev.groupId ? { ...group, isPinned: true } : group
      )
      // Also pin all tabs in this group
      const updatedFiles = context.openFiles.map(file =>
        'groupId' in file && file.groupId === ev.groupId
          ? { ...file, isPinned: true }
          : file
      )
      // Sort tabs to put pinned tabs first
      const pinnedTabs = updatedFiles.filter(tab => tab.isPinned)
      const unpinnedTabs = updatedFiles.filter(tab => !tab.isPinned)
      return {
        ...context,
        tabGroups: updatedGroups,
        openFiles: [...pinnedTabs, ...unpinnedTabs]
      }
    }),

    unpinGroup: assign(({ event, context }) => {
      const ev = event as { type: 'UNPIN_GROUP'; groupId: string }
      const updatedGroups = context.tabGroups.map(group =>
        group.id === ev.groupId ? { ...group, isPinned: false } : group
      )
      // Also unpin all tabs in this group
      const updatedFiles = context.openFiles.map(file =>
        'groupId' in file && file.groupId === ev.groupId
          ? { ...file, isPinned: false }
          : file
      )
      return {
        ...context,
        tabGroups: updatedGroups,
        openFiles: updatedFiles
      }
    }),

    createGroup: assign(({ event, context }) => {
      const ev = event as { type: 'CREATE_GROUP'; name: string; tabPaths?: string[] }

      // Determine if group should be pinned based on tabs being added
      let shouldPinGroup = false
      if (ev.tabPaths && ev.tabPaths.length > 0) {
        const tabsToAdd = context.openFiles.filter(f => ev.tabPaths!.includes(f.path))
        // Group is pinned if any of its tabs are pinned
        shouldPinGroup = tabsToAdd.some(tab => tab.isPinned)
      }

      const color = getNextAvailableColor(context.tabGroups, shouldPinGroup)

      const newGroup: TabGroup = {
        id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: ev.name,
        color,
        isCollapsed: false,
        isPinned: shouldPinGroup,
        order: context.tabGroups.length
      }

      // Update files if tabPaths provided - set isPinned to match group
      const updatedFiles = ev.tabPaths
        ? context.openFiles.map(file =>
            ev.tabPaths!.includes(file.path)
              ? { ...file, groupId: newGroup.id, isPinned: shouldPinGroup, isPreview: false }
              : file
          )
        : context.openFiles

      // Sort tabs to put pinned tabs first (consistent with other actions)
      const pinnedTabs = updatedFiles.filter(tab => tab.isPinned)
      const unpinnedTabs = updatedFiles.filter(tab => !tab.isPinned)

      return {
        ...context,
        tabGroups: [...context.tabGroups, newGroup],
        openFiles: [...pinnedTabs, ...unpinnedTabs]
      }
    }),

    renameGroup: assign(({ event, context }) => {
      const ev = event as { type: 'RENAME_GROUP'; groupId: string; name: string }
      return {
        ...context,
        tabGroups: context.tabGroups.map(group =>
          group.id === ev.groupId ? { ...group, name: ev.name } : group
        )
      }
    }),

    changeGroupColor: assign(({ event, context }) => {
      const ev = event as { type: 'CHANGE_GROUP_COLOR'; groupId: string; color: TabGroupColor }
      return {
        ...context,
        tabGroups: context.tabGroups.map(group =>
          group.id === ev.groupId ? { ...group, color: ev.color } : group
        )
      }
    }),

    deleteGroup: assign(({ event, context }) => {
      const ev = event as { type: 'DELETE_GROUP'; groupId: string; closeTabsInGroup?: boolean }

      // Remove group
      const updatedGroups = context.tabGroups.filter(g => g.id !== ev.groupId)

      // Either close tabs or ungroup them
      const updatedFiles = ev.closeTabsInGroup
        ? context.openFiles.filter(file => !('groupId' in file) || file.groupId !== ev.groupId)
        : context.openFiles.map(file =>
            ('groupId' in file && file.groupId === ev.groupId) ? { ...file, groupId: undefined } : file
          )

      // Clean history and select next active tab if tabs were closed
      const openPaths = new Set(updatedFiles.map(f => f.path))
      const updatedHistory = context.tabViewHistory.filter(p => openPaths.has(p))

      const activeWasRemoved = ev.closeTabsInGroup && context.activeFilePath
        && !openPaths.has(context.activeFilePath)

      const newActiveFilePath = activeWasRemoved
        ? nextActiveFromHistory(updatedHistory, updatedFiles)
        : context.activeFilePath

      return {
        ...context,
        tabGroups: updatedGroups,
        openFiles: updatedFiles,
        activeFilePath: newActiveFilePath,
        tabViewHistory: updatedHistory
      }
    }),

    toggleGroupCollapse: assign(({ event, context }) => {
      const ev = event as { type: 'TOGGLE_GROUP_COLLAPSE'; groupId: string }
      return {
        ...context,
        tabGroups: context.tabGroups.map(group =>
          group.id === ev.groupId ? { ...group, isCollapsed: !group.isCollapsed } : group
        )
      }
    }),

    addTabToGroup: assign(({ event, context }) => {
      const ev = event as { type: 'ADD_TAB_TO_GROUP'; path: string; groupId: string }

      // Find the target group to check if it's pinned
      const targetGroup = context.tabGroups.find(g => g.id === ev.groupId)
      const shouldPin = targetGroup?.isPinned || false

      // Set tab's isPinned to match the group's pinned status
      const updatedFiles = context.openFiles.map(file =>
        file.path === ev.path
          ? { ...file, groupId: ev.groupId, isPinned: shouldPin, isPreview: false }
          : file
      )

      // Sort tabs to put pinned tabs first (consistent with pinGroup/unpinGroup)
      const pinnedTabs = updatedFiles.filter(tab => tab.isPinned)
      const unpinnedTabs = updatedFiles.filter(tab => !tab.isPinned)

      return {
        ...context,
        openFiles: [...pinnedTabs, ...unpinnedTabs]
      }
    }),

    removeTabFromGroup: assign(({ event, context }) => {
      const ev = event as { type: 'REMOVE_TAB_FROM_GROUP'; path: string }

      // Find the group this tab belongs to
      const tab = context.openFiles.find(f => f.path === ev.path)
      const groupId = tab && 'groupId' in tab ? tab.groupId : undefined

      // Remove tab from group
      const updatedFiles = context.openFiles.map(file =>
        file.path === ev.path ? { ...file, groupId: undefined } : file
      )

      // Delete group if now empty
      const updatedGroups = deleteEmptyGroups(updatedFiles, context.tabGroups, groupId)

      return {
        ...context,
        openFiles: updatedFiles,
        tabGroups: updatedGroups
      }
    }),

    reorderGroups: assign(({ event, context }) => {
      const ev = event as { type: 'REORDER_GROUPS'; fromIndex: number; toIndex: number }
      const groups = [...context.tabGroups]
      const [movedGroup] = groups.splice(ev.fromIndex, 1)
      groups.splice(ev.toIndex, 0, movedGroup)

      // Update order values
      const reorderedGroups = groups.map((group, index) => ({
        ...group,
        order: index
      }))

      return {
        ...context,
        tabGroups: reorderedGroups
      }
    }),
  }
}).createMachine({
  id,
  initial: 'canvas',
  entry: ['spawnFeatureActors', 'restorePersistedTabs'],
  context: {
    baseDirectory: '', // Will be loaded from backend EARS store
    openFiles: [], // Don't load tabs here - wait for PLUGIN_ACTIVATED
    activeFilePath: null,
    isLoading: false,
    error: null,
    selectedPanel: 'explorer' as PanelType,
    // Tab groups state
    tabGroups: [],
    // Quick open state
    isQuickOpenVisible: false,
    quickOpenQuery: '',
    quickOpenResults: [],
    quickOpenSelectedIndex: 0,
    quickOpenLoading: false,
    recentlyOpenedFiles: loadRecentFiles(),
    tabViewHistory: [],
    // Default hotkeys for code plugin (will be overridden by settings)
    hotkeys: {},
    pendingRevealLine: null,
    searchFocusTrigger: 0,
    searchPrefillText: '',
    panelTerminalId: null,
    panelTerminalExpanded: false,
    panelNavHistory: createNavHistory('explorer' as PanelType),
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Code', true),
      on: {
        // Broadcast CODE_CONNECTED to all features
        CODE_CONNECTED: {
          actions: ['handleCodeConnected', 'broadcastToAllFeatures']
        },
        // Handle settings updates
        CODE_SETTINGS_UPDATED: {
          actions: ['handleSettingsUpdate']
        },
        // Route events to child machines
        '*': {
          actions: ['routeEvent']
        },
        // Simple state update from child machines
        UPDATE_STATE: {
          actions: ['notifyDirectoryChange', 'updateState', 'saveTabsAction']
        },
        // Add a new tab (race-free: always uses current parent state)
        ADD_TAB: {
          actions: ['addTab', 'saveTabsAction']
        },
        // Plugin initialization
        PLUGIN_ACTIVATED: {
          actions: ['initializePlugin']
        },
        // Panel selection
        SELECT_PANEL: {
          actions: ['selectPanel']
        },
        NAVIGATE_BACK: {
          guard: ({ context }) => canGoBack(context.panelNavHistory),
          actions: assign(({ context, system }) => {
            const result = goBack(context.panelNavHistory)!;
            if (result.entry === 'commit') system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' });
            else if (result.entry === 'pr') system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' });
            return { panelNavHistory: result.history, selectedPanel: result.entry };
          }),
        },
        NAVIGATE_FORWARD: {
          guard: ({ context }) => canGoForward(context.panelNavHistory),
          actions: assign(({ context, system }) => {
            const result = goForward(context.panelNavHistory)!;
            if (result.entry === 'commit') system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' });
            else if (result.entry === 'pr') system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' });
            return { panelNavHistory: result.history, selectedPanel: result.entry };
          }),
        },
        // Tab pinning
        PIN_TAB: {
          actions: ['pinTab', 'saveTabsAction']
        },
        UNPIN_TAB: {
          actions: ['unpinTab', 'saveTabsAction']
        },
        PIN_TAB_AT: {
          actions: ['pinTabAt', 'saveTabsAction']
        },
        UNPIN_TAB_AT: {
          actions: ['unpinTabAt', 'saveTabsAction']
        },
        // Tab groups
        CREATE_GROUP: {
          actions: ['createGroup', 'saveTabsAction']
        },
        RENAME_GROUP: {
          actions: ['renameGroup', 'saveTabsAction']
        },
        CHANGE_GROUP_COLOR: {
          actions: ['changeGroupColor', 'saveTabsAction']
        },
        DELETE_GROUP: {
          actions: ['deleteGroup', 'saveTabsAction']
        },
        TOGGLE_GROUP_COLLAPSE: {
          actions: ['toggleGroupCollapse', 'saveTabsAction']
        },
        ADD_TAB_TO_GROUP: {
          actions: ['addTabToGroup', 'saveTabsAction']
        },
        REMOVE_TAB_FROM_GROUP: {
          actions: ['removeTabFromGroup', 'saveTabsAction']
        },
        REORDER_GROUPS: {
          actions: ['reorderGroups', 'saveTabsAction']
        },
        PIN_GROUP: {
          actions: ['pinGroup', 'saveTabsAction']
        },
        UNPIN_GROUP: {
          actions: ['unpinGroup', 'saveTabsAction']
        },
        // Hotkey handling
        HOTKEY_PRESSED: {
          actions: ['handleHotkey']
        },
        OPEN_TERMINAL: {
          actions: 'openTerminal'
        },
        OPEN_TERMINAL_TAB: {
          actions: ['openTerminalTab', 'saveTabsAction']
        },
        SELECT_PANEL_TERMINAL: {
          actions: ['selectPanelTerminal', 'saveTabsAction']
        },
        CLOSE_PANEL_TERMINAL: {
          actions: ['closePanelTerminal', 'saveTabsAction']
        },
        OPEN_TERMINAL_IN_TAB: {
          actions: ['openTerminalInTab', 'saveTabsAction']
        },
        MOVE_TERMINAL_TO_PANEL: {
          actions: ['moveTerminalToPanel', 'saveTabsAction']
        },
        TOGGLE_PANEL_TERMINAL: {
          actions: ['togglePanelTerminal', 'saveTabsAction']
        },
        NAVIGATE_PREV_PANEL: {
          actions: 'navigatePrevPanel'
        },
        NAVIGATE_NEXT_PANEL: {
          actions: 'navigateNextPanel'
        },
        FOCUS_SEARCH: {
          actions: 'focusSearch'
        },
        SEARCH_IN_FOLDER: {
          actions: 'searchInFolder'
        },
        // Quick open events
        TOGGLE_QUICK_OPEN: {
          actions: ['toggleQuickOpen', 'requestQuickOpenFiles']
        },
        SHOW_QUICK_OPEN: {
          actions: ['showQuickOpen', 'requestQuickOpenFiles']
        },
        HIDE_QUICK_OPEN: {
          actions: ['hideQuickOpen']
        },
        UPDATE_QUICK_OPEN_QUERY: {
          actions: ['updateQuickOpenQuery']
        },
        SELECT_QUICK_OPEN_RESULT: {
          actions: ['selectQuickOpenResult']
        },
        OPEN_QUICK_OPEN_RESULT: {
          actions: ['openQuickOpenResult', 'hideQuickOpen']
        },
        // File actions (hotkeys + UI)
        SAVE_ACTIVE_FILE: {
          actions: 'saveActiveFile'
        },
        CLOSE_ACTIVE_TAB: {
          actions: ['closeActiveTab', 'saveTabsAction']
        },
        CLOSE_TAB: {
          actions: ['closeTab', 'saveTabsAction']
        },
        KILL_TERMINAL: {
          actions: ['killTerminal', 'saveTabsAction']
        },
        PROMOTE_PREVIEW_TAB: {
          actions: ['promotePreviewTab', 'saveTabsAction']
        }
      }
    }
  }
});

export default codeState;

// Type definitions for parent-child communication
export interface StateUpdate {
  type: 'UPDATE_STATE'
  updates: Partial<Context>
}
