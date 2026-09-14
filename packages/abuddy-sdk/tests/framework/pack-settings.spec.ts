import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkFeatureSettings,
  getPackSettingsDefaults,
  onPackSettingsDefaultsChanged,
  packSettingsRegistry,
} from '../../src/framework/pack-settings.ts';

afterEach(() => {
  for (const id of ['memo-pack', 'todo-pack', 'bad-pack']) packSettingsRegistry.unregister(id);
});

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

describe('packSettingsRegistry', () => {
  it("merges registered packs' feature settings and drops a pack's when it unregisters", () => {
    const listener = vi.fn();
    const unsubscribe = onPackSettingsDefaultsChanged(listener);
    const before = getPackSettingsDefaults().revision;

    packSettingsRegistry.register('memo-pack', [
      { id: 'memos', settings: { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } } },
      { id: 'no-settings' },
    ]);
    packSettingsRegistry.register('todo-pack', [{ id: 'todos', settings: { plugins: { todos: { done: true } } } }]);
    expect(getPackSettingsDefaults()).toEqual({
      revision: before + 2,
      settings: { plugins: { memos: { sort: 'newest' }, todos: { done: true }, _meta: { visibility: { memos: false } } } },
    });

    packSettingsRegistry.unregister('memo-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { todos: { done: true } } });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    packSettingsRegistry.unregister('todo-pack');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("rejects a pack whose feature sets another plugin's settings, registering nothing", () => {
    const before = getPackSettingsDefaults();
    expect(() => packSettingsRegistry.register('bad-pack', [{ id: 'memos', settings: { plugins: { threads: { hidden: true } } } }]))
      .toThrow(/Pack "bad-pack" has invalid feature settings:\n {2}Feature "memos" settings set "plugins.threads"/);
    expect(getPackSettingsDefaults()).toBe(before);
  });
});
