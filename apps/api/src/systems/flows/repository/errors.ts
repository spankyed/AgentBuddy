import { EARS } from "@/shared/ears/types";

/*─────────────────────────────────────────────────────────────────
 * Custom error classes for better error handling
 *─────────────────────────────────────────────────────────────────*/

export class FlowsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FlowsError';
  }
}

export class NodeNotFoundError extends FlowsError {
  constructor(nodeId: EARS.EntityId) {
    super(`Node ${nodeId} not found`, 'NODE_NOT_FOUND');
  }
}

export class FlowNotFoundError extends FlowsError {
  constructor(flowId: EARS.EntityId) {
    super(`Flow ${flowId} not found`, 'FLOW_NOT_FOUND');
  }
}

export class InvalidNodeTypeError extends FlowsError {
  constructor(nodeType: string) {
    super(`Invalid node type: ${nodeType}`, 'INVALID_NODE_TYPE');
  }
}

export class InvalidRelationshipError extends FlowsError {
  constructor(message: string) {
    super(message, 'INVALID_RELATIONSHIP');
  }
}

export class ValidationError extends FlowsError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}