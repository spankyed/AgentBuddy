import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@/features/flows/be/config/types';

export interface DSLQueryNode extends DSLNodeBase {
  type: 'query';
  prompt: string;
  as?: string;
}

export interface QueryNode extends NodeBase {
  nodeType: 'query';
  prompt: string;
  resultKey?: string;
}
