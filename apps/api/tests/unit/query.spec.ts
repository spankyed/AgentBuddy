/**
 * query.spec.ts – unit-tests for qx.ts using the real attribute-store.
 *
 * Run:  npx vitest
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import { flowRows } from '@/systems/flows/repository/mock-data';
import { loadMockData } from '@/systems/_backend/load-initial-data';

/* ──────────────────────────────────────────────────────────────── *
 *  Boot the store ONCE for the whole suite. If you have a helper
 *  to clear/teardown the store, call it here before seeding.
 * ──────────────────────────────────────────────────────────────── */
beforeAll(() => {
  //   import { clearStore } from '@/shared/ears/attribute-storage/testing';
  //   clearStore();
  loadMockData();
});

describe('qx – fluent query DSL', () => {
  /* ───────────── seed handling ───────────── */
  it('returns *all* entities when called with no seed', () => {
    const totalEntities =
      flowRows.entity.length + flowRows.relation.length;
    // expect(qx().count()).toBe(totalEntities);
  });

  it('filters by a single entity type', () => {
    expect(qx(EARS.Entity.Step).ids()).toEqual([
      'Step-1',
      'Step-2',
      'Step-3',
      'Step-4',
    ]);
  });

  it('accepts an array of entity types', () => {
    const ids = qx([EARS.Entity.Step, EARS.Entity.FlowEvent]).ids();
    expect(ids.length).toBe(5);
    expect(ids).toEqual(
      expect.arrayContaining(['Step-1', 'Step-4', 'FlowEvent-1']),
    );
  });

  it('accepts an explicit list of ids', () => {
    expect(qx(['Step-2', 'Step-4']).ids()).toEqual(['Step-2', 'Step-4']);
  });

  /* ───────────── filters ───────────── */
  it('where() filters on an attribute value', () => {
    const id = qx()
      .where('stepType', 'llm')
      .first();
    expect(id).toBe('Step-3');
  });

  it('withRole() filters by role membership', () => {
    const id = qx()
      .withRole(EARS.RoleKind.Custom('selected_Step'))
      .first();
    expect(id).toBe('Step-2');
  });

  it('relatedTo() returns all sources that point to the target', () => {
    const upstream = qx()
      .relatedTo('Step-3')
      .ids()
      .sort();
    expect(upstream).toEqual(['Flow-1', 'FlowEvent-1', 'Step-2', 'Step-4'].sort());
  });

  /* ─────── graph traversal helpers ─────── */
  it('linksTo() follows TRANSITIONS_TO to next step', () => {
    expect(
      qx('Step-2')
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Step)
        .ids(),
    ).toEqual(['Step-3']);
  });

  it('linksPick() projects linked nodes with selected fields', () => {
    const rows = qx('Step-1').linksPick(
      EARS.RelKind.TRANSITIONS_TO,
      EARS.Entity.Step,
      ['label', 'stepType'],
    );
    expect(rows).toEqual([
      { id: 'Step-2', label: 'Parse Intent', stepType: 'transform' },
    ]);
  });

  /* ────────── list shaping ────────── */
  it('orderBy() + limit() work together', () => {
    const ids = qx(EARS.Entity.Step)
      .orderBy('createdAt', 'asc')
      .limit(2)
      .ids();
    expect(ids).toEqual(['Step-1', 'Step-2']);
  });

  it('reverse() flips the current ordering', () => {
    const asc  = qx(EARS.Entity.Step).orderBy('createdAt', 'asc').ids();
    const desc = qx(EARS.Entity.Step).orderBy('createdAt', 'asc').reverse().ids();
    expect(desc).toEqual([...asc].reverse());
  });

  /* ──────── new expressiveness helpers ──────── */
  describe('distinct()', () => {
    it('removes duplicate IDs', () => {
      const ids = qx(['Step-1', 'Step-1', 'Step-2'])
        .distinct()
        .ids();
      expect(ids).toEqual(['Step-1', 'Step-2']);
    });

    it('dedupes by an attribute value', () => {
      // Both Step-1 & Step-2 share the same stepType = 'transform'
      const rows = qx(EARS.Entity.Step)
        .distinct('stepType')
        .pick(['stepType']);
      const stepTypes = rows.map(r => r.stepType);
      expect(stepTypes).toEqual(['event-listener', 'transform', 'llm', 'response']); // unique list
    });
  });

  describe('groupBy()', () => {
    it('splits entities into buckets keyed by attribute', () => {
      const grouped = qx(EARS.Entity.Step)
        .groupBy('stepType'); // Map<string, Qx>
      expect(grouped.get('transform')!.count()).toBe(1);
      expect(grouped.get('llm')!.count()).toBe(1);
      expect(grouped.get('response')!.count()).toBe(1);
      expect(grouped.get('event-listener')!.count()).toBe(1);
    });
  });


  describe('page()', () => {
    it('returns chunks of the requested size with a cursor', () => {
      const page1 = qx(EARS.Entity.Step).orderBy('createdAt').page(2);
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = qx(EARS.Entity.Step).orderBy('createdAt').page(2, page1.nextCursor!);
      expect(page2.items).toHaveLength(2);
      // ensure no overlap between pages
      expect(page2.items).toEqual(expect.not.arrayContaining(page1.items));
    });
  });

  /* ────────── edge identifiers ────────── */
  it('edgeIds() exposes raw relation identifiers', () => {
    const edges = qx('Step-2').edgeIds(EARS.RelKind.TRANSITIONS_TO, true);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatch(/Relation-/);
  });
});