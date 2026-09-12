export type TabGroupColor = 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'gray';

export const ALL_COLORS: TabGroupColor[] = ['blue', 'orange', 'purple', 'green', 'red', 'teal', 'yellow', 'pink', 'gray'];

export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  isCollapsed: boolean;
  order: number;
  isPinned?: boolean;
}

export function getNextAvailableColor(tabGroups: TabGroup[], isPinned = false): TabGroupColor {
  const sameRowGroups = tabGroups.filter(g => (g.isPinned || false) === isPinned);
  const lastColor = sameRowGroups[sameRowGroups.length - 1]?.color;
  const nextIndex = tabGroups.length % ALL_COLORS.length;
  return ALL_COLORS[nextIndex] === lastColor
    ? ALL_COLORS[(nextIndex + 1) % ALL_COLORS.length]
    : ALL_COLORS[nextIndex];
}

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
