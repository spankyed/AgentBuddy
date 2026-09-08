import type { NodeBase } from '@abuddy/sdk/build';

declare module '@abuddy/sdk/types' {
  interface NodeEntityRegistry { listener: ListenerNode }
}

export interface ListenerNode extends NodeBase {
  nodeType: 'listener';
  scope: 'global' | 'local' | 'entry';
  eventType: string;
  trackKey?: string;
  debounceMs?: number;
}
