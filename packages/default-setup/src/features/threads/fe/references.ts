import { History } from 'lucide-vue-next'

import { navigateToPlugin, usePluginState } from '@/__generated__/fe'
import { id as threads, threadsFromStore } from './state'
import type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider, ReferenceItem } from '@abuddy/sdk/fe/references'

export const referenceTypes: Record<string, ReferenceTypeConfig> = {
  thread: {
    protocol: 'thread',
    category: 'threads',
    plugin: threads,
    icon: History,
    svgElements: [
      ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
      ['path', { d: 'M3 3v5h5' }],
      ['path', { d: 'M12 7v5l4 2' }],
    ],
    navigate: (refId: string) => {
      navigateToPlugin(threads, { type: 'SELECT_THREAD', id: refId })
    },
  },
}

export const categories: CategoryConfig[] = [
  { id: 'threads', label: 'Threads', primaryIcon: History },
]

export const itemsProvider: CategoryItemsProvider = {
  category: 'threads',
  // The plugin's state, as it changes
  useItems: () => usePluginState('threads', (state): ReferenceItem[] => {
    const threadMap = state.threadMap
    const threadIds = state.threadIds
    const sorted = threadsFromStore(threadMap, threadIds)
    return (sorted || []).map((t: any) => ({
      id: t.id,
      shortCode: t.shortCode || t.id,
      label: t.topic || t.shortCode || t.id,
      type: 'thread' as const,
    }))
  }),
}
