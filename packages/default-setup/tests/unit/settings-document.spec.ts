// The stored settings as a document: the check every write passes, shared by the store and the settings editor, and
// the pure operations that make the next document, which take a key such as `__proto__` as data
import { afterEach, describe, expect, it } from 'vitest';
import { refProblem } from '@abuddy/sdk/ids';
import { changesFrom, isEqual, removeIn, setIn, SETTINGS_KIND, settingsProblems } from '@/features/settings/document';

afterEach(() => { delete (Object.prototype as Record<string, unknown>).polluted; });

describe('setIn and removeIn', () => {
  it('copy only the objects along the path, leaving the input as it was', () => {
    const doc = { general: { theme: 'dark' }, plugins: { 'a/b': { on: true } } };

    expect(setIn(doc, ['general', 'zoom'], 2)).toEqual({ general: { theme: 'dark', zoom: 2 }, plugins: { 'a/b': { on: true } } });
    expect(setIn(doc, ['general', 'theme', 'deep'], 1)).toEqual({ general: { theme: { deep: 1 } }, plugins: doc.plugins });
    expect(removeIn(doc, ['plugins', 'a/b', 'on'])).toEqual({ general: { theme: 'dark' }, plugins: { 'a/b': {} } });
    expect(removeIn(doc, ['plugins', 'missing'])).toBe(doc);
    expect(doc).toEqual({ general: { theme: 'dark' }, plugins: { 'a/b': { on: true } } });
  });

  it('take __proto__ and constructor as keys, reaching no prototype', () => {
    const set = setIn({}, ['__proto__', 'polluted'], 'yes') as Record<string, unknown>;
    setIn({}, ['constructor', 'prototype', 'polluted'], 'yes');

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(set)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(set, '__proto__')).toBe(true);
    expect(removeIn({}, ['toString'])).toEqual({});
  });
});

describe('changesFrom', () => {
  it('keeps only what differs from the defaults', () => {
    const defaults = { general: { theme: 'dark', list: [1, 2] }, plugins: { 'a/b': { on: true, n: 1 } } };
    const settings = { general: { theme: 'dark', list: [1, 2] }, plugins: { 'a/b': { on: false, n: 1 }, 'c/d': { x: 1 } } };

    expect(changesFrom(defaults, settings)).toEqual({ plugins: { 'a/b': { on: false }, 'c/d': { x: 1 } } });
    expect(changesFrom(defaults, defaults)).toBeUndefined();
    expect(changesFrom({ list: [1, 2] }, { list: [2, 1] })).toEqual({ list: [2, 1] });
  });
});

describe('isEqual', () => {
  it('compares objects whatever their key order, and arrays in order', () => {
    expect(isEqual({ a: 1, b: { c: [1] } }, { b: { c: [1] }, a: 1 })).toBe(true);
    expect(isEqual([1, 2], [2, 1])).toBe(false);
    expect(isEqual({ a: undefined }, {})).toBe(false);
  });
});

describe('settingsProblems', () => {
  it('passes settings whose plugin keys are refs, a disabled pack\'s included', () => {
    expect(settingsProblems({ general: {}, plugins: { 'a/b': {}, 'gone-pack/x': {} } }, { before: {} })).toEqual([]);
  });

  it('refuses a document that is not an object, and a changed section that is not one or not the settings\'', () => {
    expect(settingsProblems(null, { before: {} })).toEqual(['The settings must be a JSON object']);
    expect(settingsProblems({ plugins: [] }, { before: {} })).toEqual(['"plugins" must be an object']);
    expect(settingsProblems({ extra: 1 }, { before: {} })).toEqual([`"extra" isn't a settings section: the settings hold general, plugins, assistant`]);
    // What a document already holds unchanged isn't this write's to refuse
    expect(settingsProblems({ extra: 1 }, { before: { extra: 1 } })).toEqual([]);
  });

  /** The store's key check over the installed features with settings `installed` */
  const keyProblem = (...installed: string[]) => (key: string) =>
    refProblem(SETTINGS_KIND, key, { registered: installed, among: 'installed' });

  it("refuses a key that isn't a ref, whatever else is known", () => {
    expect(settingsProblems({ plugins: { memos: {} } }, { before: {} }))
      .toEqual([`"memos" isn't a ref: a plugin's settings are stored under "<packId>/<featureId>"`]);
  });

  it('refuses a changed slice no installed feature with settings has, naming the one it likely meant', () => {
    const check = { before: {}, keyProblem: keyProblem('memo-pack/memos', 'x/y') };
    expect(settingsProblems({ plugins: { memos: {} } }, check)).toEqual([
      'No installed feature with settings is named "memos": name a feature with settings as "<packId>/<featureId>"'
      + ' — did you mean "memo-pack/memos"? Installed: memo-pack/memos, x/y',
    ]);
    expect(settingsProblems({ plugins: { 'other-pack/memos': { sort: 'new' } } }, check)[0]).toContain('did you mean "memo-pack/memos"?');
    expect(settingsProblems({ plugins: { 'memo-pack/memos': { sort: 'new' } } }, check)).toEqual([]);
  });

  // An uninstalled pack's settings wait for its reinstall
  it('keeps an unchanged slice whose feature is no longer installed', () => {
    const gone = { plugins: { 'gone-pack/board': { columns: 2 } } };
    expect(settingsProblems(gone, { before: gone, keyProblem: keyProblem('memo-pack/memos') })).toEqual([]);
  });

  it('checks only the keys whose slice changes', () => {
    const checked: string[] = [];
    const record = (key: string) => { checked.push(key); return undefined; };
    settingsProblems({ plugins: { 'a/b': { on: true }, 'a/c': { on: false } } }, { before: { plugins: { 'a/b': { on: true } } }, keyProblem: record });
    expect(checked).toEqual(['a/c']);
  });
});
