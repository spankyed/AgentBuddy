import type { NodeBase } from '@apackdev/sdk';
import type { DSLNodeBase } from '@apackdev/sdk/build';

export interface DSLKillNode extends DSLNodeBase {
  type: 'kill';
}

export interface KillNode extends NodeBase {
  nodeType: 'kill';
}
