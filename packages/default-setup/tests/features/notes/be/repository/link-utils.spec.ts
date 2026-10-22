// A note's REFERENCES are an index derived from its text: one relation per note its links name that exists, built
// again from the text whenever it might be stale — so a link to a note that doesn't exist yet is indexed once it does
import { beforeEach, expect, it } from 'vitest';
import { findRelations } from '@apackdev/sdk/ears';
import { resetTestData } from '@apackdev/sdk/testing';
import { repository } from '#generated/repository.ts';
import type { EARS } from '#generated/ears.ts';
import { REFERENCES } from '../../../../../src/features/notes/be/types.ts';

beforeEach(() => resetTestData());

const link = (id: string) => `[see](apack-ref://note/${id})`;
const references = (id: EARS.EntityId) => findRelations({ sourceEntity: id, relationType: REFERENCES }).map((r) => r.targetEntity).sort();
const note = (title: string, content = '', id?: string) => repository.noteCommands.create({ title, content, ...(id && { id }) }).id as EARS.EntityId;

it('indexes the notes a note links to that exist, and not one that does not', () => {
  const target = note('Target');
  const source = note('Source', `${link(target)} ${link('Note-nowhere')}`);
  expect(references(source)).toEqual([target]);
});

it('indexes a link to a note once that note is created', () => {
  const source = note('Source', link('Note-later'));
  expect(references(source)).toEqual([]);

  note('Later', '', 'Note-later');
  expect(references(source)).toEqual(['Note-later']);
});

it('removes a reference the text no longer makes', () => {
  const kept = note('Kept');
  const dropped = note('Dropped');
  const source = note('Source', `${link(kept)} ${link(dropped)}`);
  expect(references(source)).toEqual([dropped, kept].sort());

  repository.noteCommands.update(source, { content: link(kept) });
  expect(references(source)).toEqual([kept]);
});
