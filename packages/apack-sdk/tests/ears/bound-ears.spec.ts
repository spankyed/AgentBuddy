// The engine operations pack code calls without holding an engine act on the one this process bound, and with none
// bound they throw naming how to bind one
import { afterEach, describe, expect, it } from 'vitest';
import { createEarsEngine, defineEars, type EARS } from '@apackdev/ears';
import {
  _bindEars, boundEars, findRelations, isEntityType, registerRepository, repository, spawn, transact,
  untypedCreate, untypedQuery, untypedUpsert, untypedWrite,
} from '../../src/ears/index.ts';
import { bp } from '@apackdev/ears';

const engineWith = (types: ReadonlySet<string>) => createEarsEngine({ isRelationKind: () => true, isRole: () => true, isEntityType: (name) => types.has(name) });

afterEach(() => { _bindEars(undefined); });

describe('with no engine bound', () => {
  it('every operation throws, naming how to bind one', () => {
    const typed = defineEars<{ Note: { title: string } }, 'Note'>(boundEars);
    const uses: Array<[string, () => unknown]> = [
      ['untypedQuery', () => untypedQuery('Note')],
      ['untypedQuery.ids', () => untypedQuery.ids('Note-1' as EARS.EntityId)],
      ['untypedQuery.all', () => untypedQuery.all()],
      ['untypedCreate', () => untypedCreate('Note')],
      ['untypedUpsert', () => untypedUpsert('Note', 'Note-1' as EARS.EntityId)],
      ['untypedWrite', () => untypedWrite('Note-1' as EARS.EntityId)],
      ['transact', () => transact(() => 1)],
      ['findRelations', () => findRelations()],
      ['isEntityType', () => isEntityType('Note')],
      ['spawn', () => spawn(bp('Note').build())],
      ['registerRepository', () => registerRepository('noteQueries', {})],
      ['repository', () => repository.noteQueries],
      ['a typed facade', () => typed.query('Note')],
      ['boundEars', () => boundEars()],
    ];
    for (const [name, use] of uses) expect(use, name).toThrow('No EARS engine is bound');
  });
});

describe('_bindEars', () => {
  it('points the operations at an engine and returns the one it replaced', () => {
    const first = engineWith(new Set(['Note']));
    const second = engineWith(new Set(['Note', 'Memo']));
    expect(_bindEars(first)).toBeUndefined();
    const id = untypedCreate('Note').set('title', 'first').id();
    expect(isEntityType('Memo')).toBe(false);

    expect(_bindEars(second)).toBe(first);
    expect(untypedQuery('Note').ids()).toEqual([]);
    expect(isEntityType('Memo')).toBe(true);
    expect(boundEars()).toBe(second);

    _bindEars(first);
    expect(defineEars<{ Note: { title: string } }, 'Note'>(boundEars).findAll('Note').map((row) => row.title)).toEqual(['first']);
    expect(first.findById(id)).toMatchObject({ title: 'first' });
  });

  it('reads the bound engine\'s repositories through repository', () => {
    const engine = engineWith(new Set());
    _bindEars(engine);
    const noteQueries = { name: 'notes' };
    registerRepository('noteQueries', noteQueries);
    expect(repository.noteQueries).toBe(noteQueries);
    expect(() => repository.missing).toThrow('"missing" is not registered');
  });
});
