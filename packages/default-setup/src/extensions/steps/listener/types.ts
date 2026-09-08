import type { NodeBase } from '@abuddy/sdk/build';

export interface ListenerNode extends NodeBase {
  nodeType: 'listener';
  scope: 'global' | 'local' | 'entry';
  eventType: string;
  trackKey?: string;
  debounceMs?: number;
}
