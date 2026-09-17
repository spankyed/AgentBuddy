import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';

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
