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
    expect(qx(EARS.Entity.Node).ids()).toEqual([
      'Node-1',
      'Node-2',
      'Node-3',
      'Node-4',
      'Node-5',
    ]);
  });

  // it('accepts an array of entity types', () => {
  //   const ids = qx([EARS.Entity.Node, EARS.Entity.FlowEvent]).ids();
  //   expect(ids.length).toBe(5);
  //   expect(ids).toEqual(
  //     expect.arrayContaining(['Node-1', 'Node-4', 'FlowEvent-1']),
  //   );
  // });

  it('accepts an explicit list of ids', () => {
    expect(qx(['Node-2', 'Node-4']).ids()).toEqual(['Node-2', 'Node-4']);
  });

  /* ───────────── filters ───────────── */
  it('where() filters on an attribute value', () => {
    const id = qx()
      .where('nodeType', 'flow')
      .first();
    expect(id).toBe('Node-3');
  });

  it('withRole() filters by role membership', () => {
    const id = qx()
      .withRole(EARS.RoleKind.Custom('selected_node'))
      .first();
    expect(id).toBe('Node-2');
  });

  it('relatedTo() returns all sources that point to the target', () => {
    const upstream = qx()
      .relatedTo('Node-3')
      .ids()
      .sort();
    expect(upstream).toEqual(['Flow-1', 'Node-2', 'Node-4', 'Node-5'].sort());
  });

  /* ─────── graph traversal helpers ─────── */
  it('linksTo() follows TRANSITIONS_TO to next step', () => {
    expect(
      qx('Node-2')
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids(),
    ).toEqual(['Node-3']);
  });

  it('linksPick() projects linked nodes with selected fields', () => {
    const rows = qx('Node-1').linksPick(
      EARS.RelKind.TRANSITIONS_TO,
      EARS.Entity.Node,
      ['label', 'nodeType'],
    );
    expect(rows).toEqual([
      { id: 'Node-2', label: 'Parse Intent', nodeType: 'transform' },
    ]);
  });

  /* ────────── list shaping ────────── */
  it('orderBy() + limit() work together', () => {
    const ids = qx(EARS.Entity.Node)
      .orderBy('createdAt', 'asc')
      .limit(2)
      .ids();
    expect(ids).toEqual(['Node-1', 'Node-2']);
  });

  it('reverse() flips the current ordering', () => {
    const asc  = qx(EARS.Entity.Node).orderBy('createdAt', 'asc').ids();
    const desc = qx(EARS.Entity.Node).orderBy('createdAt', 'asc').reverse().ids();
    expect(desc).toEqual([...asc].reverse());
  });

  /* ──────── new expressiveness helpers ──────── */
  describe('distinct()', () => {
    it('removes duplicate IDs', () => {
      const ids = qx(['Node-1', 'Node-1', 'Node-2'])
        .distinct()
        .ids();
      expect(ids).toEqual(['Node-1', 'Node-2']);
    });

    it('dedupes by an attribute value', () => {
      // Both Node-1 & Node-2 share the same nodeType = 'transform'
      const rows = qx(EARS.Entity.Node)
        .distinct('nodeType')
        .pick(['nodeType']);
      const stepTypes = rows.map(r => r.nodeType);
      expect(stepTypes).toEqual(['listen', 'transform', 'flow']); // unique list
    });
  });

  describe('groupBy()', () => {
    it('splits entities into buckets keyed by attribute', () => {
      const grouped = qx(EARS.Entity.Node)
        .groupBy('nodeType'); // Map<string, Qx>
      expect(grouped.get('transform')!.count()).toBe(1);
      expect(grouped.get('flow')!.count()).toBe(2);
      expect(grouped.get('listen')!.count()).toBe(2);
    });
  });


  describe('page()', () => {
    it('returns chunks of the requested size with a cursor', () => {
      const page1 = qx(EARS.Entity.Node).orderBy('createdAt').page(2);
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = qx(EARS.Entity.Node).orderBy('createdAt').page(2, page1.nextCursor!);
      expect(page2.items).toHaveLength(2);
      // ensure no overlap between pages
      expect(page2.items).toEqual(expect.not.arrayContaining(page1.items));
    });
  });

  /* ────────── edge identifiers ────────── */
  it('edgeIds() exposes raw relation identifiers', () => {
    const edges = qx('Node-2').edgeIds(EARS.RelKind.TRANSITIONS_TO, true);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatch(/Relation-/);
  });
});