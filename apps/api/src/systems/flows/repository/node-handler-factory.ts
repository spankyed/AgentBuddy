import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeEntity, NodeCreateInput } from "../types";

/*─────────────────────────────────────────────────────────────────
 * Node Handler Interface
 * Each handler manages the specific logic for a node type
 *─────────────────────────────────────────────────────────────────*/
export interface NodeHandler<T extends NodeEntity = NodeEntity> {
  // Extract relational fields from input
  extractRelations(input: NodeCreateInput): {
    relations: Record<string, any>;
    attributes: Partial<T>;
  };
  
  // Handle creation of relationships
  createRelations(nodeId: EARS.EntityId, relations: Record<string, any>): void;
  
  // Handle updating of relationships
  updateRelations(nodeId: EARS.EntityId, relations: Record<string, any>): void;
  
  // Enrich node with relational data for frontend
  enrichNode(node: T): T & Record<string, any>;
}

/*─────────────────────────────────────────────────────────────────
 * Factory for creating INSTANCE_OF relationship handlers
 * Eliminates duplicate code between action and LLM handlers
 *─────────────────────────────────────────────────────────────────*/
interface InstanceOfHandlerConfig {
  relationField: string;      // e.g., 'actionId' or 'promptTemplateId'
  entityField: string;        // e.g., 'action' or 'promptTemplate'
  targetEntity: EARS.Entity;  // e.g., EARS.Entity.Action
}

/*─────────────────────────────────────────────────────────────────
 * Default handler for nodes without special handling
 *─────────────────────────────────────────────────────────────────*/
export function createDefaultNodeHandler<T extends NodeEntity = NodeEntity>(): NodeHandler<T> {
  return {
    extractRelations(input) {
      return {
        relations: {},
        attributes: input as Partial<T>
      };
    },
    
    createRelations() {
      // No relations to create
    },
    
    updateRelations() {
      // No relations to update
    },
    
    enrichNode(node) {
      return node;
    }
  };
}

export function createInstanceOfHandler<T extends NodeEntity = NodeEntity>(
  config: InstanceOfHandlerConfig
): NodeHandler<T> {
  return {
    extractRelations(input) {
      const relationId = (input as any)[config.relationField];
      const attributes = { ...input };
      delete (attributes as any)[config.relationField];
      
      return {
        relations: { [config.relationField]: relationId },
        attributes: attributes as Partial<T>
      };
    },
    
    createRelations(nodeId, relations) {
      const relationId = relations[config.relationField];
      if (relationId) {
        tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
      }
    },
    
    updateRelations(nodeId, relations) {
      if (config.relationField in relations) {
        // Remove existing INSTANCE_OF relationships
        tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
        
        // Add new relationship if provided
        const relationId = relations[config.relationField];
        if (relationId) {
          tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
        }
      }
    },
    
    enrichNode(node) {
      // Get the linked entity via INSTANCE_OF relationship
      const linkedId = qx(node.id)
        .links(EARS.RelKind.INSTANCE_OF, config.targetEntity)
        .map(({ id }) => id)[0];
      
      if (!linkedId) {
        return node;
      }

      // Fetch the full linked entity
      const linkedEntity = qx(linkedId).pickAll()[0];
      
      if (!linkedEntity) {
        return node;
      }

      // Return the node with both the relation ID and the full entity
      return {
        ...node,
        [config.relationField]: linkedEntity.id,
        [config.entityField]: linkedEntity
      };
    }
  };
}