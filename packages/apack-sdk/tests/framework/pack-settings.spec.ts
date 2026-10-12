import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { checkFeatureSettings, defineFeatureSettings } from '../../src/framework/pack-settings.ts';

describe('feature settings declarations', () => {
  it('derives defaults from the schema and validates declarations', () => {
    const settings = defineFeatureSettings({ schema: z.object({ limit: z.number().int().min(1).default(10) }).strict(), visible: false });
    expect(settings.defaults).toEqual({ limit: 10 });
    expect(checkFeatureSettings('memos', settings)).toEqual([]);
    expect(settings.schema.safeParse({ limit: -1 }).success).toBe(false);
    expect(settings.schema.safeParse({ limit: 10, typo: true }).success).toBe(false);
    expect(checkFeatureSettings('memos', { visible: false })).toEqual([]);
  });

  it('refuses undeclared sections, invalid defaults, and a missing schema', () => {
    expect(checkFeatureSettings('memos', { general: {}, plugins: {} })).toEqual([
      expect.stringContaining('set "general"'), expect.stringContaining('set "plugins"'),
    ]);
    expect(checkFeatureSettings('memos', { defaults: {} })).toEqual([expect.stringContaining('defaults require a schema')]);
    expect(checkFeatureSettings('memos', { defaults: { count: 'oops' }, schema: z.object({ count: z.number() }) }))
      .toEqual([expect.stringContaining('count: Expected number')]);
    expect(checkFeatureSettings('memos', { visible: 'yes' })).toEqual([expect.stringContaining('"visible" must be true or false')]);
    expect(checkFeatureSettings('memos', undefined)).toEqual([expect.stringContaining('must default-export an object')]);
  });
});
