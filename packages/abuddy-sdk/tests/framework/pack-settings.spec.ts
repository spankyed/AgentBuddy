// What a feature's settings may set; the host's registry refuses a pack whose features set more
import { describe, expect, it } from 'vitest';
import { checkFeatureSettings } from '../../src/framework/pack-settings.ts';

describe('checkFeatureSettings', () => {
  it("accepts a feature's own plugin slice and visibility", () => {
    expect(checkFeatureSettings('memos', { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } })).toEqual([]);
    expect(checkFeatureSettings('memos', {})).toEqual([]);
  });

  it("rejects the app's settings, other plugins' and other _meta keys", () => {
    expect(checkFeatureSettings('memos', {
      general: { theme: 'dark' },
      plugins: { threads: {}, _meta: { visibility: { threads: false }, lastActivePlugin: 'memos' } },
    })).toEqual([
      expect.stringContaining('set "general"'),
      expect.stringContaining('set "plugins.threads"'),
      expect.stringContaining('"plugins._meta.visibility" may only set "memos"'),
      expect.stringContaining('set "plugins._meta.lastActivePlugin"'),
    ]);
    expect(checkFeatureSettings('memos', { plugins: { _meta: { visibility: { memos: 'yes' } } } })).toEqual([expect.stringContaining('to true or false')]);
    expect(checkFeatureSettings('memos', undefined)).toEqual([expect.stringContaining('must default-export an object')]);
  });
});
