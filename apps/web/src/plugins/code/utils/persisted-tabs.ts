import type { OpenFile, TerminalTab } from '../state'

// Simplified interface for persisted tabs
interface PersistedTab {
  path: string
  type: 'file' | 'terminal'
  terminalId?: string
}

const STORAGE_KEY = 'code-plugin-open-tabs'

export function saveOpenTabs(openFiles: (OpenFile | TerminalTab)[]): void {
  try {
    const tabs: PersistedTab[] = openFiles
      .filter(tab => {
        // Skip diff tabs since we can't restore them
        if ('isDiff' in tab && tab.isDiff) return false
        return true
      })
      .map(tab => {
        if ('isTerminal' in tab && tab.isTerminal) {
          return {
            path: tab.path,
            type: 'terminal' as const,
            terminalId: tab.terminalInfo.id
          }
        }
        return {
          path: tab.path,
          type: 'file' as const
        }
      })
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  } catch (error) {
    console.error('Failed to save open tabs:', error)
  }
}

export function loadPersistedTabs(): PersistedTab[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const tabs = JSON.parse(stored)
    if (!Array.isArray(tabs)) return []
    
    // Validate each tab
    return tabs.filter((tab): tab is PersistedTab => {
      return (
        typeof tab === 'object' &&
        tab !== null &&
        typeof tab.path === 'string' &&
        (tab.type === 'file' || tab.type === 'terminal') &&
        (tab.type === 'file' || typeof tab.terminalId === 'string')
      )
    })
  } catch (error) {
    console.error('Failed to load persisted tabs:', error)
    return []
  }
}

export function clearPersistedTabs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear persisted tabs:', error)
  }
}