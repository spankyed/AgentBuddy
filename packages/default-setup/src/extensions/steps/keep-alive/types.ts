import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';

export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}
