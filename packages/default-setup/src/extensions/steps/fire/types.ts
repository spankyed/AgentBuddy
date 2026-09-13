import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

export interface DSLFireNode extends DSLNodeBase {
  type: 'fire';
  event: string;
  scope?: 'local' | 'global';
  payload?: unknown;
}

export interface FireNode extends NodeBase {
  nodeType: 'fire';
  eventType: string;
  payload?: unknown;
  scope?: 'local' | 'global';
}
