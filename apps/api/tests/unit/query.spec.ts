/**
 * query.spec.ts – unit‑tests for qx.ts using the real attribute‑store.
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
  // If your attribute‑store exposes a reset/clear utility, call it first.
  //   import { clearStore } from '@/shared/ears/attribute-storage/testing';
  //   clearStore();
  loadMockData();
});

describe('qx – fluent query DSL', () => {
  /* ───────────── seed handling ───────────── */
  it('returns *all* entities when called with no seed', () => {
    // expect(qx().count()).toBe(flowRows.entity.length); // ! relations are entities too
    expect(qx().count()).toBe(flowRows.entity.length + flowRows.relation.length);
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
      .where('stepType' as any, 'llm')
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

  it('linkRows() projects linked nodes with selected fields', () => {
    const rows = qx('Step-1').linkRows(
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

  /* ────────── edge identifiers ────────── */
  it('edgeIds() exposes raw relation identifiers', () => {
    const edges = qx('Step-2').edgeIds(EARS.RelKind.TRANSITIONS_TO, true);
    // We don’t know the exact ID format that tx.link() uses, but we
    // know there should be exactly one edge and it should mention the kind.
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatch(/Relation-/);
  });
});