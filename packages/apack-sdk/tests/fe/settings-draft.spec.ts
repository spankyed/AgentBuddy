import { effectScope, nextTick, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { useSettingsDraft } from '../../src/fe/settings-draft.ts';

describe('settings form drafts', () => {
  it('refuses to create a watcher outside a component or effect scope', () => {
    expect(() => useSettingsDraft(() => ({ enabled: true }))).toThrow('component or an effect scope');
  });

  it('ignores object key ordering but follows reordered arrays', async () => {
    const props = reactive({ value: { first: { a: 1, b: 2 }, second: ['a', 'b'] } });
    const scope = effectScope();
    const draft = scope.run(() => useSettingsDraft(() => props.value))!;
    try {
      draft.value.first.a = 99;
      props.value = { second: ['a', 'b'], first: { b: 2, a: 1 } };
      await nextTick();
      expect(draft.value.first.a).toBe(99);
      props.value.second = ['b', 'a'];
      await nextTick();
      expect(draft.value).toEqual({ first: { a: 1, b: 2 }, second: ['b', 'a'] });
    } finally {
      scope.stop();
    }
  });

  it('detaches nested edits, follows persisted changes, and preserves drafts across unrelated snapshots', async () => {
    const props = reactive({ settings: { tags: [{ name: 'original' }], enabled: true } });
    const scope = effectScope();
    const draft = scope.run(() => useSettingsDraft(() => props.settings.tags))!;
    try {
      draft.value[0]!.name = 'pending';
      expect(props.settings.tags[0]!.name).toBe('original');
      props.settings = { tags: [{ name: 'original' }], enabled: false };
      await nextTick();
      expect(draft.value[0]!.name).toBe('pending');
      props.settings.tags = [{ name: 'reset' }];
      await nextTick();
      expect(draft.value).toEqual([{ name: 'reset' }]);
    } finally {
      scope.stop();
    }
    props.settings.tags = [{ name: 'after disposal' }];
    await nextTick();
    expect(draft.value).toEqual([{ name: 'reset' }]);
  });

  it('follows an optional field arriving and being cleared', async () => {
    const props = reactive<{ value?: string }>({});
    const scope = effectScope();
    const draft = scope.run(() => useSettingsDraft(() => props.value))!;
    try {
      expect(draft.value).toBeUndefined();
      props.value = 'configured';
      await nextTick();
      expect(draft.value).toBe('configured');
      delete props.value;
      await nextTick();
      expect(draft.value).toBeUndefined();
    } finally {
      scope.stop();
    }
  });
});
