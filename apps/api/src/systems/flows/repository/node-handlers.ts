import { EARS } from "@/shared/ears/types";
import type { NodeKind, NodeEntity, NodeCreateInput, NodeEntityEnriched, ActionNode, LLMNode } from "../types";
import { createInstanceOfHandler, createDefaultNodeHandler, type NodeHandler } from "./node-handler-factory";


/*─────────────────────────────────────────────────────────────────
 * Create handlers using factory
 *─────────────────────────────────────────────────────────────────*/
const actionNodeHandler = createInstanceOfHandler<ActionNode>({
  relationField: 'actionId',
  entityField: 'action',
  targetEntity: EARS.Entity.Action,
});

const llmNodeHandler = createInstanceOfHandler<LLMNode>({
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
  query: createDefaultNodeHandler(),
  create: createDefaultNodeHandler(),
  update: createDefaultNodeHandler(),
  decision: createDefaultNodeHandler(),
  fire: createDefaultNodeHandler(),
  listen: createDefaultNodeHandler(),
  transform: createDefaultNodeHandler(),
  flow: createDefaultNodeHandler(),
  keep_alive: createDefaultNodeHandler(),
};

/*─────────────────────────────────────────────────────────────────
 * Public API
 *─────────────────────────────────────────────────────────────────*/
export function getNodeHandler(nodeType: NodeKind): NodeHandler {
  return nodeHandlers[nodeType] || createDefaultNodeHandler();
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