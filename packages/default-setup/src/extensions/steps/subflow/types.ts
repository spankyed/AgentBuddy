import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

export interface DSLFlowNode extends DSLNodeBase {
  type: 'subflow';
  flow: string;
  inherit?: boolean;
  map?: Record<string, string>;
}

export interface FlowNode extends NodeBase {
  nodeType: 'subflow';
  flowRef: string;
  propagateCtx?: boolean;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
}
