import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

declare module '@abuddy/sdk/types' {
  interface NodeEntityRegistry { kill: KillNode }
}

export interface DSLKillNode extends DSLNodeBase {
  type: 'kill';
}

export interface KillNode extends NodeBase {
  nodeType: 'kill';
}
