import { describe, expect, it } from 'vitest';
import { normalizeSavedTabs } from '@/systems/browser/repository/normalize-tabs';

describe('normalizeSavedTabs', () => {
  it('drops invalid restore URLs', () => {
    const result = normalizeSavedTabs([
      { url: '', title: '', favicon: '', displayOrder: 0, isMuted: false },
      { url: 'about:blank', title: '', favicon: '', displayOrder: 1, isMuted: false },
      { url: 'data:text/html,test', title: '', favicon: '', displayOrder: 2, isMuted: false },
      { url: 'http://localhost:5180/', title: 'App', favicon: '', displayOrder: 3, isMuted: false },
    ]);

    expect(result.invalidCount).toBe(3);
    expect(result.duplicateCount).toBe(0);
    expect(result.tabs).toEqual([
      { url: 'http://localhost:5180/', title: 'App', favicon: '', displayOrder: 0, isMuted: false },
    ]);
  });

  it('deduplicates restored tabs by normalized URL and group', () => {
    const result = normalizeSavedTabs([
      { url: 'http://localhost:5180/', title: 'First', favicon: 'a.ico', displayOrder: 0, isMuted: false },
      { url: 'http://localhost:5180/', title: 'Duplicate', favicon: 'b.ico', displayOrder: 1, isMuted: true },
      { url: 'http://localhost:5180/', title: 'Grouped', favicon: 'c.ico', displayOrder: 2, isMuted: false, groupId: 'group-1' },
      { url: 'http://localhost:5180/', title: 'Grouped duplicate', favicon: 'd.ico', displayOrder: 3, isMuted: false, groupId: 'group-1' },
    ]);

    expect(result.invalidCount).toBe(0);
    expect(result.duplicateCount).toBe(2);
    expect(result.tabs).toEqual([
      { url: 'http://localhost:5180/', title: 'First', favicon: 'a.ico', displayOrder: 0, isMuted: false },
      { url: 'http://localhost:5180/', title: 'Grouped', favicon: 'c.ico', displayOrder: 1, isMuted: false, groupId: 'group-1' },
    ]);
  });

  it('preserves distinct valid URLs in order', () => {
    const result = normalizeSavedTabs([
      { url: 'http://localhost:5180/', title: 'Local', favicon: '', displayOrder: 99, isMuted: false },
      { url: 'http://localhost:5180/#settings', title: 'Settings', favicon: '', displayOrder: 4, isMuted: false },
      { url: 'https://www.youtube.com/watch?v=abc', title: 'Video', favicon: '', displayOrder: 3, isMuted: true },
    ]);

    expect(result.invalidCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.tabs).toEqual([
      { url: 'http://localhost:5180/', title: 'Local', favicon: '', displayOrder: 0, isMuted: false },
      { url: 'http://localhost:5180/#settings', title: 'Settings', favicon: '', displayOrder: 1, isMuted: false },
      { url: 'https://www.youtube.com/watch?v=abc', title: 'Video', favicon: '', displayOrder: 2, isMuted: true },
    ]);
  });
});
