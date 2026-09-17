// Settings layer one way: the defaults, each feature's settings, then the user's stored changes
import { describe, expect, it } from 'vitest';
import { mergeSettings } from '@/features/settings/merge-settings';

describe('mergeSettings', () => {
  it('merges objects key by key, keeps the base for undefined, and replaces with anything else', () => {
    const base = { general: { theme: 'dark', zoom: 1 }, list: [1, 2], dir: '/home', kept: 'yes' };
    const over = { general: { zoom: 2 }, list: [3], dir: null, kept: undefined, added: { on: true } };

    expect(mergeSettings(base, over)).toEqual({
      general: { theme: 'dark', zoom: 2 },
      list: [3],
      dir: null,
      kept: 'yes',
      added: { on: true },
    });
    expect(base.general.zoom).toBe(1);
  });

  it('takes the base when there is nothing over it, and a non-object over an object', () => {
    expect(mergeSettings({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(mergeSettings({ a: 1 }, 'plain')).toBe('plain');
  });
});
