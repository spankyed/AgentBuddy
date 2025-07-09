import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeKind, NodeEntity, NodeCreateInput, NodeEntityEnriched } from "../types";

/*─────────────────────────────────────────────────────────────────
 * Configuration for nodes with INSTANCE_OF relationships
 *─────────────────────────────────────────────────────────────────*/
const NODE_RELATIONS_CONFIG = {
  action: {
    relationField: 'actionId',
    entityField: 'action',
    targetEntity: EARS.Entity.Action,
  },
  llm: {
    relationField: 'promptTemplateId',
    entityField: 'promptTemplate',
    targetEntity: EARS.Entity.Prompt,
  }
} as const;

type RelationConfig = typeof NODE_RELATIONS_CONFIG[keyof typeof NODE_RELATIONS_CONFIG];

/*─────────────────────────────────────────────────────────────────
 * Extract relational fields from node input
 *─────────────────────────────────────────────────────────────────*/
export function extractNodeRelations(nodeType: NodeKind, input: NodeCreateInput) {
  const config = NODE_RELATIONS_CONFIG[nodeType as keyof typeof NODE_RELATIONS_CONFIG];
  
  if (!config) {
    // No special relations for this node type
    return { relations: {}, attributes: input };
  }
  
  const relationId = (input as any)[config.relationField];
  const attributes = { ...input };
  delete (attributes as any)[config.relationField];
  
  return {
    relations: { [config.relationField]: relationId },
    attributes
  };
}

/*─────────────────────────────────────────────────────────────────
 * Create INSTANCE_OF relationships for a node
 *─────────────────────────────────────────────────────────────────*/
export function createNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  const config = NODE_RELATIONS_CONFIG[nodeType as keyof typeof NODE_RELATIONS_CONFIG];
  
  if (!config) return; // No special relations for this node type
  
  const relationId = relations[config.relationField];
  if (relationId) {
    tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
  }
}

/*─────────────────────────────────────────────────────────────────
 * Update INSTANCE_OF relationships for a node
 *─────────────────────────────────────────────────────────────────*/
export function updateNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  const config = NODE_RELATIONS_CONFIG[nodeType as keyof typeof NODE_RELATIONS_CONFIG];
  
  if (!config) return; // No special relations for this node type
  
  if (config.relationField in relations) {
    // Remove existing INSTANCE_OF relationships
    tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
    
    // Add new relationship if provided
    const relationId = relations[config.relationField];
    if (relationId) {
      tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
    }
  }
}

/*─────────────────────────────────────────────────────────────────
 * Enrich node with related entities for frontend
 *─────────────────────────────────────────────────────────────────*/
export function enrichNodeWithRelations<T extends NodeEntity>(node: T): NodeEntityEnriched {
  const config = NODE_RELATIONS_CONFIG[node.nodeType as keyof typeof NODE_RELATIONS_CONFIG];
  
  if (!config) {
    // No enrichment needed for this node type
    return node as NodeEntityEnriched;
  }
  
  // Get the linked entity via INSTANCE_OF relationship
  const linkedId = qx(node.id)
    .links(EARS.RelKind.INSTANCE_OF, config.targetEntity)
    .map(({ id }) => id)[0];
  
  if (!linkedId) {
    return node as NodeEntityEnriched;
  }

  // Fetch the full linked entity
  const linkedEntity = qx(linkedId).pickAll()[0];
  
  if (!linkedEntity) {
    return node as NodeEntityEnriched;
  }

  // Return the node with both the relation ID and the full entity
  return {
    ...node,
    [config.relationField]: linkedEntity.id,
    [config.entityField]: linkedEntity
  } as NodeEntityEnriched;
}