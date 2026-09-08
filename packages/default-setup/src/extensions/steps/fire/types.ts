import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@/features/flows/be/config/types';

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
