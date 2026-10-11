import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';
import type { FieldMapping, MapEntry } from '@apack/sdk/steps';

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
