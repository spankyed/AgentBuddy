/*─────────────────────────────────────────────────────────────
 * atomic-transaction.ts – ACID transaction support for EARS
 *─────────────────────────────────────────────────────────────*/
import {
  putAttr, addAttr, mergeAttr, dropAttr, dropIf,
  grantRole, revokeRole,
  addRelation, removeRelation, updateRelation,
  createEntity, destroyEntity,
  getAttr, getAttrs, getRoles,
} from "@/core/ears/attribute-storage";
import { edgeStore } from "./edge-store";
import { EARS } from "@/core/types";
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('atomic-transaction');

type Operation = () => void | any;
type Rollback = () => void;

interface TransactionOp {
  op: Operation;
  rollback?: Rollback;
  description?: string; // For debugging
}

export class AtomicTransaction {
  private operations: TransactionOp[] = [];
  private committed = false;
  private rolledBack = false;
  private readonly createdEntities = new Set<EARS.EntityId>();
  private readonly createdRelations = new Set<EARS.EntityId>();
  
  // Entity creation
  create(type: EARS.Entity): EARS.EntityId {
    this.ensureActive();
    
    // Create entity ID and immediately add to store so it exists
    const entityId = createEntity(type);
    // Add a timestamp so the entity exists in the store
    putAttr(entityId, EARS.AttrKind.Custom('__created'), Date.now());
    this.createdEntities.add(entityId);
    
    // No operation needed on commit (already created)
    // Only track for rollback
    this.operations.push({
      op: () => {}, // No-op, entity already exists
      rollback: () => {
        destroyEntity(entityId);
        this.createdEntities.delete(entityId);
      },
      description: `create ${type} (${entityId})`
    });
    
    return entityId;
  }
  
  // Attribute operations
  put(id: EARS.EntityId, kind: EARS.AttrKind | string, value: unknown, allowMultiple = false) {
    this.ensureActive();
    const attrKind = typeof kind === "string" ? EARS.AttrKind.Custom(kind) : kind;
    const previousValues = getAttrs(id, attrKind);
    
    this.operations.push({
      op: () => allowMultiple ? addAttr(id, attrKind, value) : putAttr(id, attrKind, value),
      rollback: previousValues.length > 0
        ? () => {
            // Restore all previous values
            dropAttr(id, attrKind);
            previousValues.forEach(v => addAttr(id, attrKind, v));
          }
        : () => dropAttr(id, attrKind),
      description: `put ${id}.${kind} = ${JSON.stringify(value)}`
    });
    return this;
  }
  
  add(id: EARS.EntityId, kind: EARS.AttrKind | string, value: unknown) {
    this.ensureActive();
    const attrKind = typeof kind === "string" ? EARS.AttrKind.Custom(kind) : kind;
    const previousValues = getAttrs(id, attrKind);
    
    this.operations.push({
      op: () => addAttr(id, attrKind, value),
      rollback: () => {
        // Remove the added value
        const currentValues = getAttrs(id, attrKind);
        if (currentValues.length > previousValues.length) {
          dropAttr(id, attrKind, currentValues.length - 1);
        }
      },
      description: `add ${id}.${kind} += ${JSON.stringify(value)}`
    });
    return this;
  }
  
  batchPut(id: EARS.EntityId, attrs: Record<string, unknown>) {
    this.ensureActive();
    for (const [key, value] of Object.entries(attrs)) {
      this.put(id, key, value);
    }
    return this;
  }

  merge(id: EARS.EntityId, kind: EARS.AttrKind | string, value: unknown, idx = 0) {
    this.ensureActive();
    const attrKind = typeof kind === "string" ? EARS.AttrKind.Custom(kind) : kind;
    const previousValue = getAttr(id, attrKind, idx);
    
    this.operations.push({
      op: () => mergeAttr(id, attrKind, value, idx),
      rollback: previousValue !== null
        ? () => mergeAttr(id, attrKind, previousValue, idx)
        : () => dropAttr(id, attrKind, idx),
      description: `merge ${id}.${kind}[${idx}]`
    });
    return this;
  }
  
  drop(id: EARS.EntityId, kind: EARS.AttrKind | string, idx = 0) {
    this.ensureActive();
    const attrKind = typeof kind === "string" ? EARS.AttrKind.Custom(kind) : kind;
    const previousValue = getAttr(id, attrKind, idx);
    
    this.operations.push({
      op: () => dropAttr(id, attrKind, idx),
      rollback: previousValue !== null
        ? () => putAttr(id, attrKind, previousValue)
        : undefined,
      description: `drop ${id}.${kind}[${idx}]`
    });
    return this;
  }
  
  dropIf(id: EARS.EntityId, kind: EARS.AttrKind | string, criteria: unknown) {
    this.ensureActive();
    const attrKind = typeof kind === "string" ? EARS.AttrKind.Custom(kind) : kind;
    const allValues = getAttrs(id, attrKind);
    
    this.operations.push({
      op: () => dropIf(id, attrKind, criteria),
      rollback: () => {
        // Find which value was removed and restore it
        const currentValues = getAttrs(id, attrKind);
        const removed = allValues.find(v => !currentValues.includes(v));
        if (removed !== undefined) {
          putAttr(id, attrKind, removed);
        }
      },
      description: `dropIf ${id}.${kind} == ${JSON.stringify(criteria)}`
    });
    return this;
  }

  // Role operations
  grant(id: EARS.EntityId, role: string) {
    this.ensureActive();
    const hadRole = getRoles(id).includes(role);
    
    this.operations.push({
      op: () => grantRole(id, role),
      rollback: hadRole ? undefined : () => revokeRole(id, role),
      description: `grant ${id} role: ${role}`
    });
    return this;
  }
  
