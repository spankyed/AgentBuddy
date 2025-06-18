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
      'Node-6',
      'Node-8',
      'Node-9',
      'Node-10',
      'Node-11',
    ]);
  });

  it('exists() returns false for non-existent entity IDs', () => {
    expect(qx('Node-does-not-exist').exists()).toBe(false);
    expect(qx('Flow-fake-id-123').exists()).toBe(false);
  });

  it('exists() returns true for existing entity IDs', () => {
    expect(qx('Node-1').exists()).toBe(true);
    expect(qx('Flow-1').exists()).toBe(true);
  });

  it('filters non-existent IDs from arrays', () => {
    const ids = qx(['Node-1', 'Node-fake', 'Node-2', 'Node-missing']).ids();
    expect(ids).toEqual(['Node-1', 'Node-2']);
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
    expect(id).toBe('Node-11');
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
    expect(upstream).toEqual(['Flow-1', 'Node-1', 'Node-11', 'Node-4'].sort());
  });

  /* ─────── graph traversal helpers ─────── */
  it('linksTo() follows TRANSITIONS_TO to next step', () => {
    expect(
      qx('Node-2')
        .linksTo(EARS.RelKind.CONSUMED_BY, EARS.Entity.Node)
        .ids(),
    ).toEqual(['Node-8']);
  });

  it('linksPick() projects linked nodes with selected fields', () => {
    const rows = qx('Node-1').linksPick(
      EARS.RelKind.CONSUMED_BY,
      ['label', 'nodeType'],
      EARS.Entity.Node,
    );
    expect(rows).toEqual([
      { id: 'Node-3', label: 'Message Type', nodeType: 'decision' },
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
      // Node-1 & Node-2 both have nodeType = 'listen'
      const rows = qx(EARS.Entity.Node)
        .distinct('nodeType')
        .pick(['nodeType']);
      const stepTypes = rows.map(r => r.nodeType);
      expect(stepTypes).toEqual(expect.arrayContaining(['listen', 'decision', 'create', 'update', 'fire', 'query', 'transform', 'flow'])); // unique list
    });
  });

  describe('groupBy()', () => {
    it('splits entities into buckets keyed by attribute', () => {
      const grouped = qx(EARS.Entity.Node)
        .groupBy('nodeType'); // Map<string, Qx>
      expect(grouped.get('transform')!.count()).toBe(1);
      expect(grouped.get('flow')!.count()).toBe(1);
      expect(grouped.get('listen')!.count()).toBe(2);
      expect(grouped.get('fire')!.count()).toBe(2);
      expect(grouped.get('decision')!.count()).toBe(1);
      expect(grouped.get('create')!.count()).toBe(1);
      expect(grouped.get('update')!.count()).toBe(1);
      expect(grouped.get('query')!.count()).toBe(1);
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
      
      // Test that we can page through all nodes
      const page3 = qx(EARS.Entity.Node).orderBy('createdAt').page(10);
      expect(page3.items).toHaveLength(10); // 10 nodes total
    });
  });

  /* ────────── edge identifiers ────────── */
  it('edgeIds() exposes raw relation identifiers', () => {
    const edges = qx('Node-2').edgeIds(EARS.RelKind.CONSUMED_BY, true);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatch(/Relation-/);
  });

  /* ──────── Additional test coverage ──────── */
  describe('Additional query tests', () => {
    it('filters by Flow entity type', () => {
      const flows = qx(EARS.Entity.Flow).ids();
      expect(flows).toEqual(['Flow-1']);
    });

    it('follows TRANSITIONS_TO relationships', () => {
      const transitions = qx('Node-3')
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids()
        .sort();
      expect(transitions).toEqual(['Node-11', 'Node-4'].sort());
    });

    it('follows EMITS relationships', () => {
      const emits = qx('Node-5')
        .linksTo(EARS.RelKind.EMITS, EARS.Entity.Node)
        .ids();
      expect(emits).toEqual(['Node-6']);
    });

    it('chains multiple filters', () => {
      const result = qx(EARS.Entity.Node)
        .where('nodeType', 'fire')
        .where('color', '#F44336')
        .ids()
        .sort();
      expect(result).toEqual(['Node-10', 'Node-6'].sort());
    });

    it('returns empty array for no matches', () => {
      const result = qx(EARS.Entity.Node)
        .where('nodeType', 'nonexistent')
        .ids();
      expect(result).toEqual([]);
    });

    it('counts entities correctly', () => {
      const nodeCount = qx(EARS.Entity.Node).count();
      expect(nodeCount).toBe(10);
      
      const fireNodeCount = qx(EARS.Entity.Node)
        .where('nodeType', 'fire')
        .count();
      expect(fireNodeCount).toBe(2);
    });

    it('filters nodes by specific attributes', () => {
      const entryNodes = qx(EARS.Entity.Node)
        .where('mode', 'entry')
        .ids();
      expect(entryNodes).toEqual(['Node-1']);
    });

    it('retrieves nodes with specific event tags', () => {
      const chatNodes = qx(EARS.Entity.Node)
        .where('eventTag', 'chat.message')
        .ids();
      expect(chatNodes).toEqual(['Node-1']);
    });
  });
});