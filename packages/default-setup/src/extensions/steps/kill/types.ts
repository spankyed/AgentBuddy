import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';

export interface DSLKillNode extends DSLNodeBase {
  type: 'kill';
}

export interface KillNode extends NodeBase {
  nodeType: 'kill';
}
