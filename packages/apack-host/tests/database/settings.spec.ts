import { expect, it, vi } from 'vitest';
import type { LmdbStore } from '@apackdev/ears/lmdb';
import { storedSettings } from '../../src/database/settings.ts';

it.each([
  { attributes: 0, entity: null, value: null, expected: {} },
  { attributes: 0, entity: { type: 'Settings' }, value: null, expected: null },
  { attributes: 1, entity: { type: 'Settings' }, value: null, expected: null },
  { attributes: 1, entity: null, value: { app: { projects: 'invalid' } }, expected: { app: { projects: 'invalid' } } },
])('distinguishes absent preferences from malformed stored data before hydration: %j', ({ attributes, entity, value, expected }) => {
  const query = { getAttrCount: vi.fn(() => attributes), getEntityMeta: vi.fn(() => entity), getFirstAttr: vi.fn(() => value) };
  const store = { query: vi.fn(() => query) } as unknown as LmdbStore;
  expect(storedSettings(store)).toEqual(expected);
  expect(store.query).toHaveBeenCalledWith('primary');
});
