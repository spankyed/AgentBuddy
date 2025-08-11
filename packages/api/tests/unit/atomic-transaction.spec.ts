/**
 * atomic-transaction.spec.ts – unit tests for atomic transaction support
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { atomicTx, withTransaction } from '@/core/utils/ears/helpers/atomic-transaction';
import { qx } from '@/core/utils/ears/helpers/query';
import { EARS } from '@/core/types';
import { getAttr, getAttrs, getRoles, createEntity, destroyEntity } from '@/core/utils/ears/attribute-storage';

describe('AtomicTransaction', () => {
  let tx: ReturnType<typeof atomicTx>;
  
  beforeEach(() => {
    tx = atomicTx();
  });

  describe('entity creation', () => {
    it('creates entities and returns their IDs immediately', () => {
      const nodeId = tx.create(EARS.Entity.Node);
      const flowId = tx.create(EARS.Entity.Flow);
      
      expect(nodeId).toMatch(/^Node-/);
      expect(flowId).toMatch(/^Flow-/);
      expect(tx.createdEntityCount).toBe(2);
    });

    it('rollback marks transaction as rolled back', () => {
      const nodeId = tx.create(EARS.Entity.Node);
      tx.put(nodeId, 'label', 'Test Node');
      
      // Entity should exist before rollback
      expect(qx(nodeId).exists()).toBe(true);

      tx.rollback();

      // Entity should be gone after rollback
      expect(qx(nodeId).exists()).toBe(false);
    });
  });

  describe('attribute operations', () => {
    let nodeId: EARS.EntityId;
    
    beforeEach(() => {
      nodeId = tx.create(EARS.Entity.Node);
    });

    it('put() replaces attributes on commit', () => {
      tx.put(nodeId, 'label', 'Test')
        .put(nodeId, EARS.AttrKind.Custom('type'), 'decision');
      
      tx.commit();
      
      // Attributes visible after commit
      expect(getAttr(nodeId, EARS.AttrKind.Custom('label'))).toBe('Test');
      expect(getAttr(nodeId, EARS.AttrKind.Custom('type'))).toBe('decision');
      
      // Test that put replaces the value
      const tx2 = atomicTx();
      tx2.put(nodeId, 'label', 'Updated');
      tx2.commit();
      
      expect(getAttr(nodeId, EARS.AttrKind.Custom('label'))).toBe('Updated');
      expect(getAttrs(nodeId, EARS.AttrKind.Custom('label'))).toHaveLength(1);
    });
    
    it('add() appends multiple values', () => {
      tx.add(nodeId, 'tags', 'frontend')
        .add(nodeId, 'tags', 'backend')
        .add(nodeId, 'tags', 'database');
      
      tx.commit();
      
      const tags = getAttrs(nodeId, EARS.AttrKind.Custom('tags'));
      expect(tags).toEqual(['frontend', 'backend', 'database']);
    });

    it('batchPut() adds multiple attributes', () => {
      tx.batchPut(nodeId, {
        label: 'Batch Test',
        x: 100,
        y: 200,
        color: '#FF5733'
      });
      
      tx.commit();
      
      expect(getAttr(nodeId, EARS.AttrKind.Custom('label'))).toBe('Batch Test');
      expect(getAttr(nodeId, EARS.AttrKind.Custom('x'))).toBe(100);
      expect(getAttr(nodeId, EARS.AttrKind.Custom('y'))).toBe(200);
      expect(getAttr(nodeId, EARS.AttrKind.Custom('color'))).toBe('#FF5733');
    });

    it('merge() updates object attributes', () => {
      tx.put(nodeId, 'config', { a: 1, b: 2 });
      tx.commit();
      
      const tx2 = atomicTx();
      tx2.merge(nodeId, 'config', { b: 3, c: 4 });
      tx2.commit();
      
      expect(getAttr(nodeId, EARS.AttrKind.Custom('config'))).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('drop() removes attributes', () => {
      tx.put(nodeId, 'temp', 'value');
      tx.commit();
      
      const tx2 = atomicTx();
      tx2.drop(nodeId, 'temp');
      tx2.commit();
      
      expect(getAttr(nodeId, EARS.AttrKind.Custom('temp'))).toBeNull();
    });

    it('dropIf() conditionally removes attributes', () => {
      tx.add(nodeId, 'status', 'draft')
        .add(nodeId, 'status', 'published');
      tx.commit();
      
      const tx2 = atomicTx();
      tx2.dropIf(nodeId, 'status', 'draft');
      tx2.commit();
      
      const statuses = qx(nodeId).pick(['status'])[0];
      expect(statuses.status).toBe('published');
    });
  });

  describe('role operations', () => {
    let nodeId: EARS.EntityId;
    
    beforeEach(() => {
      nodeId = tx.create(EARS.Entity.Node);
      tx.commit();
      tx = atomicTx();
    });

    it('grant() adds roles on commit', () => {
      tx.grant(nodeId, 'admin')
        .grant(nodeId, 'active');
      
      tx.commit();
      
      expect(getRoles(nodeId)).toContain('admin');
      expect(getRoles(nodeId)).toContain('active');
    });

    it('revoke() removes roles', () => {
      tx.grant(nodeId, 'admin').commit();
      
      const tx2 = atomicTx();
      tx2.revoke(nodeId, 'admin');
      tx2.commit();
      
      expect(getRoles(nodeId)).not.toContain('admin');
    });
  });

  describe('relation operations', () => {
    let src: EARS.EntityId;
    let tgt: EARS.EntityId;
    
    beforeEach(() => {
      src = tx.create(EARS.Entity.Node);
      tgt = tx.create(EARS.Entity.Node);
      tx.commit();
      tx = atomicTx();
    });

    it('link() creates relations on commit', () => {
      tx.link(src, EARS.RelKind.RESPONDER, tgt);
      
      tx.commit();
      
      expect(qx(src).linksTo(EARS.RelKind.RESPONDER, EARS.Entity.Node).ids()).toContain(tgt);
    });

    it('link() prevents self-loops', () => {
      expect(() => tx.link(src, EARS.RelKind.RESPONDER, src)).toThrow('source and target cannot be the same');
    });

    it('linkOne() creates idempotent relations', () => {
      tx.linkOne(src, EARS.RelKind.TRANSITIONS_TO, tgt);
      tx.commit();
      
      const tx2 = atomicTx();
      tx2.linkOne(src, EARS.RelKind.TRANSITIONS_TO, tgt);
      tx2.commit();
      
      const links = qx(src).linksTo(EARS.RelKind.TRANSITIONS_TO, EARS.Entity.Node).ids();
      expect(links).toEqual([tgt]);
    });

    it('unlink() removes relations', () => {
      tx.link(src, EARS.RelKind.RESPONDER, tgt);
      tx.commit();
      
      const relIds = qx(src).edgeIds(EARS.RelKind.RESPONDER, true);
      expect(relIds).toHaveLength(1);
      
      const tx2 = atomicTx();
      tx2.unlink(relIds[0]);
      tx2.commit();
      
      expect(qx(src).linksTo(EARS.RelKind.RESPONDER, EARS.Entity.Node).ids()).toEqual([]);
    });
  });

  describe('transaction lifecycle', () => {
    it('commit() makes all changes permanent', () => {
      const nodeId = tx.create(EARS.Entity.Node);
      tx.put(nodeId, 'label', 'Committed')
        .grant(nodeId, 'permanent');
      
      expect(tx.isCommitted).toBe(false);
      tx.commit();
      expect(tx.isCommitted).toBe(true);
      
      expect(getAttr(nodeId, EARS.AttrKind.Custom('label'))).toBe('Committed');
      expect(getRoles(nodeId)).toContain('permanent');
    });

    it('rollback() sets transaction state', () => {
      const nodeId = tx.create(EARS.Entity.Node);
      tx.put(nodeId, 'label', 'Will be rolled back');
      
      expect(tx.isRolledBack).toBe(false);
      tx.rollback();
      expect(tx.isRolledBack).toBe(true);
    });

    it('cannot use transaction after commit', () => {
      tx.commit();
      expect(() => tx.put('Node-1', 'test', 'value')).toThrow('Transaction already committed');
    });

    it('cannot use transaction after rollback', () => {
      tx.rollback();
      expect(() => tx.put('Node-1', 'test', 'value')).toThrow('Transaction already rolled back');
    });

    it('cannot rollback after commit', () => {
      tx.commit();
      expect(() => tx.rollback()).toThrow('Cannot rollback committed transaction');
    });
  });

  describe('error handling', () => {
    it('rollback prevents commit', () => {
      const nodeId = tx.create(EARS.Entity.Node);
      tx.put(nodeId, 'label', 'Test');
      
      tx.rollback();
      
      expect(() => tx.commit()).toThrow('Transaction already rolled back');
    });

    it('tracks operation count', () => {
      expect(tx.operationCount).toBe(0);
      
      const nodeId = tx.create(EARS.Entity.Node);
      expect(tx.operationCount).toBe(1);
      
      tx.put(nodeId, 'a', 1)
        .put(nodeId, 'b', 2)
        .grant(nodeId, 'test');
      
      expect(tx.operationCount).toBe(4);
    });
  });

  describe('withTransaction helper', () => {
    it('auto-commits on success', async () => {
      const nodeId = await withTransaction(tx => {
        const id = tx.create(EARS.Entity.Node);
        tx.put(id, 'label', 'Auto-committed');
        return id;
      });
      
      expect(getAttr(nodeId, EARS.AttrKind.Custom('label'))).toBe('Auto-committed');
    });

    it('auto-rollback on error', async () => {
      await expect(
        withTransaction(tx => {
          tx.create(EARS.Entity.Node);
          tx.put('Node-1', 'label', 'Will fail');
          throw new Error('Intentional error');
        })
      ).rejects.toThrow('Intentional error');
    });

    it('works with async operations', async () => {
      const result = await withTransaction(async tx => {
        const id = tx.create(EARS.Entity.Node);
        await new Promise(resolve => setTimeout(resolve, 10));
        tx.put(id, 'async', true);
        return id;
      });
      
      expect(getAttr(result, EARS.AttrKind.Custom('async'))).toBe(true);
    });
  });
}); 