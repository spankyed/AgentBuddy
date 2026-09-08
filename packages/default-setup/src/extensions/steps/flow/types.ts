import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@abuddy/sdk/build';

export interface DSLFlowNode extends DSLNodeBase {
  type: 'flow';
  flow: string;
  inherit?: boolean;
  map?: Record<string, string>;
}

export interface FlowNode extends NodeBase {
  nodeType: 'flow';
  flowRef: string;
  propagateCtx?: boolean;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
}
