import { ALL_COLORS, type TabGroup, type TabGroupColor } from './types';

export function getNextAvailableColor(tabGroups: TabGroup[], isPinned = false): TabGroupColor {
  const sameRowGroups = tabGroups.filter(g => (g.isPinned || false) === isPinned);
  const lastColor = sameRowGroups[sameRowGroups.length - 1]?.color;
  const nextIndex = tabGroups.length % ALL_COLORS.length;
  return ALL_COLORS[nextIndex] === lastColor
    ? ALL_COLORS[(nextIndex + 1) % ALL_COLORS.length]
    : ALL_COLORS[nextIndex];
}
