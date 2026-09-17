// How `abuddy db` renders a result: values JSON has no form for, rows of differing shapes, and results that aren't
// rows at all
import { describe, expect, it } from 'vitest';
import { formatResult, outputFormat, toCSV, toJSON, toPretty } from '../../src/commands/db/output';

describe('json', () => {
  it('writes what JSON has no form for as text', () => {
    const date = new Date('2020-01-02T03:04:05Z');
    expect(JSON.parse(toJSON({ date, count: 9007199254740993n }))).toEqual({
      date: '2020-01-02T03:04:05.000Z',
      count: '9007199254740993',
    });
  });

  it('writes an object that holds itself rather than throwing', () => {
    const row: Record<string, unknown> = { id: 'Note-1' };
    row.self = row;
    expect(JSON.parse(toJSON(row))).toEqual({ id: 'Note-1', self: '[Circular]' });
    // The same object twice isn't a cycle, but is reported once
    const shared = { id: 'Note-2' };
    expect(JSON.parse(toJSON([shared, shared]))).toEqual([{ id: 'Note-2' }, '[Circular]']);
  });

  it('says undefined for a result that has no JSON at all', () => {
    expect(toJSON(undefined)).toBe('undefined');
  });
});

describe('csv', () => {
  it('writes a date as its ISO string, not as a quoted JSON string', () => {
    expect(toCSV([{ id: 'Note-1', createdAt: new Date('2020-01-02T03:04:05Z') }]))
      .toBe('id,createdAt\nNote-1,2020-01-02T03:04:05.000Z\n');
  });

  it('writes nothing for an empty result, rather than a line with no columns', () => {
    expect(toCSV([])).toBe('');
  });

  it('gives every row a column any row has, and escapes what needs it', () => {
    expect(toCSV([{ id: 'Note-1', title: 'Beta, "quoted"' }, { id: 'Note-2', tags: ['a', 'b'] }]))
      .toBe('id,title,tags\nNote-1,"Beta, ""quoted""",\nNote-2,,"[\n  ""a"",\n  ""b""\n]"\n');
  });

  it('writes a result that is not rows as cells', () => {
    expect(toCSV(3)).toBe('3\n');
    expect(toCSV(['a', 'b'])).toBe('a\nb\n');
    expect(toCSV(new Date('2020-01-02T03:04:05Z'))).toBe('2020-01-02T03:04:05.000Z\n');
    expect(toCSV(null)).toBe('\n');
  });
});

describe('pretty', () => {
  it('prints a string as it is, and anything else readably', () => {
    expect(toPretty('Alpha')).toBe('Alpha');
    expect(toPretty({ id: 'Note-1' })).toBe("{ id: 'Note-1' }");
    const row: Record<string, unknown> = {};
    row.self = row;
    expect(toPretty(row)).toContain('[Circular');
  });
});

describe('the chosen format', () => {
  it('is pretty unless asked for, and only one this command writes', () => {
    expect(outputFormat(undefined)).toBe('pretty');
    expect(outputFormat('csv')).toBe('csv');
    expect(() => outputFormat('xml')).toThrow('--output must be one of pretty, json, csv');
  });

  it('decides how a result is rendered', () => {
    const rows = [{ id: 'Note-1' }];
    expect(formatResult(rows, 'json')).toBe(toJSON(rows));
    expect(formatResult(rows, 'csv')).toBe('id\nNote-1');
    expect(formatResult(rows, 'pretty')).toBe(toPretty(rows));
  });
});
