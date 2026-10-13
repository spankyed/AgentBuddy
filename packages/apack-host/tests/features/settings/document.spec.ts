import { describe, expect, it } from 'vitest';
import {
  isEqual,
  removeIn,
  SettingsRefusedError,
  settingsProblems,
  setIn,
} from '../../../src/features/settings/document.ts';

const check = settingsProblems;

describe('setIn', () => {
  it('copies only the objects along the path', () => {
    const before = { a: { keep: 1, deep: { x: 1 } }, other: {} };
    const after = setIn(before, ['a', 'deep', 'x'], 2) as typeof before;

    expect(after).toEqual({ a: { keep: 1, deep: { x: 2 } }, other: {} });
    expect(after).not.toBe(before);
    expect(after.other).toBe(before.other); // untouched branches are shared, not copied
  });

  it('makes a step that is not an object into one, and an empty path replaces the node', () => {
    expect(setIn({ a: 5 }, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
    expect(setIn({ a: 1 }, [], 'replaced')).toBe('replaced');
  });

  // The reason the operations build from own keys: a settings document is user data, and a key naming a prototype
  // member must be stored as data rather than reaching Object.prototype
  it('takes __proto__ as data and leaves the prototype alone', () => {
    const after = setIn({}, ['__proto__', 'polluted'], true) as Record<string, unknown>;

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(after)).toBe(Object.prototype);
    expect(Object.keys(after)).toEqual(['__proto__']);
  });
});

describe('removeIn', () => {
  it('removes the value at the path and returns the node itself when nothing is there', () => {
    const before = { a: { x: 1, y: 2 } };
    expect(removeIn(before, ['a', 'x'])).toEqual({ a: { y: 2 } });
    expect(removeIn(before, ['a', 'missing'])).toBe(before);
    expect(removeIn(before, ['missing', 'x'])).toBe(before);
  });
});

describe('isEqual', () => {
  it('compares objects key by key whatever their order, and arrays by position', () => {
    expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(isEqual([1, 2], [1, 2])).toBe(true);
    expect(isEqual([1, 2], [2, 1])).toBe(false);
    expect(isEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe('settingsProblems', () => {
  it('accepts only the three host-defined owners, with pack-local groups', () => {
    expect(check({ app: {}, packs: { first: { assistant: { name: 'Ada' } }, second: { assistant: { name: 'Grace' } } }, features: { 'first/code': {} } })).toEqual([]);
    expect(check({ general: {}, assistant: {} })).toHaveLength(2);
  });

  it('refuses malformed ownership addresses regardless of existing data', () => {
    expect(check({ packs: { 'not/a/pack': {} } })).toHaveLength(1);
    expect(check({ packs: { first: { 'not/a/group': {} } } })).toHaveLength(1);
    expect(check({ features: { code: {} } })).toHaveLength(1);
    expect(check({ app: [] })).toHaveLength(1);
    expect(check('not a document')).toEqual(['The settings must be a JSON object']);
  });

  it.each([undefined, NaN, Infinity, 1n, new Date(), () => {}, Symbol('value')])('refuses non-JSON values %s before schema validation', value => {
    expect(check({ packs: { first: { assistant: { value } } } }).join(' ')).toContain('JSON data');
  });

  it('refuses cycles, sparse arrays and getters without invoking them', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(check({ app: cycle }).join(' ')).toContain('acyclic');
    const sparse = [null, null];
    Reflect.deleteProperty(sparse, 0);
    expect(check({ app: { values: sparse } }).join(' ')).toContain('holes');
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { throw new Error('must not execute'); } });
    expect(check({ app: accessor }).join(' ')).toContain('ordinary JSON data properties');
  });
});

describe('SettingsRefusedError', () => {
  it('carries the reasons and joins them into its message', () => {
    const error = new SettingsRefusedError(['one', 'two']);

    expect(error.problems).toEqual(['one', 'two']);
    expect(error.message).toBe('one; two');
    expect(error.name).toBe('SettingsRefusedError');
  });
});
