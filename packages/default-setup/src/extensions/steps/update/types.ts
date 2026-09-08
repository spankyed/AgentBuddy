import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@/features/flows/be/config/types';

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
