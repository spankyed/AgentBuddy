import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';

export interface DSLStampNode extends DSLNodeBase {
  type: 'stamp';
  label?: string;
  note?: string;
}

export interface StampNode extends NodeBase {
  nodeType: 'stamp';
  note?: string;
}
