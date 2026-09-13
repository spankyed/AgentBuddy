import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

export interface DSLKillNode extends DSLNodeBase {
  type: 'kill';
}

export interface KillNode extends NodeBase {
  nodeType: 'kill';
}
