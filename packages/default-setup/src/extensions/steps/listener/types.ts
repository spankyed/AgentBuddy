import type { NodeBase } from '@/features/flows/be/config/types';

export interface ListenerNode extends NodeBase {
  nodeType: 'listener';
  scope: 'global' | 'local' | 'entry';
  eventType: string;
  trackKey?: string;
  debounceMs?: number;
}
