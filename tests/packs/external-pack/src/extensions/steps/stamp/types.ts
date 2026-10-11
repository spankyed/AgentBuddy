import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';

export interface DSLStampNode extends DSLNodeBase {
  type: 'stamp';
  label?: string;
  note?: string;
}

export interface StampNode extends NodeBase {
  nodeType: 'stamp';
  note?: string;
}
