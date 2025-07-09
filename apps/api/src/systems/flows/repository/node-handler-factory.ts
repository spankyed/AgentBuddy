import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeHandler } from "./node-handlers";

/*─────────────────────────────────────────────────────────────────
 * Factory for creating INSTANCE_OF relationship handlers
 * Eliminates duplicate code between action and LLM handlers
 *─────────────────────────────────────────────────────────────────*/
interface InstanceOfHandlerConfig {
  relationField: string;      // e.g., 'actionId' or 'promptTemplateId'
  entityField: string;        // e.g., 'action' or 'promptTemplate'
  targetEntity: EARS.Entity;  // e.g., EARS.Entity.Action
}

export function createInstanceOfHandler(config: InstanceOfHandlerConfig): NodeHandler {
  return {
    extractRelations(input) {
      const relationId = (input as any)[config.relationField];
      const attributes = { ...input };
      delete (attributes as any)[config.relationField];
      
      return {
        relations: { [config.relationField]: relationId },
        attributes
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