import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@/features/flows/be/config/types';

export interface DSLKillNode extends DSLNodeBase {
  type: 'kill';
}

export interface KillNode extends NodeBase {
  nodeType: 'kill';
}
