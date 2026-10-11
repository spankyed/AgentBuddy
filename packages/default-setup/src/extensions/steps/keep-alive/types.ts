import type { NodeBase } from '@apackdev/sdk';
import type { DSLNodeBase } from '@apackdev/sdk/build';

export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}
