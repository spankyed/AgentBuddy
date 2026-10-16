import { usePluginState } from '#generated/fe.ts'
import { threadsFromStore } from './state.ts'
import type { ReferenceItem } from '@apackdev/sdk/fe/references'

export const useItems = () => usePluginState('threads', (state): ReferenceItem[] => {
  const threadMap = state.threadMap
  const threadIds = state.threadIds
  const sorted = threadsFromStore(threadMap, threadIds)
  return (sorted || []).map((t: any) => ({
    id: t.id,
    shortCode: t.shortCode || t.id,
    label: t.topic || t.shortCode || t.id,
    type: 'thread' as const,
  }))
})
