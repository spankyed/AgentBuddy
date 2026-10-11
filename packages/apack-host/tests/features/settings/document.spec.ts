// The settings document's rules, which both the store and the settings editor check with, so both refuse the same
// document. The host knows one section, `plugins`; every other section is named by whoever registered it, which is
// what these cover — a document's shape is the host's, its content is not.
import { describe, expect, it } from 'vitest';
import {
  changesFrom,
  isEqual,
  PLUGINS_SECTION,
  removeIn,
  SettingsRefusedError,
  settingsProblems,
  setIn,
} from '../../../src/features/settings/be/document.ts';

/** The sections a pack registered, as the store passes them */
const SECTIONS = ['general', 'assistant'];
const check = (next: unknown, before: unknown = {}, keyProblem?: (key: string) => string | undefined) =>
  settingsProblems(next, { before, sections: SECTIONS, keyProblem });

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

describe('changesFrom', () => {
  it('keeps only what the settings set that the defaults do not', () => {
    expect(changesFrom({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 9, d: 3 } })).toEqual({ b: { c: 9 } });
  });

  it('is undefined when nothing differs, so a default left out keeps applying', () => {
    expect(changesFrom({ a: 1 }, { a: 1 })).toBeUndefined();
  });
});

describe('settingsProblems', () => {
  it('accepts plugins and the sections it is given', () => {
    expect(check({ plugins: { 'default-setup/threads': { x: 1 } }, general: { personal: {} } })).toEqual([]);
  });

  // The host knows `plugins` and nothing else: a section nobody registered is a typo, not new content
  it('refuses a section it was not given, naming the ones it knows', () => {
    const [problem] = check({ generall: { typo: true } });

    expect(problem).toContain('"generall" isn\'t a settings section');
    expect(problem).toContain(PLUGINS_SECTION);
    expect(problem).toContain('general, assistant');
  });

  it('refuses a section that is not an object', () => {
    expect(check({ general: 'nope' })).toEqual(['"general" must be an object']);
  });

  it('refuses a document that is not an object at all', () => {
    expect(check('nope')).toEqual(['The settings must be a JSON object']);
  });

  it('requires every plugin key to be a ref', () => {
    expect(check({ plugins: { threads: { x: 1 } } })).toEqual([
      '"threads" isn\'t a ref: a plugin\'s settings are stored under "<packId>/<featureId>"',
    ]);
  });

  // An uninstalled pack's slice is there for its reinstall, so only a slice that changes is checked
  it('leaves an unchanged slice alone and checks a changed one against keyProblem', () => {
    const before = { plugins: { 'gone-pack/notes': { keep: true }, 'default-setup/threads': { x: 1 } } };
    const keyProblem = (key: string) => (key === 'gone-pack/notes' ? 'not installed' : undefined);

    expect(check({ plugins: { 'gone-pack/notes': { keep: true }, 'default-setup/threads': { x: 2 } } }, before, keyProblem)).toEqual([]);
    expect(check({ plugins: { 'gone-pack/notes': { changed: true } } }, before, keyProblem)).toEqual(['not installed']);
  });

  it('reports every problem in one pass', () => {
    expect(check({ nope: {}, general: 1, plugins: { bare: {} } })).toHaveLength(3);
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
