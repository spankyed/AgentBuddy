import { expect, it } from 'vitest';
import { formatReferenceHref, parseReferenceHref } from '../../src/framework/reference-link.ts';

it.each([
  { type: 'memo', id: 'Memo-one' },
  { type: 'note', id: 'Note-a/#value %?&' },
  { type: 'custom/type', id: 'Entity-你好/🙂' },
  { type: 'unknown', id: 'Entity-%2F' },
])('round-trips encoded identity without any host/catalog (%j)', target => {
  const href = formatReferenceHref(target);
  expect(href).toBe(`apack-ref://${encodeURIComponent(target.type)}/${encodeURIComponent(target.id)}`);
  expect(parseReferenceHref(href)).toEqual(target);
});

it.each(['', 'https://example.com', 'thread://Thread-one', 'javascript:alert(1)',
  'apack-ref://', 'apack-ref://memo', 'apack-ref:///Memo-one', 'apack-ref://memo/',
  'apack-ref://memo/Memo-one/extra', 'apack-ref://memo/Memo-%ZZ', 'apack-ref://%ZZ/Memo-one',
  'apack-ref://memo/Memo-one?query', 'apack-ref://memo/Memo-one#fragment'])('refuses malformed or unrelated links (%s)', href => {
  expect(parseReferenceHref(href)).toBeUndefined();
});

it.each([{ type: '', id: 'Memo-one' }, { type: 'memo', id: '' }])('refuses missing identity when formatting (%j)', target => {
  expect(() => formatReferenceHref(target)).toThrow('type and canonical entity id');
});

it('encodes Markdown URL delimiters so targets containing parentheses remain intact', () => {
  const target = { type: 'note', id: "Note-(part)'*" };
  expect(formatReferenceHref(target)).toBe('apack-ref://note/Note-%28part%29%27%2A');
  expect(parseReferenceHref(formatReferenceHref(target))).toEqual(target);
});
