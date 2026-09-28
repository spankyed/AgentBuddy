import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { FieldMapping } from '@abuddy/sdk/steps';

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
  fieldMappings?: FieldMapping[];
}
