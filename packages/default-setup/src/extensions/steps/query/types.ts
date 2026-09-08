import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@abuddy/sdk/build';

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
