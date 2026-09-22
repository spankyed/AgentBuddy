// One merge for layered data: settings (defaults, each feature's, then the user's changes) and migrated records
import { describe, expect, it } from 'vitest';
import { deepMerge } from '../../src/utils/shared.ts';

describe('deepMerge', () => {
  it('merges objects key by key, keeps the base for undefined, and replaces with anything else', () => {
    const base = { general: { theme: 'dark', zoom: 1 }, list: [1, 2], dir: '/home', kept: 'yes' };
    const over = { general: { zoom: 2 }, list: [3], dir: null, kept: undefined, added: { on: true } };

    expect(deepMerge(base, over)).toEqual({
      general: { theme: 'dark', zoom: 2 },
      list: [3],
      dir: null,
      kept: 'yes',
      added: { on: true },
    });
    expect(base.general.zoom).toBe(1);
  });

  it('takes the base when there is nothing over it, and a non-object over an object', () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, 'plain')).toBe('plain');
  });
});
