import type { NodeBase } from '@apack/sdk';

export interface ListenerNode extends NodeBase {
  nodeType: 'listener';
  scope: 'global' | 'local' | 'entry';
  eventType: string;
  trackKey?: string;
  debounceMs?: number;
}
