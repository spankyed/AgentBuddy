import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeKind, NodeEntity, NodeCreateInput, NodeEntityEnriched } from "../types";

/*─────────────────────────────────────────────────────────────────
 * Node Handler Interface
 * Each handler manages the specific logic for a node type
 *─────────────────────────────────────────────────────────────────*/
interface NodeHandler<T extends NodeEntity = NodeEntity> {
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
 * Action Node Handler
 *─────────────────────────────────────────────────────────────────*/
const actionNodeHandler: NodeHandler = {
  extractRelations(input) {
    const { actionId, ...attributes } = input;
    return {
      relations: { actionId },
      attributes
    };
  },
  
  createRelations(nodeId, relations) {
    if (relations.actionId) {
      tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relations.actionId as EARS.EntityId);
    }
  },
  
  updateRelations(nodeId, relations) {
    if ('actionId' in relations) {
      // Remove existing INSTANCE_OF relationships
      tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
      
      // Add new relationship if provided
      if (relations.actionId) {
        tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relations.actionId as EARS.EntityId);
      }
    }
  },
  
  enrichNode(node) {
    // Get the linked action via INSTANCE_OF relationship
    const actionId = qx(node.id)
      .links(EARS.RelKind.INSTANCE_OF, EARS.Entity.Action)
      .map(({ id }) => id)[0];
    
    if (actionId) {
      const action = qx(actionId).pickOne(['id', 'label', 'description']);
      if (action) {
        return {
          ...node,
          actionId: action.id,
          actionName: action.label
        };
      }
    }
    return node;
  }
};

/*─────────────────────────────────────────────────────────────────
 * LLM Node Handler
 *─────────────────────────────────────────────────────────────────*/
const llmNodeHandler: NodeHandler = {
  extractRelations(input) {
    const { promptTemplateId, ...attributes } = input;
    return {
      relations: { promptTemplateId },
      attributes
    };
  },
  
  createRelations(nodeId, relations) {
    if (relations.promptTemplateId) {
      tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relations.promptTemplateId as EARS.EntityId);
    }
  },
  
  updateRelations(nodeId, relations) {
    if ('promptTemplateId' in relations) {
      // Remove existing INSTANCE_OF relationships
      tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
      
      // Add new relationship if provided
      if (relations.promptTemplateId) {
        tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relations.promptTemplateId as EARS.EntityId);
      }
    }
  },
  
  enrichNode(node) {
    // Get the linked prompt template via INSTANCE_OF relationship
    const promptId = qx(node.id)
      .links(EARS.RelKind.INSTANCE_OF, EARS.Entity.Prompt)
      .map(({ id }) => id)[0];
    
    if (promptId) {
      const prompt = qx(promptId).pickOne(['id', 'name']);
      if (prompt) {
        return {
          ...node,
          promptTemplateId: prompt.id,
          promptTemplateName: prompt.name
        };
      }
    }
    return node;
  }
};

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