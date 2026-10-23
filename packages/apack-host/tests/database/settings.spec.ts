import { expect, it, vi } from 'vitest';
import type { LmdbStore } from '@apackdev/ears/lmdb';
import { storedSettings } from '../../src/database/settings.ts';

it.each([
  { entity: null, value: undefined, expected: {} },
  { entity: { type: 'Settings' }, value: null, expected: null },
  { entity: null, value: { app: { projects: 'invalid' } }, expected: { app: { projects: 'invalid' } } },
])('distinguishes absent preferences from malformed stored data before hydration: %j', ({ entity, value, expected }) => {
  const reader = { getEntityMeta: vi.fn(() => entity), getAttr: vi.fn(() => value) };
  const store = { read: vi.fn(() => reader) } as unknown as LmdbStore;
  expect(storedSettings(store)).toEqual(expected);
  expect(store.read).toHaveBeenCalledWith();
});
