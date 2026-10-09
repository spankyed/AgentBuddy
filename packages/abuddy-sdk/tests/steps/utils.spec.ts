// A step's `map` is written in the DSL and read by the runtime, and these two carry it between those shapes.
// What they owe is that the trip is lossless: a mapping that goes out comes back, so a flow a user exports is
// the flow they had. `collapseRecord` used to read two fields and drop the rest, which is how a `default`
// could be applied at runtime and yet be impossible to write down.
import { describe, expect, it } from 'vitest';
import { collapseRecord, expandRecord, mapProblems } from '../../src/steps/utils.ts';

describe('expandRecord', () => {
  it('takes the short form, which is what every written flow writes', () => {
    expect(expandRecord({ text: '$.event.data.text' })).toEqual([{ target: 'text', source: '$.event.data.text' }]);
  });

  it('takes the long form, carrying the fallback the runtime applies', () => {
    expect(expandRecord({ threadId: { source: '$.event.data.threadId', default: 'general' } }))
      .toEqual([{ target: 'threadId', source: '$.event.data.threadId', default: 'general' }]);
  });

  // An absent fallback is absent, not `undefined`: the runtime tests `default !== undefined`, and two of the
  // editor's forms used to write the key explicitly as `undefined`, which is what made it look vestigial
  it('writes no default key when the long form gives none', () => {
    expect(expandRecord({ text: { source: '$.x' } })).toEqual([{ target: 'text', source: '$.x' }]);
  });

  it('is undefined for no map, which is what a step with no mapping stores', () => {
    expect(expandRecord(undefined)).toBeUndefined();
  });
});

describe('collapseRecord', () => {
  it('writes the short form back when there is no fallback to carry', () => {
    expect(collapseRecord([{ target: 'text', source: '$.x' }])).toEqual({ text: '$.x' });
  });

  it('writes the long form back when there is', () => {
    expect(collapseRecord([{ target: 'text', source: '$.x', default: 'y' }])).toEqual({ text: { source: '$.x', default: 'y' } });
  });

  it('is undefined for an empty list, so a step with no mappings writes no map', () => {
    expect(collapseRecord([])).toBeUndefined();
  });
});

describe('a map round-trips', () => {
  // The property the two owe together, over both forms at once. Asserted on the map rather than the mappings
  // because the map is what a user reads: this is their flow file, exported and read back.
  it('comes back as it went out', () => {
    const map = {
      text: '$.event.data.text',
      threadId: { source: '$.event.data.threadId', default: 'general' },
      count: { source: '$.lastStep.result.n', default: 0 },
    };

    expect(collapseRecord(expandRecord(map)!)).toEqual(map);
  });
});

describe('mapProblems', () => {
  it.each([
    ['a source string', '$.event.data.text'],
    ['a literal', 'plain'],
    ['the long form', { source: '$.x' }],
    ['the long form with a fallback', { source: '$.x', default: 1 }],
  ])('accepts %s', (_form, entry) => {
    expect(mapProblems({ field: entry }, 'steps[0].map')).toEqual([]);
  });

  it.each([
    ['a number', 1],
    ['an array', ['$.x']],
    ['null', null],
    // The shape an author guesses when reaching for a fallback without the `source` key. Before this check,
    // `expandRecord` put the whole object in `source` and the runtime returned it as a literal — so the near
    // miss produced a mapping whose value was the object, and nothing said so
    ['an object with no source', { default: 'y' }],
    ['an object whose source is not a string', { source: { path: '$.x' } }],
  ])('names %s, at the field that has it', (_form, entry) => {
    expect(mapProblems({ field: entry }, 'steps[0].map')).toEqual([{
      path: 'steps[0].map.field',
      message: 'a "map" entry must be a source string, or { source, default } to give a fallback',
    }]);
  });

  it.each([
    ['a list', ['a']],
    ['a string', 'a'],
  ])('names the map itself when it is %s rather than an object', (_form, map) => {
    expect(mapProblems(map, 'steps[0].map')).toEqual([
      { path: 'steps[0].map', message: '"map" must be an object { target: source }' },
    ]);
  });

  it('accepts no map at all, since every step\'s map is optional', () => {
    expect(mapProblems(undefined, 'steps[0].map')).toEqual([]);
  });
});
