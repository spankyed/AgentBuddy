import type { ThreadTabGroup } from './types'

const STORAGE_KEY = 'threads-tab-groups'

export function saveThreadTabGroups(groups: ThreadTabGroup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  } catch (error) {
    console.error('Failed to save thread tab groups:', error)
  }
}

export function loadThreadTabGroups(): ThreadTabGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
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
