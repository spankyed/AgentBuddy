import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeKind, NodeEntity, NodeCreateInput } from "../config/types";

/*─────────────────────────────────────────────────────────────────
 * Simple INSTANCE_OF relationship management
 * No enrichment, no string manipulation, just clean CRUD
 *─────────────────────────────────────────────────────────────────*/

// Map node types to their relation fields and target entities
const RELATION_CONFIG = {
  action: {
    field: 'actionId',
    targetEntity: EARS.Entity.Action,
  },
  llm: {
    field: 'promptTemplateId',
    targetEntity: EARS.Entity.Prompt,
  }
} as const;

/*─────────────────────────────────────────────────────────────────
 * Extract relation fields from node input
 *─────────────────────────────────────────────────────────────────*/
export function extractNodeRelations(nodeType: NodeKind, input: NodeCreateInput) {
  const config = RELATION_CONFIG[nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) {
    return { relations: {}, attributes: input };
  }
  
  const relationId = (input as any)[config.field];
  const attributes = { ...input };
  delete (attributes as any)[config.field];
  
  return {
    relations: { [config.field]: relationId },
    attributes
  };
}

/*─────────────────────────────────────────────────────────────────
 * Create INSTANCE_OF relationships for a node
 *─────────────────────────────────────────────────────────────────*/
export function createNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  const config = RELATION_CONFIG[nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) return;
  
  const relationId = relations[config.field];
  if (relationId) {
    tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
  }
}

/*─────────────────────────────────────────────────────────────────
 * Update INSTANCE_OF relationships for a node
 *─────────────────────────────────────────────────────────────────*/
export function updateNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  const config = RELATION_CONFIG[nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) return;
  
  if (config.field in relations) {
    // Remove existing INSTANCE_OF relationships
    tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
    
    // Add new relationship if provided
    const relationId = relations[config.field];
    if (relationId) {
      tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
    }
  }
}

/*─────────────────────────────────────────────────────────────────
 * Get the related entity ID for a node (used during read)
 *─────────────────────────────────────────────────────────────────*/
export function getNodeRelation(node: NodeEntity): NodeEntity {
  const config = RELATION_CONFIG[node.nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) {
    return node;
  }
  
  // Get the linked entity ID via INSTANCE_OF relationship
  const linkedId = qx(node.id)
    .links(EARS.RelKind.INSTANCE_OF, config.targetEntity)
    .map(({ id }) => id)[0];
  
  if (linkedId) {
    return {
      ...node,
      [config.field]: linkedId
    };
  }
  
  return node;
}