import { setup, type ActorRefFrom, assign, enqueueActions } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { trpc } from '@/core/trpc';
import { type HotkeyEvent, type HotkeysMap, createHotkeyProcessor } from '@/core/utils/hotkeys';
import { saveOpenTabs, loadPersistedTabs } from './utils/persisted-tabs';
import { loadRecentFiles, addRecentFile } from './utils/recent-files';
import { saveTabGroups, loadTabGroups } from './utils/tab-groups';
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

const ALL_PANELS: PanelType[] = ['explorer', 'terminal', 'search', 'commit', 'pr', 'actions', 'prompts'];

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
  isPinned?: boolean
  groupId?: string
}

export type TabGroupColor = 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'gray'

const ALL_COLORS: TabGroupColor[] = ['blue', 'orange', 'purple', 'green', 'red', 'teal', 'yellow', 'pink', 'gray']

function getNextAvailableColor(tabGroups: TabGroup[], isPinned: boolean): TabGroupColor {
  const sameRowGroups = tabGroups.filter(g => (g.isPinned || false) === isPinned)
  const lastColor = sameRowGroups[sameRowGroups.length - 1]?.color
  const nextIndex = tabGroups.length % ALL_COLORS.length
  return ALL_COLORS[nextIndex] === lastColor
    ? ALL_COLORS[(nextIndex + 1) % ALL_COLORS.length]
    : ALL_COLORS[nextIndex]
}

export interface TabGroup {
  id: string
  name: string
  color: TabGroupColor
  isCollapsed: boolean
  order: number
  isPinned?: boolean
}

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
  pendingPersistedMetadata?: Map<string, { groupId?: string; isPinned?: boolean }>  // Track metadata to apply after restoration
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
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'SELECT_PANEL'; panel: PanelType }
  // Tab pinning events
  | { type: 'PIN_TAB'; path: string }
  | { type: 'UNPIN_TAB'; path: string }
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
  | { type: 'NAVIGATE_PREV_PANEL' }
  | { type: 'NAVIGATE_NEXT_PANEL' }
  | { type: 'FOCUS_SEARCH' }
  // Quick open events
  | { type: 'TOGGLE_QUICK_OPEN' }
  | { type: 'SHOW_QUICK_OPEN' }
  | { type: 'HIDE_QUICK_OPEN' }
  | { type: 'UPDATE_QUICK_OPEN_QUERY'; query: string }
  | { type: 'SELECT_QUICK_OPEN_RESULT'; index: number }
  | { type: 'OPEN_QUICK_OPEN_RESULT'; path: string }
  | { type: 'SEARCH_IN_FOLDER'; folder: string };

export type CodeState = ActorRefFrom<typeof codeState>;

type PanelType = 'explorer' | 'search' | 'commit' | 'pr' | 'terminal' | 'actions' | 'prompts';

// Directory will be loaded from backend EARS store

