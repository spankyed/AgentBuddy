import { surfaceStorage } from '@apackdev/sdk/fe'
import { ref as featureRef } from '#generated/ref.ts'

/** This surface's window storage: the prefix is its ref, so these names are scoped to it. */
const storage = surfaceStorage(featureRef('threads'))
import type { ThreadTabGroup } from './types.ts'


export function saveThreadTabGroups(groups: ThreadTabGroup[]): void {
  try {
    storage.set('tab-groups', JSON.stringify(groups))
  } catch (error) {
    console.error('Failed to save thread tab groups:', error)
  }
}

export function loadThreadTabGroups(): ThreadTabGroup[] {
  try {
    const stored = storage.get('tab-groups')
    if (!stored) return []

    const groups = JSON.parse(stored)
    if (!Array.isArray(groups)) return []

    return groups.filter((group): group is ThreadTabGroup => {
      return (
        typeof group === 'object' &&
        group !== null &&
        typeof group.id === 'string' &&
        typeof group.name === 'string' &&
        typeof group.color === 'string' &&
        typeof group.isCollapsed === 'boolean' &&
        typeof group.order === 'number'
      )
    })
  } catch (error) {
    console.error('Failed to load thread tab groups:', error)
    return []
  }
}
