import type { SavedTab } from '../types';

export interface NormalizeTabsResult {
  tabs: SavedTab[];
  invalidCount: number;
  duplicateCount: number;
}

function isRestorableUrl(url: string | undefined): url is string {
  if (!url) return false;
  return url !== 'about:blank' && !url.startsWith('data:');
}

function normalizeUrlKey(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url.trim();
  }
}

function tabKey(tab: SavedTab): string {
  return `${normalizeUrlKey(tab.url)}\u0000${tab.groupId ?? ''}`;
}

export function normalizeSavedTabs(tabs: SavedTab[]): NormalizeTabsResult {
  const seen = new Set<string>();
  const normalized: SavedTab[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const tab of tabs) {
    if (!isRestorableUrl(tab.url)) {
      invalidCount += 1;
      continue;
    }

    const key = tabKey(tab);
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);

    normalized.push({
      url: tab.url,
      title: tab.title || 'New Tab',
      favicon: tab.favicon || '',
      displayOrder: normalized.length,
      isMuted: Boolean(tab.isMuted),
      ...(tab.groupId ? { groupId: tab.groupId } : {}),
    });
  }

  return { tabs: normalized, invalidCount, duplicateCount };
}
