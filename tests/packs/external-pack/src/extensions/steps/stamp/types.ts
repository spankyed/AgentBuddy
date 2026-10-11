import type { NodeBase } from '@apackdev/sdk';
import type { DSLNodeBase } from '@apackdev/sdk/build';

export interface DSLStampNode extends DSLNodeBase {
  type: 'stamp';
  label?: string;
  note?: string;
}

export interface StampNode extends NodeBase {
  nodeType: 'stamp';
  note?: string;
}
