import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}
