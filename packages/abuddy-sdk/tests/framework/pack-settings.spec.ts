// What a feature's settings may set; the host's registry refuses a pack whose features set more
import { describe, expect, it } from 'vitest';
import { checkFeatureSettings } from '../../src/framework/pack-settings.ts';

describe('checkFeatureSettings', () => {
  it("accepts a feature's own plugin slice and whether its tab shows", () => {
    expect(checkFeatureSettings('memos', { plugins: { memos: { sort: 'newest' } }, visible: false })).toEqual([]);
    expect(checkFeatureSettings('memos', {})).toEqual([]);
  });

  it("rejects the app's settings, other plugins', and anything else", () => {
    expect(checkFeatureSettings('memos', {
      general: { theme: 'dark' },
      plugins: { threads: {}, _meta: { visibility: { memos: false } } },
    })).toEqual([
      expect.stringContaining('set "general"'),
      expect.stringContaining('set "plugins.threads"'),
      expect.stringContaining('set "plugins._meta"'),
    ]);
    expect(checkFeatureSettings('memos', { visible: 'yes' })).toEqual([expect.stringContaining('"visible" must be true or false')]);
    expect(checkFeatureSettings('memos', undefined)).toEqual([expect.stringContaining('must default-export an object')]);
  });
});
