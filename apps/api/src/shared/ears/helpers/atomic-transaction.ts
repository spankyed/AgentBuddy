/*─────────────────────────────────────────────────────────────
 * atomic-transaction.ts – ACID transaction support for EARS
 *─────────────────────────────────────────────────────────────*/
import {
  putAttr, mergeAttr, dropAttr,
  grantRole, revokeRole,
  addRelation, removeRelation,
} from "@/shared/ears/attribute-storage";
import { EARS } from "@/shared/ears/types";

type Operation = () => void;
type Rollback = () => void;

export class AtomicTransaction {
  private operations: Array<{ op: Operation; rollback?: Rollback }> = [];
  private committed = false;
  private rolledBack = false;

  // Track created entities and relations for rollback
  private createdEntities = new Set<EARS.EntityId>();
  private createdRelations = new Set<EARS.EntityId>();
  
  putAttr(id: EARS.EntityId, kind: EARS.AttrKind, value: unknown) {
    this.ensureActive();
    const previousValue = getAttr(id, kind);
    
    this.operations.push({
      op: () => putAttr(id, kind, value),
      rollback: previousValue !== null 
        ? () => putAttr(id, kind, previousValue)
        : () => dropAttr(id, kind)
    });
    return this;
  }

  grantRole(id: EARS.EntityId, role: string) {
    this.ensureActive();
    const hadRole = getRoles(id).includes(role);
    
    this.operations.push({
      op: () => grantRole(id, role),
      rollback: hadRole ? undefined : () => revokeRole(id, role)
    });
    return this;
  }

  addRelation(src: EARS.EntityId, kind: string, tgt: EARS.EntityId, info?: unknown) {
    this.ensureActive();
    let relId: EARS.EntityId;
    
    this.operations.push({
      op: () => {
        relId = addRelation(src, kind, tgt, info);
        this.createdRelations.add(relId);
      },
      rollback: () => {
        if (relId) removeRelation(relId);
      }
    });
    return this;
  }

  commit() {
    this.ensureActive();
    
    try {
      // Execute all operations
      for (const { op } of this.operations) {
        op();
      }
      this.committed = true;
    } catch (error) {
      // Auto-rollback on error
      this.rollback();
      throw error;
    }
  }

  rollback() {
    if (this.committed) {
      throw new Error("Cannot rollback committed transaction");
    }
    
    if (!this.rolledBack) {
      // Execute rollbacks in reverse order
      for (let i = this.operations.length - 1; i >= 0; i--) {
        const { rollback } = this.operations[i];
        if (rollback) {
          try {
            rollback();
          } catch (error) {
            console.error("Rollback error:", error);
          }
        }
      }
      this.rolledBack = true;
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
}

// Import these from attribute-storage
import { getAttr, getRoles } from "@/shared/ears/attribute-storage";

// Factory function
export const atomicTx = () => new AtomicTransaction();