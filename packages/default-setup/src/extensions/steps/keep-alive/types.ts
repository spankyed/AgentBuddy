import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

declare module '@abuddy/sdk/types' {
  interface NodeEntityRegistry { keep_alive: KeepAliveNode }
}

export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}
