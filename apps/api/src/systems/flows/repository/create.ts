import { tx } from "@/shared/ears/helpers/transaction";
import { EARS } from "@/shared/ears/types";
import type { FlowEntity, NodeEntity, NodeCreateInput } from "../types";
import { extractNodeRelations, createNodeRelations } from "./node-relations";
import { getTimestamp, generateShortCode, generateLabelWithCount } from "@/shared/ears/helpers/entity-utils";
import { NODE_DEFAULTS, FLOW_DEFAULTS, FLOW_ROLES, FLOW_ENTRY_NODE } from "./constants";

export function createFlow(flow?: Partial<FlowEntity>): FlowEntity {
  const ts = getTimestamp();
  const shortCode = generateShortCode(EARS.Entity.Flow, 'F');
  const label = flow?.label || generateLabelWithCount('New Flow', EARS.Entity.Flow);

  const newFlow: Omit<FlowEntity, 'id'> = {
    entityType: EARS.Entity.Flow,
    shortCode,
    label,
    description: flow?.description || FLOW_DEFAULTS.DESCRIPTION,
    flowType: flow?.flowType || FLOW_DEFAULTS.TYPE,
    createdAt: ts,
    updatedAt: ts,
  };

  const id = tx(EARS.Entity.Flow)
    .batchPut(newFlow)
    .id();
  
  return { id, ...newFlow };
}

export function createFlowWithEntryNode(flow?: Partial<FlowEntity>): { flow: FlowEntity; entryNode: NodeEntity } {
  // Create the flow
  const newFlow = createFlow(flow);
  
  // Create the entry node
  const entryNode = createNode(newFlow.id, {
    nodeType: FLOW_ENTRY_NODE.TYPE,
    label: FLOW_ENTRY_NODE.LABEL,
    color: FLOW_ENTRY_NODE.COLOR,
    mode: FLOW_ENTRY_NODE.MODE,
    eventType: FLOW_ENTRY_NODE.EVENT_TYPE,
  } as Partial<NodeEntity>);
  
  // Establish entry node role
  tx(entryNode.id).grant(FLOW_ROLES.ENTRY_EVENT).id();
  
  // Create EVENT_TRACE relationship from flow to entry node
  tx(newFlow.id).link(EARS.RelKind.EVENT_TRACE, entryNode.id);
  
  return { flow: newFlow, entryNode };
}

export function createNode(flowId: EARS.EntityId, nodeData: NodeCreateInput): NodeEntity {
  const ts = getTimestamp();
  
  // Determine node type (default to 'action' if not specified)
  const nodeType = nodeData.nodeType || NODE_DEFAULTS.TYPE;
  
  // Extract relations and attributes based on node type
  const { relations, attributes } = extractNodeRelations(nodeType, nodeData);
  
  // Ensure the node has the required fields
  const newNode: Omit<NodeEntity, 'id'> = {
    entityType: EARS.Entity.Node,
    nodeType,
    label: attributes.label || NODE_DEFAULTS.LABEL,
    description: attributes.description || NODE_DEFAULTS.DESCRIPTION,
    createdAt: ts,
    updatedAt: ts,
    ...attributes,
  } as Omit<NodeEntity, 'id'>;

  // Create the node
  const nodeId = tx(EARS.Entity.Node)
    .batchPut(newNode)
    .id();
  
  // Establish relationship from flow to node
  tx(flowId).link(EARS.RelKind.CONTAINS, nodeId);
  
  // Create node-specific relationships
  createNodeRelations(nodeType, nodeId, relations);
  
  return { id: nodeId, ...newNode } as NodeEntity;
}

export function createEdge(sourceId: EARS.EntityId, targetId: EARS.EntityId): void {
  // In EARS, edges are relationships, not entities
  // We just create the relationship between the nodes
  tx(sourceId).link(EARS.RelKind.TRANSITIONS_TO, targetId);
}