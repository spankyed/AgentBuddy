// What a step records on its TNode, and the two conditions that used to cost it the whole row.
//
// `truncateResult`'s output is written to the TNode (`tnodeRepository`), which is the only record of what a
// step returned — so a value JSON cannot hold must be described rather than allowed to fail the result. A
// bare `JSON.stringify` used to measure the object's size, and its throw discarded everything: a row holding
// a BigInt became `{ value: '[Object with circular reference]', _error: 'serialization_failed' }`, which is
// both lossy and the wrong diagnosis, and it was persisted.
//
// The size estimate and the walk answer different questions and are allowed to differ: the estimate counts a
// repeated object once because it only needs a length, while the walk keeps it twice because it is building
// the value. Only a true loop is cut.
import { describe, expect, it } from 'vitest';
import { isTruncated, truncateResult } from '../../src/steps/index.ts';

describe('a value JSON has no form for', () => {
  it('keeps the row and writes a BigInt as its digits', () => {
    expect(truncateResult({ id: 'Note-1', count: 9007199254740993n }))
      .toEqual({ id: 'Note-1', count: '9007199254740993' });
  });

  it('writes a BigInt at the top level too', () => {
    expect(truncateResult(42n)).toBe('42');
  });

  /**
   * A Date has no own enumerable properties, so walking one yields `{}` — and a step's timestamps persisted as
   * empty objects. `JSON.stringify` asks a value to describe itself before reading its fields, which is how the
   * other four passes all keep a Date, so this asks too.
   */
  it('keeps a Date as the string it describes itself as', () => {
    expect(truncateResult({ at: new Date('2026-01-02T03:04:05Z') }))
      .toEqual({ at: '2026-01-02T03:04:05.000Z' });
  });
});

describe('a value that reaches itself', () => {
  it('cuts the loop where it closes and keeps the rest', () => {
    const row: Record<string, unknown> = { id: 'Note-1' };
    row.self = row;

    expect(truncateResult(row)).toEqual({ id: 'Note-1', self: '[Circular]' });
  });

  // Two objects pointing at each other close the loop one level down, not at the root
  it('cuts a mutual loop at the edge that closes it', () => {
    const a: Record<string, unknown> = { id: 'a' };
    const b: Record<string, unknown> = { id: 'b', a };
    a.b = b;

    expect(truncateResult(a)).toEqual({ id: 'a', b: { id: 'b', a: '[Circular]' } });
  });

  it('cuts a loop through an array', () => {
    const items: unknown[] = [1];
    items.push(items);

    expect(truncateResult(items)).toEqual([1, '[Circular]']);
  });

  /**
   * The case that separates a loop from a repeat, and the reason the walk cannot use the size estimate's
   * answer: the estimate counts `shared` once, which would read as a cut here.
   */
  it('keeps a value that merely appears twice', () => {
    const shared = { id: 'n1' };

    expect(truncateResult({ left: shared, right: shared }))
      .toEqual({ left: { id: 'n1' }, right: { id: 'n1' } });
  });
});

describe('the bounds it exists to enforce', () => {
  it('cuts a long string at a word boundary and says how long it was', () => {
    const text = `${'word '.repeat(3000)}end`;
    const cut = truncateResult(text) as { value: string; _originalLength: number; _type: string };

    expect(isTruncated(cut)).toBe(true);
    expect(cut._type).toBe('string');
    expect(cut._originalLength).toBe(text.length);
    expect(cut.value.endsWith('...'), 'and says it was cut').toBe(true);
    expect(cut.value.length, 'at or under the limit, plus the ellipsis').toBeLessThanOrEqual(10240 + 3);
  });

  it('keeps the first hundred of a longer array and says how many there were', () => {
    const cut = truncateResult(Array.from({ length: 250 }, (_, index) => index)) as
      { value: unknown[]; _originalLength: number; _type: string };

    expect(cut._type).toBe('array');
    expect(cut._originalLength).toBe(250);
    expect(cut.value).toHaveLength(100);
  });

  it('leaves an array inside the limit as an array', () => {
    expect(truncateResult([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('keeps twenty keys of an object past the size limit, and counts the rest', () => {
    const wide: Record<string, string> = {};
    for (let index = 0; index < 60; index++) wide[`key${index}`] = 'x'.repeat(2000);
    const cut = truncateResult(wide) as { value: Record<string, unknown>; _originalKeys: number; _type: string };

    expect(cut._type).toBe('object');
    expect(cut._originalKeys).toBe(60);
    expect(Object.keys(cut.value)).toHaveLength(20);
  });

  it('marks nesting past the depth cap rather than following it down', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 15; index++) deep = { next: deep };

    expect(JSON.stringify(truncateResult(deep))).toContain('[Max depth exceeded]');
  });

  it('passes a value inside every bound through untouched', () => {
    expect(truncateResult({ id: 'Note-1', tags: ['a', 'b'], count: 3 }))
      .toEqual({ id: 'Note-1', tags: ['a', 'b'], count: 3 });
    expect(truncateResult(null)).toBeNull();
    expect(truncateResult(undefined)).toBeUndefined();
  });
});
