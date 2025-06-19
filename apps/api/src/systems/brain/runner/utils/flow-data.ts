import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { FlowEntity, ListenNode, NodeEntity } from '@/systems/flows/types';

/**
 * Get the root flow and its event listener nodes
 */
export function getRootFlowData() {
  // Get root flow
  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(["id", "label", "flowType", "status", "createdAt"]) as FlowEntity | undefined;
    
  if (!rootFlow) {
    throw new Error("No root flow found");
  }

  // Get all nodes that have EVENT_TRACE relation from the root flow
  const eventNodes = qx(rootFlow.id)
    .linksPick(
      EARS.RelKind.EVENT_TRACE,
      ["id", "nodeType", "label", "eventType", "mode"] as const,
      [EARS.Entity.Node]
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];

  // Find the entry event node - check mode instead of role
  const entryNode = eventNodes.find(node => node.mode === 'entry');

  if (!entryNode) {
    throw new Error("No entry event node found");
  }

  return { rootFlow, eventNodes, entryNode };
}

/**
 * Get event nodes for a specific flow
 */
export function getFlowEventNodes(flowId: EARS.EntityId): ListenNode[] {
  return qx(flowId)
    .linksPick(
      EARS.RelKind.EVENT_TRACE,
      ["id", "nodeType", "label", "eventType", "mode"] as const,
      [EARS.Entity.Node]
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];
}

/**
 * Get responder node for an event node
 */
export function getEventResponderNode(eventNodeId: EARS.EntityId): NodeEntity | undefined {
  const responderLinks = qx(eventNodeId)
    .links(EARS.RelKind.RESPONDER, [EARS.Entity.Node]);
  
  if (responderLinks.length > 0) {
    return qx(responderLinks[0].id)
      .pickOne(["id", "nodeType", "label"]) as NodeEntity;
  }
  
  return undefined;
}

/**
 * Get next nodes via TRANSITIONS_TO relation
 */
export function getNextNodes(nodeId: EARS.EntityId): NodeEntity[] {
  const nextLinks = qx(nodeId)
    .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);
  
  return nextLinks.map(link => 
    qx(link.id).pickOne(["id", "nodeType", "label"]) as NodeEntity
  );
} 