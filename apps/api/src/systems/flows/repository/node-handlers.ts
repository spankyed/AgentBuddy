import { EARS } from "@/shared/ears/types";
import type { NodeKind, NodeEntity, NodeCreateInput, NodeEntityEnriched } from "../types";
import { createInstanceOfHandler } from "./node-handler-factory";

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
 * Default handler for nodes without special handling
 *─────────────────────────────────────────────────────────────────*/
const defaultNodeHandler: NodeHandler = {
  extractRelations(input) {
    return {
      relations: {},
      attributes: input
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

/*─────────────────────────────────────────────────────────────────
 * Create handlers using factory
 *─────────────────────────────────────────────────────────────────*/
const actionNodeHandler = createInstanceOfHandler({
  relationField: 'actionId',
  entityField: 'action',
  targetEntity: EARS.Entity.Action,
});

const llmNodeHandler = createInstanceOfHandler({
  relationField: 'promptTemplateId',
  entityField: 'promptTemplate',
  targetEntity: EARS.Entity.Prompt,
});

/*─────────────────────────────────────────────────────────────────
 * Handler Registry
 *─────────────────────────────────────────────────────────────────*/
const nodeHandlers: Record<NodeKind, NodeHandler> = {
  action: actionNodeHandler,
  llm: llmNodeHandler,
  // All other node types use default handler
  query: defaultNodeHandler,
  create: defaultNodeHandler,
  update: defaultNodeHandler,
  decision: defaultNodeHandler,
  fire: defaultNodeHandler,
  listen: defaultNodeHandler,
  transform: defaultNodeHandler,
  flow: defaultNodeHandler,
  keep_alive: defaultNodeHandler,
};

/*─────────────────────────────────────────────────────────────────
 * Public API
 *─────────────────────────────────────────────────────────────────*/
export function getNodeHandler(nodeType: NodeKind): NodeHandler {
  return nodeHandlers[nodeType] || defaultNodeHandler;
}

export function extractNodeRelations(nodeType: NodeKind, input: NodeCreateInput) {
  return getNodeHandler(nodeType).extractRelations(input);
}

export function createNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  return getNodeHandler(nodeType).createRelations(nodeId, relations);
}

export function updateNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  return getNodeHandler(nodeType).updateRelations(nodeId, relations);
}

export function enrichNodeWithRelations<T extends NodeEntity>(node: T): NodeEntityEnriched {
  return getNodeHandler(node.nodeType).enrichNode(node) as NodeEntityEnriched;
}