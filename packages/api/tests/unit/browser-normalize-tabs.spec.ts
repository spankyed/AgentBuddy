import { describe, expect, it } from 'vitest';
import { normalizeSavedTabs } from '@/systems/browser/repository/normalize-tabs';

describe('normalizeSavedTabs', () => {
  it('drops invalid restore URLs', () => {
    const result = normalizeSavedTabs([
      { url: '', title: '', favicon: '', displayOrder: 0, isMuted: false },
      { url: 'about:blank', title: '', favicon: '', displayOrder: 1, isMuted: false },
      { url: 'data:text/html,test', title: '', favicon: '', displayOrder: 2, isMuted: false },
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'App', favicon: '', displayOrder: 3, isMuted: false },
    ]);

    expect(result.invalidCount).toBe(3);
    expect(result.duplicateIdCount).toBe(0);
    expect(result.tabs).toEqual([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'App', favicon: '', displayOrder: 0, isMuted: false },
    ]);
  });

  it('preserves duplicate URLs because tabs are separate browser state', () => {
    const result = normalizeSavedTabs([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'First', favicon: 'a.ico', displayOrder: 0, isMuted: false },
      { id: 'BrowserTab-b', url: 'http://localhost:5180/', title: 'Duplicate', favicon: 'b.ico', displayOrder: 1, isMuted: true },
      { id: 'BrowserTab-c', url: 'http://localhost:5180/', title: 'Grouped', favicon: 'c.ico', displayOrder: 2, isMuted: false, groupId: 'group-1' },
      { id: 'BrowserTab-d', url: 'http://localhost:5180/', title: 'Grouped duplicate', favicon: 'd.ico', displayOrder: 3, isMuted: false, groupId: 'group-1' },
    ]);

    expect(result.invalidCount).toBe(0);
    expect(result.duplicateIdCount).toBe(0);
    expect(result.tabs).toEqual([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'First', favicon: 'a.ico', displayOrder: 0, isMuted: false },
      { id: 'BrowserTab-b', url: 'http://localhost:5180/', title: 'Duplicate', favicon: 'b.ico', displayOrder: 1, isMuted: true },
      { id: 'BrowserTab-c', url: 'http://localhost:5180/', title: 'Grouped', favicon: 'c.ico', displayOrder: 2, isMuted: false, groupId: 'group-1' },
      { id: 'BrowserTab-d', url: 'http://localhost:5180/', title: 'Grouped duplicate', favicon: 'd.ico', displayOrder: 3, isMuted: false, groupId: 'group-1' },
    ]);
  });

  it('deduplicates only duplicate stable ids', () => {
    const result = normalizeSavedTabs([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'First', favicon: '', displayOrder: 0, isMuted: false },
      { id: 'BrowserTab-a', url: 'http://localhost:5180/other', title: 'Duplicate id', favicon: '', displayOrder: 1, isMuted: false },
    ]);

    expect(result.invalidCount).toBe(0);
    expect(result.duplicateIdCount).toBe(1);
    expect(result.tabs).toEqual([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'First', favicon: '', displayOrder: 0, isMuted: false },
    ]);
  });

  it('preserves distinct valid URLs in order', () => {
    const result = normalizeSavedTabs([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'Local', favicon: '', displayOrder: 99, isMuted: false },
      { id: 'BrowserTab-b', url: 'http://localhost:5180/#settings', title: 'Settings', favicon: '', displayOrder: 4, isMuted: false },
      { id: 'BrowserTab-c', url: 'https://www.youtube.com/watch?v=abc', title: 'Video', favicon: '', displayOrder: 3, isMuted: true },
    ]);

    expect(result.invalidCount).toBe(0);
    expect(result.duplicateIdCount).toBe(0);
    expect(result.tabs).toEqual([
      { id: 'BrowserTab-a', url: 'http://localhost:5180/', title: 'Local', favicon: '', displayOrder: 0, isMuted: false },
      { id: 'BrowserTab-b', url: 'http://localhost:5180/#settings', title: 'Settings', favicon: '', displayOrder: 1, isMuted: false },
      { id: 'BrowserTab-c', url: 'https://www.youtube.com/watch?v=abc', title: 'Video', favicon: '', displayOrder: 2, isMuted: true },
    ]);
  });
});
