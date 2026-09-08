import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

declare module '@abuddy/sdk/types' {
  interface NodeEntityRegistry { update: UpdateNode }
}

export interface DSLUpdateNode extends DSLNodeBase {
  type: 'update';
  target: string;
  onMissing?: 'fail' | 'ignore' | 'create';
}

export interface UpdateNode extends NodeBase {
  nodeType: 'update';
  entityId: string;
  onMissing?: 'fail' | 'ignore' | 'create';
}
