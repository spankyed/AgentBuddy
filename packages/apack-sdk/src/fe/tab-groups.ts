/**
 * The colours a tab group may take, and the type of one.
 *
 * The list is the declaration and the union is derived from it. Written side by side they drifted into different
 * orders, and nothing would have caught a colour in the union that the list left out: what iterates this is the
 * picker and the rotation below, so such a colour would simply never be offered.
 */
export const ALL_COLORS = ['blue', 'orange', 'purple', 'green', 'red', 'teal', 'yellow', 'pink', 'gray'] as const;

export type TabGroupColor = (typeof ALL_COLORS)[number];

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
