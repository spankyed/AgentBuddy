import type { OpenFile, TerminalTab } from '../state'
import type { ActionTab } from '../features/actions/state'
import type { PromptTab } from '../features/prompts/state'

// Simplified interface for persisted tabs
interface PersistedTab {
  path: string
  type: 'file' | 'terminal' | 'action' | 'prompt'
  terminalId?: string
  actionId?: string
  promptId?: string
  order: number // Track original position
  isPinned?: boolean // Track pinned state
  groupId?: string // Track group membership
  isPreview?: boolean // Track preview state
}

const STORAGE_KEY = 'code-plugin-open-tabs'

interface PersistedTabState {
  tabs: PersistedTab[]
  activeFilePath: string | null
}

export function saveOpenTabs(
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[],
  activeFilePath: string | null
): void {
  try {
    const tabs: PersistedTab[] = openFiles
      .filter(tab => {
        // Skip diff tabs since we can't restore them
        if ('isDiff' in tab && tab.isDiff) return false
        return true
      })
      .map((tab, index) => {
        const isPreview = 'isPreview' in tab ? tab.isPreview : undefined
        if ('isTerminal' in tab && tab.isTerminal) {
          return {
            path: tab.path,
            type: 'terminal' as const,
            terminalId: tab.terminalInfo.id,
            order: index,
            isPinned: tab.isPinned,
            groupId: tab.groupId,
            isPreview
          }
        }
        if ('isAction' in tab && tab.isAction) {
          return {
            path: tab.path,
            type: 'action' as const,
            actionId: tab.path.replace('action:', ''),
            order: index,
            isPinned: tab.isPinned,
            groupId: tab.groupId,
            isPreview
          }
        }
        if ('isPrompt' in tab && tab.isPrompt) {
          return {
            path: tab.path,
            type: 'prompt' as const,
            promptId: tab.path.replace('prompt:', ''),
            order: index,
            isPinned: tab.isPinned,
            groupId: tab.groupId,
            isPreview
          }
        }
        return {
          path: tab.path,
          type: 'file' as const,
          order: index,
          isPinned: tab.isPinned,
          groupId: tab.groupId,
          isPreview
        }
      })

    const payload: PersistedTabState = { tabs, activeFilePath }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.error('Failed to save open tabs:', error)
  }
}

function isPersistedTab(tab: unknown): tab is PersistedTab {
  if (typeof tab !== 'object' || tab === null) return false
  const t = tab as PersistedTab
  if (typeof t.path !== 'string') return false
  if (t.type === 'file') return true
  if (t.type === 'terminal') return typeof t.terminalId === 'string'
  if (t.type === 'action') return typeof t.actionId === 'string'
  if (t.type === 'prompt') return typeof t.promptId === 'string'
  return false
}

function normalizeTabs(rawTabs: unknown[]): PersistedTab[] {
  return rawTabs.filter(isPersistedTab).map((tab, index) => ({
    ...tab,
    order: typeof tab.order === 'number' ? tab.order : index // backfill order if missing
  }))
}

export function loadPersistedTabs(): PersistedTabState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { tabs: [], activeFilePath: null }

    const parsed = JSON.parse(stored)

    // Legacy shape: top-level array of tabs (no persisted active path).
    if (Array.isArray(parsed)) {
      return { tabs: normalizeTabs(parsed), activeFilePath: null }
    }

    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.tabs)) {
      return { tabs: [], activeFilePath: null }
    }

    return {
      tabs: normalizeTabs(parsed.tabs),
      activeFilePath: typeof parsed.activeFilePath === 'string' ? parsed.activeFilePath : null
    }
  } catch (error) {
    console.error('Failed to load persisted tabs:', error)
    return { tabs: [], activeFilePath: null }
  }
}

export function clearPersistedTabs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear persisted tabs:', error)
  }
}

// Sort tabs to put pinned tabs first, maintaining relative order within each group
export function sortTabsByPinned<T extends { isPinned?: boolean }>(tabs: T[]): T[] {
  const pinnedTabs = tabs.filter(tab => tab.isPinned)
  const unpinnedTabs = tabs.filter(tab => !tab.isPinned)
  return [...pinnedTabs, ...unpinnedTabs]
}