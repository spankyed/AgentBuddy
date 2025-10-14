import type { TabGroup } from '../state'

const STORAGE_KEY = 'code-plugin-tab-groups'

export function saveTabGroups(groups: TabGroup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  } catch (error) {
    console.error('Failed to save tab groups:', error)
  }
}

export function loadTabGroups(): TabGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const groups = JSON.parse(stored)
    if (!Array.isArray(groups)) return []

    // Validate each group
    return groups.filter((group): group is TabGroup => {
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
    console.error('Failed to load tab groups:', error)
    return []
  }
}

export function clearTabGroups(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear tab groups:', error)
  }
}
