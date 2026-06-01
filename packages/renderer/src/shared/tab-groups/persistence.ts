import type { TabGroup } from './types';

export function saveTabGroups(key: string, groups: TabGroup[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(groups));
  } catch (error) {
    console.error('Failed to save tab groups:', error);
  }
}

export function loadTabGroups(key: string): TabGroup[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const groups = JSON.parse(stored);
    if (!Array.isArray(groups)) return [];

    return groups.filter((group): group is TabGroup => {
      return (
        typeof group === 'object' &&
        group !== null &&
        typeof group.id === 'string' &&
        typeof group.name === 'string' &&
        typeof group.color === 'string' &&
        typeof group.isCollapsed === 'boolean' &&
        typeof group.order === 'number'
      );
    });
  } catch (error) {
    console.error('Failed to load tab groups:', error);
    return [];
  }
}

export function clearTabGroups(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear tab groups:', error);
  }
}
