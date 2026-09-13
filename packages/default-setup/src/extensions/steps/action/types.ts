import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

export interface DSLActionNode extends DSLNodeBase {
  type: 'action';
  action: string;
  map?: Record<string, string>;
  params?: Record<string, any>;
}

export interface ActionNode extends NodeBase {
  nodeType: 'action';
  mode?: 'template' | 'code';
  actionId?: string;
  actionFn?: string;
  params?: Record<string, any>;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
}
