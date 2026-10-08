/**
 * What this pack contributes to the app's settings (`src/app-settings/`).
 *
 * **These are defaults, not seed data.** They were a `boot.seed` entry whose compiled artifact was read back
 * by this pack with `readFileSync` and whose "seeder" ignored its own record to call `services.settings.reset()`
 * — so `boot.seedPolicy.skipAtBoot` existed to stop the import machinery firing that reset at boot. The
 * settings row holds only what the user changed and the store composes these underneath it, so nothing was
 * ever written: the entry is gone, the defaults are an import, and the one claim the compiler made about them
 * is checked here instead.
 */
import { describe, expect, it } from 'vitest';
import { assertNoPluginSlice, getBaseSettings, settingsSections } from '#app-settings/index.ts';

describe('the base settings', () => {
  it('are this pack\'s own source, with no compiled seeds on disk to read', () => {
    const base = getBaseSettings();
    expect(Object.keys(base)).toContain('general');
    expect(Object.keys(base)).toContain('assistant');
  });

  it('offer the two sections this pack registers, and nothing else', () => {
    expect(Object.keys(settingsSections()).sort()).toEqual(['assistant', 'general']);
  });

  /** A feature's own defaults come from the registry under its ref; a copy here is one only a stale reader finds */
  it('hold no plugin\'s slice', () => {
    expect(getBaseSettings().plugins ?? {}).toEqual({});
  });
});

describe('a base file that sets a plugin\'s slice', () => {
  it('is refused, named, and told where a feature declares its own', () => {
    expect(() => assertNoPluginSlice({ plugins: { memos: { sort: 'newest' } } }, 'base.ts'))
      .toThrow('base.ts sets a plugin\'s settings: a feature declares its own, and whether its tab shows, in features[].settings');
  });

  // The app shell's old `_meta` too: which tabs show is each feature's `visible`, and the host's state
  it('is refused for anything under plugins, not only a feature id', () => {
    expect(() => assertNoPluginSlice({ plugins: { _meta: { visibility: {} } } }, 'base.ts'))
      .toThrow("sets a plugin's settings");
  });

  it('passes an empty plugins map, and a base with none at all', () => {
    expect(() => assertNoPluginSlice({ general: {}, plugins: {} }, 'base.ts')).not.toThrow();
    expect(() => assertNoPluginSlice({ general: {} }, 'base.ts')).not.toThrow();
  });
});