  revoke(id: EARS.EntityId, role: string) {
    this.ensureActive();
    const hadRole = getRoles(id).includes(role);
    
    this.operations.push({
      op: () => revokeRole(id, role),
      rollback: hadRole ? () => grantRole(id, role) : undefined,
      description: `revoke ${id} role: ${role}`
    });
    return this;
  }

  // Relation operations
  link(src: EARS.EntityId, kind: EARS.RelKind, tgt: EARS.EntityId, info?: unknown) {
    this.ensureActive();
    if (src === tgt) throw new Error("AtomicTransaction.link(): source and target cannot be the same");
    
    let relId: EARS.EntityId;
    
    this.operations.push({
      op: () => {
        relId = addRelation(src, kind, tgt, info);
        this.createdRelations.add(relId);
        return relId;
      },
      rollback: () => {
        if (relId && this.createdRelations.has(relId)) {
          removeRelation(relId);
          this.createdRelations.delete(relId);
        }
      },
      description: `link ${src} -[${kind}]-> ${tgt}`
    });
    return this;
  }
  
  linkOne(src: EARS.EntityId, kind: EARS.RelKind, tgt: EARS.EntityId, info?: unknown) {
    this.ensureActive();
    if (src === tgt) throw new Error("AtomicTransaction.linkOne(): source and target cannot be the same");
    
    // Find existing relations that will be removed
    const existingRelIds = edgeStore.relIds({
      sourceEntity: src,
      relationType: kind,
      targetEntity: tgt
    });
    
    let newRelId: EARS.EntityId;
    
    this.operations.push({
      op: () => {
        newRelId = edgeStore.linkOne(src, kind, tgt, info);
        this.createdRelations.add(newRelId);
        return newRelId;
      },
      rollback: () => {
        if (newRelId) {
          removeRelation(newRelId);
          this.createdRelations.delete(newRelId);
        }
        // Restore any relations that were removed
        existingRelIds.forEach(relId => {
          const detail = getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
          if (detail) {
            addRelation(detail.sourceEntity, detail.relationType, detail.targetEntity, detail.info);
          }
        });
      },
      description: `linkOne ${src} -[${kind}]-> ${tgt}`
    });
    return this;
  }
  
  unlink(relId: EARS.EntityId) {
    this.ensureActive();
    const detail = getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;
    
    this.operations.push({
      op: () => removeRelation(relId),
      rollback: detail
        ? () => addRelation(detail.sourceEntity, detail.relationType, detail.targetEntity, detail.info)
        : undefined,
      description: `unlink relation ${relId}`
    });
    return this;
  }
  
  destroy(id: EARS.EntityId) {
    this.ensureActive();
    // Capture the entire state before destruction
    const entityData = {
      attrs: new Map<EARS.AttrKind, unknown[]>(),
      roles: getRoles(id)
    };
    
    // Capture all attributes
    // This is simplified - in a real implementation we'd iterate through all attribute kinds
    
    this.operations.push({
      op: () => destroyEntity(id),
      rollback: () => {
        // This is complex - would need to recreate the entity with all its data
        logger.warn(`Cannot fully rollback entity destruction for ${id}`);
      },
      description: `destroy ${id}`
    });
    return this;
  }

  // Transaction management
  commit() {
    this.ensureActive();
    
    try {
      // Execute all pending operations
      for (const { op } of this.operations) {
        op();
      }
      this.committed = true;
      return true;
    } catch (error) {
      // Rollback on error
      this.partialRollback(this.operations);
      throw new Error(`Transaction commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  rollback() {
    if (this.committed) {
      throw new Error("Cannot rollback committed transaction");
    }
    
    if (!this.rolledBack) {
      // Execute all rollback operations
      for (let i = this.operations.length - 1; i >= 0; i--) {
        const { rollback, description } = this.operations[i];
        if (rollback) {
          try {
            rollback();
          } catch (error) {
            logger.error(`Rollback error for ${description}:`, { error });
          }
        }
      }
      this.rolledBack = true;
    }
  }
  
  private partialRollback(ops: TransactionOp[]) {
    const errors: Array<{ op: string; error: unknown }> = [];
    
    // Execute rollbacks in reverse order
    for (let i = ops.length - 1; i >= 0; i--) {
      const { rollback, description } = ops[i];
      if (rollback) {
        try {
          rollback();
        } catch (error) {
          errors.push({ op: description || `operation ${i}`, error });
        }
      }
    }
    
    if (errors.length > 0) {
      logger.error("Rollback errors:", { errors });
    }
  }

  private ensureActive() {
    if (this.committed) {
      throw new Error("Transaction already committed");
    }
    if (this.rolledBack) {
      throw new Error("Transaction already rolled back");
    }
  }
  
  // Utility methods
  get isCommitted() {
    return this.committed;
  }
  
  get isRolledBack() {
    return this.rolledBack;
  }
  
  get operationCount() {
    return this.operations.length;
  }
  
  get createdEntityCount() {
    return this.createdEntities.size;
  }
  
  get createdRelationCount() {
    return this.createdRelations.size;
  }
}

// Factory function
export const atomicTx = () => new AtomicTransaction();

// Helper type for transaction functions
export type TransactionFn<T = void> = (tx: AtomicTransaction) => T;

// Execute a function within a transaction
export async function withTransaction<T>(fn: TransactionFn<T | Promise<T>>): Promise<T> {
  const tx = atomicTx();
  try {
    const result = await fn(tx);
    tx.commit();
    return result;
  } catch (error) {
    tx.rollback();
    throw error;
  }
}