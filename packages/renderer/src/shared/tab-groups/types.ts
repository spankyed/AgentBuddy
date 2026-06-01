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
