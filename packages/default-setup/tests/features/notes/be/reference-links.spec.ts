import { expect, it } from 'vitest';
import { formatReferenceHref } from '@apackdev/sdk/framework';
import { parseNoteLinks } from '../../../../src/features/notes/be/repository/link-utils.ts';

it('extracts canonical note/task targets with escaped labels and encoded ids, without display-code substitution', () => {
  const href = formatReferenceHref({ type: 'note', id: 'Note-a/(part) %' });
  expect(parseNoteLinks(`[A \\[label\\]](${href}) [Again](${href}) [Task](apack-ref://task/Note-task) [List](apack-ref://tasklist/Note-list)`))
    .toEqual(['Note-a/(part) %', 'Note-task', 'Note-list']);
});

it('excludes foreign reference kinds, malformed targets and ordinary links', () => {
  expect(parseNoteLinks('[Memo](apack-ref://memo/Memo-one) [Bad](apack-ref://note/Note-%ZZ) [Web](https://example.com)')).toEqual([]);
});