// Helper function to reorder tabs based on stored order
function reorderTabsByStoredOrder(
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[],
  pendingOrder: Array<{ path: string; order: number }>
): (OpenFile | TerminalTab | ActionTab | PromptTab)[] | null {
  // Check if all pending tabs have been loaded
  const pendingPaths = pendingOrder.map(t => t.path)
  const loadedPaths = openFiles.map(f => f.path)
  const allTabsLoaded = pendingPaths.every(path => loadedPaths.includes(path))

  if (!allTabsLoaded) {
    // Not all tabs loaded yet, wait
    return null
  }

  // Create a map of path to order
  const orderMap = new Map(pendingOrder.map(t => [t.path, t.order]))

  // Sort tabs by their original order
  const sorted = [...openFiles].sort((a, b) => {
    const orderA = orderMap.get(a.path) ?? Number.MAX_SAFE_INTEGER
    const orderB = orderMap.get(b.path) ?? Number.MAX_SAFE_INTEGER
    return orderA - orderB
  })

  return sorted
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
        system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' });
        system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' });
        system.get('search')?.send({ type: 'search.DIRECTORY_CHANGED', baseDirectory: ev.updates.baseDirectory });
      }
    },
    saveTabsAction: ({ context }) => {
      // Don't save tabs until they've been restored (to avoid overwriting with empty array)
      if (!context.tabsRestored) {
        return
      }
      saveOpenTabs(context.openFiles)
      saveTabGroups(context.tabGroups)
    },
    updateState: assign(({ event, context, system }) => {
      const ev = event as { type: 'UPDATE_STATE'; updates: Partial<Context> }
      const updates = { ...context, ...ev.updates }

      // Apply persisted metadata (groupId, isPinned) to newly created tabs
      if (context.pendingPersistedMetadata && ev.updates.openFiles && ev.updates.openFiles.length > 0) {
        const patchedFiles = ev.updates.openFiles.map(file => {
          const metadata = context.pendingPersistedMetadata!.get(file.path)
          if (metadata) {
            return {
              ...file,
              groupId: metadata.groupId,
              isPinned: metadata.isPinned
            }
          }
          return file
        })

        // Check if we've applied all pending metadata
        const appliedCount = patchedFiles.filter(f =>
          context.pendingPersistedMetadata!.has(f.path)
        ).length

        updates.openFiles = patchedFiles

        // Clear pending metadata if all tabs have been restored
        if (appliedCount === context.pendingPersistedMetadata!.size) {
          updates.pendingPersistedMetadata = undefined
        }
      }

      // Check if we need to reorder tabs based on pending order
      if (context.pendingTabOrder && updates.openFiles && updates.openFiles.length > 0) {
        const reorderedFiles = reorderTabsByStoredOrder(updates.openFiles, context.pendingTabOrder)
        if (reorderedFiles) {
          updates.openFiles = reorderedFiles
          updates.pendingTabOrder = undefined // Clear pending order after applying
        }
      }

      return updates
    }),
    assignFiles: assign({
      isLoading: false,
      error: null
    }),
    initializePlugin: ({ context, system }) => {
      // Always initialize all child machines
      system.get('explorer')?.send({ type: 'explorer.INITIALIZE', baseDirectory: context.baseDirectory });
      system.get('terminal')?.send({ type: 'terminal.REFRESH_LIST' });
      // Actions and prompts are loaded by their respective main plugin actors
    },

    restorePersistedTabs: enqueueActions(({ enqueue }) => {
      const persistedTabs = loadPersistedTabs()
      const persistedGroups = loadTabGroups()
      // console.log('[Code Plugin] Restoring persisted tabs:', persistedTabs)

      // Store the desired tab order
      const tabOrder = persistedTabs.map(tab => ({ path: tab.path, order: tab.order }))

      // Create a map of path -> metadata (groupId, isPinned) to apply after tabs are created
      const metadataMap = new Map<string, { groupId?: string; isPinned?: boolean }>()
      persistedTabs.forEach(tab => {
        if (tab.groupId || tab.isPinned) {
          metadataMap.set(tab.path, {
            groupId: tab.groupId,
            isPinned: tab.isPinned
          })
        }
      })

      // Mark tabs as restored immediately (even if empty)
      enqueue.assign({
        tabsRestored: true,
        pendingTabOrder: tabOrder.length > 0 ? tabOrder : undefined,
        pendingPersistedMetadata: metadataMap.size > 0 ? metadataMap : undefined,
        tabGroups: persistedGroups
      })

      // If no persisted tabs, we're done
      if (persistedTabs.length === 0) {
        return
      }

      // Restore tabs
      enqueue(({ system }) => {
        const explorerActor = system.get('explorer')
        const terminalActor = system.get('terminal')
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

        // Send terminal IDs to restore
        if (terminalTabs.length > 0 && terminalActor) {
          const terminalIds = terminalTabs.map(tab => tab.terminalId!)
          terminalActor.send({
            type: 'terminal.OPEN_TABS',
            terminalIds
          })
        }

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

      // Notify child machines if needed
      if (ev.panel === 'commit') {
        system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' });
      } else if (ev.panel === 'pr') {
        system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' });
      } else if (ev.panel === 'terminal') {
        system.get('terminal')?.send({ type: 'terminal.REFRESH_LIST' });
      }
      // Actions and prompts are loaded by their respective main plugin actors
      return {
        ...context,
        selectedPanel: ev.panel
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
      navigatePrevPanel: 'NAVIGATE_PREV_PANEL',
      navigateNextPanel: 'NAVIGATE_NEXT_PANEL',
      focusSearch: 'FOCUS_SEARCH',
    }),

    openTerminal: ({ context, self, system }) => {
      // Look for an existing terminal at the active directory
      // const existingTerminal = context.openFiles.find((file): file is TerminalTab => {
      //   return 'isTerminal' in file &&
      //     file.isTerminal === true &&
      //     file.terminalInfo.cwd === context.activeDirectory;
      // });
      // if (existingTerminal) {
      //   // Activate the existing terminal tab
      //   self.send({
      //     type: 'UPDATE_STATE',
      //     updates: { activeFilePath: existingTerminal.path }
      //   });
      // } else {
        // Create a new terminal at the base directory
        // Title will be auto-generated from cwd by backend
        system.get('terminal')?.send({
            type: 'terminal.CREATE',
            cwd: context.baseDirectory
          });
      // }
    },

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

    focusSearch: ({ self }) => {
      self.send({ type: 'SELECT_PANEL', panel: 'search' });
    },

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

    pinTab: assign(({ event, context }) => {
      const ev = event as { type: 'PIN_TAB'; path: string }

      // Get groupId before modifying
      const tab = context.openFiles.find(f => f.path === ev.path)
      const groupId = tab && 'groupId' in tab ? tab.groupId : undefined

      const updatedFiles = context.openFiles.map(file =>
        file.path === ev.path ? { ...file, isPinned: true, groupId: undefined } : file
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
              ? { ...file, groupId: newGroup.id, isPinned: shouldPinGroup }
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

      // Update active file if it was closed
      const newActiveFilePath = ev.closeTabsInGroup && context.activeFilePath
        ? (updatedFiles.some(f => f.path === context.activeFilePath)
            ? context.activeFilePath
            : (updatedFiles.length > 0 ? updatedFiles[0].path : null))
        : context.activeFilePath

      return {
        ...context,
        tabGroups: updatedGroups,
        openFiles: updatedFiles,
        activeFilePath: newActiveFilePath
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
          ? { ...file, groupId: ev.groupId, isPinned: shouldPin }
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
        // Plugin initialization
        PLUGIN_ACTIVATED: {
          actions: ['initializePlugin']
        },
        // Panel selection
        SELECT_PANEL: {
          actions: ['selectPanel']
        },
        // Tab pinning
        PIN_TAB: {
          actions: ['pinTab', 'saveTabsAction']
        },
        UNPIN_TAB: {
          actions: ['unpinTab', 'saveTabsAction']
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
