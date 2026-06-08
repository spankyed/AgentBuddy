import { EARS } from '@/core/types';
import type { BrowserTabId, SavedTab } from '../types';

export interface NormalizeTabsResult {
  tabs: SavedTab[];
  invalidCount: number;
  duplicateIdCount: number;
}

function isRestorableUrl(url: string | undefined): url is string {
  if (!url) return false;
  return url !== 'about:blank' && !url.startsWith('data:');
}

function isBrowserTabId(id: string | undefined): id is BrowserTabId {
  return Boolean(id?.startsWith(`${EARS.Entity.BrowserTab}-`));
}

export function normalizeSavedTabs(tabs: Array<SavedTab | Omit<SavedTab, 'id'>>): NormalizeTabsResult {
  const normalized: SavedTab[] = [];
  const seenIds = new Set<string>();
  let invalidCount = 0;
  let duplicateIdCount = 0;

  for (const tab of tabs) {
    if (!isRestorableUrl(tab.url)) {
      invalidCount += 1;
      continue;
    }

    const id = isBrowserTabId((tab as SavedTab).id)
      ? (tab as SavedTab).id
      : `${EARS.Entity.BrowserTab}-${crypto.randomUUID()}` as BrowserTabId;

    if (seenIds.has(id)) {
      duplicateIdCount += 1;
      continue;
    }
    seenIds.add(id);

    normalized.push({
      id,
      url: tab.url,
      title: tab.title || 'New Tab',
      favicon: tab.favicon || '',
      displayOrder: normalized.length,
      isMuted: Boolean(tab.isMuted),
      ...(tab.groupId ? { groupId: tab.groupId } : {}),
    });
  }

  return { tabs: normalized, invalidCount, duplicateIdCount };
}
