// A note's REFERENCES are an index derived from its text: one relation per note its links name that exists, built
// again from the text whenever it might be stale — so a link to a note that doesn't exist yet is indexed once it does
import { beforeEach, expect, it } from 'vitest';
import { findRelations, untypedCreate, untypedQuery, untypedWrite } from '@apackdev/sdk/ears';
import { resetTestData } from '@apackdev/sdk/testing';
import { repository } from '#generated/repository.ts';
import { EARS } from '#generated/ears.ts';
import { syncReferences } from '../../../../../src/features/notes/be/repository/link-utils.ts';
import { noteRow } from '../../../../_support/rows.ts';

beforeEach(() => resetTestData());

const link = (id: string) => `[see](apack-ref://note/${id})`;
const references = (id: EARS.EntityId) => findRelations({ sourceEntity: id, relationType: EARS.RelKind.REFERENCES }).map((r) => r.targetEntity).sort();
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

const linkTargets = (id: EARS.EntityId) => untypedQuery.withTrashed.ids(id).pickOne(['linkTargets'])?.linkTargets ?? null;

it('records every note its links name, existing or not, and drops the record when the text links to none', () => {
  const target = note('Target');
  const source = note('Source', `${link(target)} ${link('Note-nowhere')} ${link(target)}`);
  expect(linkTargets(source)).toEqual([target, 'Note-nowhere']);

  repository.noteCommands.update(source, { content: 'no links now' });
  expect(linkTargets(source)).toBeNull();
});

it('finds the notes linking to a new note by their recorded targets, not by text that only mentions its id', () => {
  const linking = note('Linking', link('Note-later'));
  const mentioning = note('Mentioning', 'Note-later is mentioned, not linked');
  note('Later', '', 'Note-later');
  expect(references(linking)).toEqual(['Note-later']);
  expect(references(mentioning)).toEqual([]);
});

it('indexes a link from a note in the trash, and to one', () => {
  const binned = note('Binned');
  const source = note('Source', link('Note-later'));
  untypedWrite(source).trash();
  note('Later', '', 'Note-later');
  expect(references(source)).toEqual(['Note-later']);

  untypedWrite(binned).trash();
  const linker = note('Linker', link(binned));
  expect(references(linker)).toEqual([binned]);
});

it('derives the targets of a note written before it recorded any', () => {
  const target = note('Target');
  const old = untypedCreate('Note', noteRow({ title: 'Old', content: link(target) })).id();
  syncReferences(old, link(target));
  expect(linkTargets(old)).toEqual([target]);
  expect(references(old)).toEqual([target]);
});
