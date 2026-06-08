import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadPersistedTabs,
  prunePersistedTabsToOpenPaths,
  saveOpenTabs,
  type PersistedTabState,
} from './persisted-tabs'
import { terminalEventBus } from './terminal-events'

describe('code persisted tabs', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes invalid and duplicate persisted tabs on load', () => {
    localStorage.setItem('code-plugin-open-tabs', JSON.stringify({
      tabs: [
        { path: '/tmp/a.ts', type: 'file', order: 5 },
        { path: '/tmp/a.ts', type: 'file', order: 6 },
        { path: 123, type: 'file', order: 7 },
        { path: 'terminal:missing-id', type: 'terminal', order: 8 },
      ],
      activeFilePath: '/tmp/a.ts',
      panelTerminalId: null,
      panelTerminalExpanded: false,
    }))

    const loaded = loadPersistedTabs()

    expect(loaded.tabs).toEqual([
      { path: '/tmp/a.ts', type: 'file', order: 5 },
    ])
  })

  it('prunes persisted tabs to actual open paths', () => {
    const state: PersistedTabState = {
      tabs: [
        { path: '/tmp/a.ts', type: 'file', order: 0 },
        { path: '/tmp/stale.ts', type: 'file', order: 1, groupId: 'old-group' },
      ],
      activeFilePath: '/tmp/stale.ts',
      panelTerminalId: null,
      panelTerminalExpanded: false,
    }

    const repaired = prunePersistedTabsToOpenPaths(state, new Set(['/tmp/a.ts']))

    expect(repaired.tabs).toEqual([
      { path: '/tmp/a.ts', type: 'file', order: 0 },
    ])
    expect(repaired.activeFilePath).toBe('/tmp/a.ts')
  })

  it('persists an empty tab list when all tabs are closed', () => {
    saveOpenTabs([], null)

    expect(JSON.parse(localStorage.getItem('code-plugin-open-tabs')!)).toEqual({
      tabs: [],
      activeFilePath: null,
      panelTerminalId: null,
      panelTerminalExpanded: false,
    })
  })

  it('prunes stale terminal output cache entries', () => {
    localStorage.setItem('agentbuddy_terminal_output_Terminal-live', 'live')
    localStorage.setItem('agentbuddy_terminal_output_Terminal-stale', 'stale')

    terminalEventBus.prunePersistedOutputs(['Terminal-live'])

    expect(localStorage.getItem('agentbuddy_terminal_output_Terminal-live')).toBe('live')
    expect(localStorage.getItem('agentbuddy_terminal_output_Terminal-stale')).toBeNull()
  })
})
