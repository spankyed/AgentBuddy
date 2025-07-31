/**
 * transaction.spec.ts – unit-tests for tx.ts using the real attribute-store.
 *
 * Run:  npx vitest
 */
import { beforeAll, describe, expect, it, beforeEach } from 'vitest';
import { tx, SafeLinkOptions } from '@/shared/ears/helpers/transaction';
import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import { flowRows } from '@/systems/flows/repository/mock-data';
import { loadData } from '@/systems/_backend/load-initial-data';
import { getAttr, getRoles, getAll } from '@/shared/ears/attribute-storage';

/* ──────────────────────────────────────────────────────────────── *
 *  Boot the store ONCE for the whole suite. If you have a helper
 *  to clear/teardown the store, call it here before seeding.
 * ──────────────────────────────────────────────────────────────── */
beforeAll(() => {
  //   import { clearStore } from '@/shared/ears/attribute-storage/testing';
  //   clearStore();
  loadData();
});

describe('tx – fluent mutation DSL', () => {
  /* ───────────── entity creation ───────────── */
  describe('entity creation vs referencing', () => {
    it('creates a new entity when passed an entity type', () => {
      const entity = tx(EARS.Entity.Node);
      const id = entity.id();
      expect(id).toMatch(/^Node-/);
      
      // Verify entity exists in store
      const found = qx(id).first();
      expect(found).toBe(id);
    });

    it('references an existing entity when passed an entity ID', () => {
      const existingId = 'Node-1';
      const entity = tx(existingId);
      expect(entity.id()).toBe(existingId);
    });

    it('returns unique IDs for multiple new entities', () => {
      const entity1 = tx(EARS.Entity.Node);
      const entity2 = tx(EARS.Entity.Node);
      expect(entity1.id()).not.toBe(entity2.id());
    });
  });

  /* ───────────── attribute operations ───────────── */
  describe('attribute operations', () => {
    let testNode: ReturnType<typeof tx>;
    
    beforeEach(() => {
      testNode = tx(EARS.Entity.Node);
    });

    it('put() adds attributes to an entity', () => {
      testNode
        .put('label', 'Test Node')
        .put('nodeType', 'transform')
        .put(EARS.AttrKind.Custom('priority'), 'high');

      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('label'))).toBe('Test Node');
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('nodeType'))).toBe('transform');
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('priority'))).toBe('high');
    });

    it('put() adds multiple values for the same attribute', () => {
      testNode
        .put('label', 'Original')
        .put('label', 'Updated');

      // getAttr returns the first value by default
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('label'))).toBe('Original');
      // getAttr with index 1 returns the second value
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('label'), 1)).toBe('Updated');
    });

    it('merge() updates object attributes', () => {
      testNode
        .put(EARS.AttrKind.Custom('config'), { a: 1, b: 2 })
        .merge(EARS.AttrKind.Custom('config'), { b: 3, c: 4 });

      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('config'))).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('drop() removes attributes', () => {
      testNode
        .batchPut({ label: 'Test', nodeType: 'fire' })
        .drop(EARS.AttrKind.Custom('label'));

      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('label'))).toBeNull();
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('nodeType'))).toBe('fire');
    });

    it('dropIf() conditionally removes attributes', () => {
      testNode
        .batchPut({ status: 'draft', label: 'Test' })
        .dropIf(EARS.AttrKind.Custom('status'), 'draft')
        .dropIf(EARS.AttrKind.Custom('label'), 'NotTest');

      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('status'))).toBeNull();
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('label'))).toBe('Test');
    });

    it('supports method chaining', () => {
      const result = testNode
        .put('a', 1)
        .put('b', 2)
        .drop(EARS.AttrKind.Custom('a'))
        .put('c', 3);

      expect(result).toBe(testNode);
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('a'))).toBeNull();
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('b'))).toBe(2);
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('c'))).toBe(3);
    });

    it('batchPut() adds multiple attributes at once', () => {
      const result = testNode.batchPut({
        label: 'Batch Test',
        nodeType: 'decision',
        x: 100
      });

      expect(result).toBe(testNode); // chainable
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('label'))).toBe('Batch Test');
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('nodeType'))).toBe('decision');
      expect(getAttr(testNode.id(), EARS.AttrKind.Custom('x'))).toBe(100);
    });
  });

  /* ───────────── role operations ───────────── */
  describe('role operations', () => {
    let testNode: ReturnType<typeof tx>;
    
    beforeEach(() => {
      testNode = tx(EARS.Entity.Node);
    });

    it('grant() adds roles to an entity', () => {
      testNode
        .grant('active')
        .grant('selected_node');

      const roles = getRoles(testNode.id());
      expect(roles).toContain('active');
      expect(roles).toContain('selected_node');
    });

    it('grant() is idempotent - does not duplicate roles', () => {
      testNode
        .grant('admin')
        .grant('admin')
        .grant('admin');

      const roles = getRoles(testNode.id());
      const adminCount = roles.filter(r => r === 'admin').length;
      expect(adminCount).toBe(1);
    });

    it('revoke() removes roles from an entity', () => {
      testNode
        .grant('role1')
        .grant('role2')
        .revoke('role1');

      const roles = getRoles(testNode.id());
      expect(roles).not.toContain('role1');
      expect(roles).toContain('role2');
    });

    it('revoke() is safe when role does not exist', () => {
      expect(() => testNode.revoke('nonexistent')).not.toThrow();
    });

    it('ensure() grants role exclusively', () => {
      const node1 = tx(EARS.Entity.Node).grant('exclusive_role');
      const node2 = tx(EARS.Entity.Node).grant('exclusive_role');
      const node3 = tx(EARS.Entity.Node);

      // Ensure node3 has the role exclusively
      node3.ensure('exclusive_role');

      expect(getRoles(node1.id())).not.toContain('exclusive_role');
      expect(getRoles(node2.id())).not.toContain('exclusive_role');
      expect(getRoles(node3.id())).toContain('exclusive_role');
    });

    it('ensure() with scope limits role revocation', () => {
      const node1 = tx(EARS.Entity.Node).grant('scoped_role');
      const node2 = tx(EARS.Entity.Node).grant('scoped_role');
      const node3 = tx(EARS.Entity.Node).grant('scoped_role');
      const node4 = tx(EARS.Entity.Node);

      // Ensure node4 has the role, but only revoke from node1 and node2
      node4.ensure('scoped_role', [node1.id(), node2.id()]);

      expect(getRoles(node1.id())).not.toContain('scoped_role');
      expect(getRoles(node2.id())).not.toContain('scoped_role');
      expect(getRoles(node3.id())).toContain('scoped_role'); // Not in scope
      expect(getRoles(node4.id())).toContain('scoped_role');
    });
  });

  /* ───────────── relation operations ───────────── */
  describe('relation operations', () => {
    let source: ReturnType<typeof tx>;
    let target: ReturnType<typeof tx>;
    
    beforeEach(() => {
      source = tx(EARS.Entity.Node);
      target = tx(EARS.Entity.Node);
    });

    it('link() creates relations between entities', () => {
      source.link(EARS.RelKind.TRANSITIONS_TO, target.id());

      const linkedNodes = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linkedNodes).toContain(target.id());
    });

    it('link() prevents self-loops', () => {
      expect(() => 
        source.link(EARS.RelKind.TRANSITIONS_TO, source.id())
      ).toThrow('source and target cannot be the same');
    });

    it('link() can include additional info', () => {
      const info = { condition: 'status === "ready"' };
      source.link(EARS.RelKind.TRANSITIONS_TO, target.id(), info);

      // This would need access to the relation info, which might require
      // additional query methods or direct attribute access
    });

    it('relPatch() updates existing relations', () => {
      const newTarget = tx(EARS.Entity.Node);
      
      // First create a relation
      source.link(EARS.RelKind.TRANSITIONS_TO, target.id());
      
      // Get the relation ID
      const relationIds = qx(source.id()).edgeIds(EARS.RelKind.TRANSITIONS_TO, true);
      expect(relationIds).toHaveLength(1);
      
      // Update the relation
      source.relPatch(relationIds[0], { 
        targetEntity: newTarget.id(),
        info: { updated: true } 
      });

      // Verify the update
      const linkedNodes = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linkedNodes).toContain(newTarget.id());
      expect(linkedNodes).not.toContain(target.id());
    });

    it('unlink() removes relations', () => {
      source.link(EARS.RelKind.TRANSITIONS_TO, target.id());
      
      const relationIds = qx(source.id()).edgeIds(EARS.RelKind.TRANSITIONS_TO, true);
      expect(relationIds).toHaveLength(1);
      
      source.unlink(relationIds[0]);
      
      const linkedAfter = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linkedAfter).not.toContain(target.id());
    });
  });

  /* ───────────── edge store operations ───────────── */
  describe('edge store operations', () => {
    let source: ReturnType<typeof tx>;
    let target1: ReturnType<typeof tx>;
    let target2: ReturnType<typeof tx>;
    
    beforeEach(() => {
      source = tx(EARS.Entity.Node);
      target1 = tx(EARS.Entity.Node);
      target2 = tx(EARS.Entity.Node);
    });

    it('linkOne() creates idempotent relations', () => {
      // Link to first target multiple times - should only create one
      source.linkOne(EARS.RelKind.TRANSITIONS_TO, target1.id());
      source.linkOne(EARS.RelKind.TRANSITIONS_TO, target1.id());
      
      let linked = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linked).toEqual([target1.id()]);
      
      // Link to second target - both should exist
      source.linkOne(EARS.RelKind.TRANSITIONS_TO, target2.id());
      
      linked = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids()
        .sort();
      expect(linked).toEqual([target1.id(), target2.id()].sort());
    });

    it('linkOne() prevents self-loops', () => {
      expect(() => 
        source.linkOne(EARS.RelKind.TRANSITIONS_TO, source.id())
      ).toThrow('source and target cannot be the same');
    });

    it('patchLink() updates specific edge', () => {
      source.linkOne(EARS.RelKind.TRANSITIONS_TO, target1.id(), { priority: 1 });
      
      source.patchLink(EARS.RelKind.TRANSITIONS_TO, target1.id(), {
        newTarget: target2.id(),
        newInfo: { priority: 2 }
      });
      
      const linked = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linked).toEqual([target2.id()]);
    });

    it('unlinkIf() removes specific relations', () => {
      source.link(EARS.RelKind.TRANSITIONS_TO, target1.id());
      source.link(EARS.RelKind.TRANSITIONS_TO, target2.id());
      
      source.unlinkIf(EARS.RelKind.TRANSITIONS_TO, target1.id());
      
      const linked = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linked).toContain(target2.id());
      expect(linked).not.toContain(target1.id());
    });

    it('unlinkIf() removes all relations of a kind when no target specified', () => {
      source.link(EARS.RelKind.TRANSITIONS_TO, target1.id());
      source.link(EARS.RelKind.TRANSITIONS_TO, target2.id());
      
      source.unlinkIf(EARS.RelKind.TRANSITIONS_TO);
      
      const linked = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(linked).toHaveLength(0);
    });

    it('unlinkWhere() removes relations by criteria', () => {
      const target3 = tx(EARS.Entity.Node);
      
      source.link(EARS.RelKind.TRANSITIONS_TO, target1.id());
      source.link(EARS.RelKind.TRANSITIONS_TO, target2.id());
      source.link(EARS.RelKind.TRANSITIONS_TO, target3.id());
      
      // Remove all RESPONDER relations
      source.unlinkWhere({ kind: EARS.RelKind.TRANSITIONS_TO });
      
      const consumedBy = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(consumedBy).toHaveLength(0);
      
      const transitionsTo = qx(source.id())
        .linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node)
        .ids();
      expect(transitionsTo).toEqual([target2.id()]);
    });
  });

  /* ───────────── safeLink operations ───────────── */
  describe('safeLink operations', () => {
    let node1: ReturnType<typeof tx>;
    let node2: ReturnType<typeof tx>;
    let node3: ReturnType<typeof tx>;
    
    beforeEach(() => {
      node1 = tx(EARS.Entity.Thread);
      node2 = tx(EARS.Entity.Thread);
      node3 = tx(EARS.Entity.Thread);
    });

    it('safeLink() prevents CONTAINS cycles', () => {
      const containsOptions: SafeLinkOptions = {
        acyclicGroup: [EARS.RelKind.CONTAINS]
      };
      
      // Create a chain: node1 -> node2 -> node3
      node1.safeLink(EARS.RelKind.CONTAINS, node2.id(), containsOptions);
      node2.safeLink(EARS.RelKind.CONTAINS, node3.id(), containsOptions);
      
      // Try to create a cycle: node3 -> node1
      expect(() => node3.safeLink(EARS.RelKind.CONTAINS, node1.id(), containsOptions))
        .toThrow('Cannot create a contains relation that would form a cycle');
      
      // Verify the cycle was not created
      const node3Links = qx(node3.id()).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Thread).ids();
      expect(node3Links).not.toContain(node1.id());
    });

    it('safeLink() prevents dependency cycles across BLOCKS and DEPENDS_ON', () => {
      const dependencyOptions: SafeLinkOptions = {
        acyclicGroup: [EARS.RelKind.BLOCKS, EARS.RelKind.DEPENDS_ON]
      };
      
      // Create a dependency chain
      node1.safeLink(EARS.RelKind.BLOCKS, node2.id(), dependencyOptions);
      node2.safeLink(EARS.RelKind.DEPENDS_ON, node3.id(), dependencyOptions);
      
      // Try to create a cycle: node3 blocks node1
      expect(() => node3.safeLink(EARS.RelKind.BLOCKS, node1.id(), dependencyOptions))
        .toThrow('Cannot create a blocks relation that would form a cycle within [blocks, depends_on]');
      
      // Try with DEPENDS_ON too
      expect(() => node3.safeLink(EARS.RelKind.DEPENDS_ON, node1.id(), dependencyOptions))
        .toThrow('Cannot create a depends_on relation that would form a cycle within [blocks, depends_on]');
    });

    it('safeLink() creates symmetric relations for RELATES_TO', () => {
      node1.safeLink(EARS.RelKind.RELATES_TO, node2.id(), { symmetric: true });
      
      // Check both directions
      expect(qx(node1.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(node2.id());
      expect(qx(node2.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(node1.id());
    });

    it('safeLink() creates symmetric relations for DUPLICATES', () => {
      node1.safeLink(EARS.RelKind.DUPLICATES, node2.id(), { symmetric: true });
      
      // Check both directions
      expect(qx(node1.id()).linksTo(EARS.RelKind.DUPLICATES, EARS.Entity.Thread).ids())
        .toContain(node2.id());
      expect(qx(node2.id()).linksTo(EARS.RelKind.DUPLICATES, EARS.Entity.Thread).ids())
        .toContain(node1.id());
    });

    it('safeLink() prevents self-loops', () => {
      expect(() => node1.safeLink(EARS.RelKind.CONTAINS, node1.id()))
        .toThrow('source and target cannot be the same');
    });

    it('safeLink() without options behaves like linkOne', () => {
      // RESPONDER without options - regular one-way link
      node1.safeLink(EARS.RelKind.TRANSITIONS_TO, node2.id());
      
      // Check it's only one-way
      expect(qx(node1.id()).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Thread).ids())
        .toContain(node2.id());
      expect(qx(node2.id()).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Thread).ids())
        .not.toContain(node1.id());
    });

    it('safeLink() supports combined info and config in options', () => {
      node1.safeLink(EARS.RelKind.DUPLICATES, node2.id(), {
        info: { reason: "it's just duplicate content" },
        symmetric: true
      });
      
      // Verify the link exists in both directions
      expect(qx(node1.id()).linksTo(EARS.RelKind.DUPLICATES, EARS.Entity.Thread).ids())
        .toContain(node2.id());
      expect(qx(node2.id()).linksTo(EARS.RelKind.DUPLICATES, EARS.Entity.Thread).ids())
        .toContain(node1.id());
    });

    it('safeLink() is chainable', () => {
      const result = node1
        .safeLink(EARS.RelKind.TRANSITIONS_TO, node2.id())
        .put('label', 'Chained');
      
      expect(result).toBe(node1);
      expect(getAttr(node1.id(), EARS.AttrKind.Custom('label'))).toBe('Chained');
    });

    it('safeLink() supports various option combinations', () => {
      const node4 = tx(EARS.Entity.Thread);
      const node5 = tx(EARS.Entity.Thread);
      
      // Case 1: Just symmetric flag
      node1.safeLink(EARS.RelKind.RELATES_TO, node2.id(), { symmetric: true });
      expect(qx(node2.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(node1.id());
      
      // Case 2: Just info
      node3.safeLink(EARS.RelKind.TRANSITIONS_TO, node4.id(), { 
        info: { priority: 'high' }
      });
      expect(qx(node3.id()).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Thread).ids())
        .toContain(node4.id());
      expect(qx(node4.id()).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Thread).ids())
        .not.toContain(node3.id()); // Not symmetric
      
      // Case 3: Both info and symmetric
      node4.safeLink(EARS.RelKind.DUPLICATES, node5.id(), { 
        info: { reason: 'test' },
        symmetric: true 
      });
      expect(qx(node4.id()).linksTo(EARS.RelKind.DUPLICATES, EARS.Entity.Thread).ids())
        .toContain(node5.id());
      expect(qx(node5.id()).linksTo(EARS.RelKind.DUPLICATES, EARS.Entity.Thread).ids())
        .toContain(node4.id());
    });
  });

  /* ───────────── entity lifecycle ───────────── */
  describe('entity lifecycle', () => {
    it('destroy() removes entity from store', () => {
      const entity = tx(EARS.Entity.Node)
        .put('label', 'To be destroyed')
        .grant('test-role');
      
      const id = entity.id();
      
      // Verify entity exists before destroy
      expect(qx(EARS.Entity.Node).ids()).toContain(id);
      expect(getAttr(id, EARS.AttrKind.Custom('label'))).toBe('To be destroyed');
      expect(getRoles(id)).toContain('test-role');
      
      entity.destroy();
      
      // Verify entity is removed after destroy
      expect(qx(EARS.Entity.Node).ids()).not.toContain(id);
      // Attributes should be gone
      expect(getAttr(id, EARS.AttrKind.Custom('label'))).toBeNull();
      // Roles should be gone
      expect(getRoles(id)).toEqual([]);
    });

    it('destroy() returns undefined to prevent further chaining', () => {
      const entity = tx(EARS.Entity.Node);
      const result = entity.destroy();
      expect(result).toBeUndefined();
    });
  });

  /* ───────────── integration tests ───────────── */
  describe('complex operations', () => {
    it('builds a complete entity with all operations', () => {
      const relatedNode = tx(EARS.Entity.Node).put('label', 'Related');
      
      const complexNode = tx(EARS.Entity.Node)
        .batchPut({
          label: 'Complex Node',
          nodeType: 'transform',
          status: 'active'
        })
        .merge(EARS.AttrKind.Custom('config'), { timeout: 5000 })
        .grant('primary')
        .grant('selected_node')
        .link(EARS.RelKind.TRANSITIONS_TO, relatedNode.id())
        .linkOne(EARS.RelKind.TRANSITIONS_TO, relatedNode.id());
      
      const id = complexNode.id();
      const roles = getRoles(id);
      const consumedBy = qx(id).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node).ids();
      const transitionsTo = qx(id).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node).ids();
      
      expect(getAttr(id, EARS.AttrKind.Custom('label'))).toBe('Complex Node');
      expect(getAttr(id, EARS.AttrKind.Custom('nodeType'))).toBe('transform');
      expect(getAttr(id, EARS.AttrKind.Custom('status'))).toBe('active');
      expect(getAttr(id, EARS.AttrKind.Custom('config'))).toEqual({ timeout: 5000 });
      expect(roles).toContain('primary');
      expect(roles).toContain('selected_node');
      expect(consumedBy).toContain(relatedNode.id());
      expect(transitionsTo).toContain(relatedNode.id());
    });

    it('handles operations on existing entities from mock data', () => {
      // Use an existing node from mock data
      const existingNode = tx('Node-1')
        .put('modified', true)
        .grant('updated');
      
      expect(existingNode.id()).toBe('Node-1');
      expect(getAttr('Node-1', EARS.AttrKind.Custom('modified'))).toBe(true);
      expect(getRoles('Node-1')).toContain('updated');
    });
  });
}); 