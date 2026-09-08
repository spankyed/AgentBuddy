import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@/features/flows/be/config/types';

export interface DSLKeepAliveNode extends DSLNodeBase {
  type: 'keep_alive';
}

export interface KeepAliveNode extends NodeBase {
  nodeType: 'keep_alive';
}
