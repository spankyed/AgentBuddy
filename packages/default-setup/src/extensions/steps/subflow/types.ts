import type { NodeBase } from '@apackdev/sdk';
import type { DSLNodeBase } from '@apackdev/sdk/build';
import type { FieldMapping, MapEntry } from '@apackdev/sdk/steps';

export interface DSLFlowNode extends DSLNodeBase {
  type: 'subflow';
  flow: string;
  inherit?: boolean;
  map?: Record<string, MapEntry>;
}

export interface FlowNode extends NodeBase {
  nodeType: 'subflow';
  flowRef: string;
  propagateCtx?: boolean;
  fieldMappings?: FieldMapping[];
}
